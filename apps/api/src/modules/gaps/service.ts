// Knowledge-gap refresh (W4-02): load the gap turns in range, embed the redacted
// questions, cluster them in code (domain/gapClustering.ts), name each cluster
// with P-8 and store the snapshot. Runs in the background so a slow local model
// does not hold the request; one refresh at a time (409 while one runs). The
// state is in memory: one API process (modular monolith), no job queue.
import { ObjectId } from 'mongodb';
import type { GapLabelFn } from '../../ai/nodes/gapLabel';
import type { GapClusterDoc } from '../../db/schemas';
import { clusterQuestions, type GapItem, isGapCandidate } from '../../domain/gapClustering';
import { AppError } from '../../lib/errors';
import type { GapsRepository } from './repository';

export interface GapsConfig {
  similarityThreshold: number;
  minClusterSize: number;
  maxExamples: number;
  maxClusters: number;
  defaultRangeDays: number;
}

export interface GapRefreshState {
  status: 'idle' | 'running' | 'failed';
  startedAt: Date | null;
  error: string | null;
}

export interface GapsServiceDeps {
  repository: GapsRepository;
  config: GapsConfig;
  /** Embeds the questions (clustering task type); absent when embeddings are not configured. */
  embed?: (texts: string[]) => Promise<number[][]>;
  label?: GapLabelFn;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

export interface RefreshRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

export interface GapsService {
  /** Refresh range when none is given (config thresholds.gaps). */
  readonly defaultRangeDays: number;
  state(): GapRefreshState;
  /** Starts a refresh; 409 while one runs, 503 without embeddings or a labeller. */
  refresh(range: RefreshRange): GapRefreshState;
  /** Resolves when the running refresh (if any) has finished. For tests and shutdown. */
  idle(): Promise<void>;
}

export function createGapsService(deps: GapsServiceDeps): GapsService {
  const now = deps.now ?? (() => new Date());
  let state: GapRefreshState = { status: 'idle', startedAt: null, error: null };
  let running: Promise<void> = Promise.resolve();

  async function run(range: RefreshRange, embed: NonNullable<GapsServiceDeps['embed']>) {
    const label = deps.label!;
    const candidates = (await deps.repository.loadCandidates(range)).filter(
      (c) => isGapCandidate(c) && c.text.trim().length > 0,
    );
    const vectors = candidates.length > 0 ? await embed(candidates.map((c) => c.text)) : [];
    const byId = new Map(candidates.map((c) => [c.messageId, c]));
    const items: GapItem[] = candidates.map((c, i) => ({
      id: c.messageId,
      text: c.text,
      vector: vectors[i]!,
    }));
    const groups = clusterQuestions(items, deps.config);
    const snapshotAt = now();
    const docs: GapClusterDoc[] = [];
    // One label call at a time: the local model serves one request at a time anyway.
    for (const group of groups) {
      const examples = group.items.slice(0, deps.config.maxExamples);
      const named = await label(examples.map((e) => e.text));
      docs.push({
        _id: new ObjectId(),
        snapshotAt,
        rangeFrom: range.from,
        rangeTo: range.to,
        label: named.label,
        labelled: named.labelled,
        domain: named.domain,
        questionCount: group.items.length,
        exampleQuestions: examples.map((e) => e.text),
        messageIds: group.items.map((m) => new ObjectId(m.id)),
        conversationIds: group.items.map((m) => new ObjectId(byId.get(m.id)!.conversationId)),
        centroid: group.centroid,
        ...(named.llmCall ? { labelCall: named.llmCall } : {}),
      });
    }
    await deps.repository.replaceSnapshot(docs);
  }

  return {
    defaultRangeDays: deps.config.defaultRangeDays,
    state: () => ({ ...state }),

    refresh(range) {
      if (state.status === 'running') {
        throw new AppError('CONFLICT', 'A knowledge-gap refresh is already running');
      }
      const embed = deps.embed;
      if (!embed || !deps.label) {
        throw new AppError(
          'LLM_UNAVAILABLE',
          'Embeddings or the labelling model are not configured',
        );
      }
      state = { status: 'running', startedAt: now(), error: null };
      running = run(range, embed).then(
        () => {
          state = { ...state, status: 'idle' };
        },
        (err: unknown) => {
          deps.onError?.(err);
          state = {
            ...state,
            status: 'failed',
            error: 'The refresh failed (embeddings or storage unavailable). Try again later.',
          };
        },
      );
      return { ...state };
    },

    idle: () => running,
  };
}

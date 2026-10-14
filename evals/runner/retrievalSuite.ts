// Retrieval suite: for each golden case with expected or forbidden documents,
// runs profile-safe hybrid retrieval as the case's user and records the top
// chunks of each mode (vector only, keyword only, fused, and fused reranked by
// P-2: W2-04).
import type { ChunkDoc } from '../../apps/api/src/db/schemas';
import type { AccessProfile } from '../../apps/api/src/ai/retrieval/accessRules';
import type { RetrievalCandidate, RetrievalResult } from '../../apps/api/src/ai/retrieval/retrieve';
import { type GoldenCase, isWorkspaceCategory } from './schema';
import { type CaseRetrieval, RECALL_K, type RetrievedDoc } from './scorers';

export interface RetrievalSuiteDeps {
  profileFor(email: string): AccessProfile | undefined;
  retrieve(query: string, profile: AccessProfile): Promise<RetrievalResult>;
  loadChunks(ids: string[]): Promise<ChunkDoc[]>;
  /** Reranks the fused candidates (P-2) as the case's user; returns chunk IDs best first. */
  rerank(
    query: string,
    userEmail: string,
    candidates: RetrievalCandidate[],
  ): Promise<RerankOutcome>;
  /** Progress callback, one line per case. */
  log?(line: string): void;
  /** Called after each case with the number of cases finished (progress, W4-05). */
  onCaseDone?(completed: number): void | Promise<void>;
}

export interface RerankOutcome {
  chunkIds: string[];
  coverage: string;
  fallback: boolean;
  costUsd: number;
}

export interface SuiteCaseResult {
  goldenCase: GoldenCase;
  retrieval: CaseRetrieval;
  latencyMs: number;
  error: string | null;
  rerank: Omit<RerankOutcome, 'chunkIds'> | null;
}

/** Cases the retrieval suite can score: those naming expected or forbidden documents. */
/** Policy cases with expected or forbidden documents; workspace cases run in the full suite only. */
export function retrievalCases(cases: GoldenCase[]): GoldenCase[] {
  return cases.filter(
    (c) =>
      !isWorkspaceCategory(c.category) &&
      (c.expected.docSlugs.length > 0 || c.expected.forbiddenDocSlugs.length > 0),
  );
}

/** The retrieval query for a case: all user turns (planned clarifications included). */
export const caseQuery = (c: GoldenCase) => c.turns.map((t) => t.content).join(' ');

const toDoc = (chunk: ChunkDoc): RetrievedDoc => ({
  slug: chunk.docSlug,
  documentId: chunk.documentId.toHexString(),
});

export async function runRetrievalSuite(
  cases: GoldenCase[],
  deps: RetrievalSuiteDeps,
): Promise<SuiteCaseResult[]> {
  const results: SuiteCaseResult[] = [];
  for (const c of cases) {
    const base: CaseRetrieval = {
      caseId: c.id,
      category: c.category,
      tags: c.tags,
      expectedRefs: c.expected.docSlugs,
      forbiddenRefs: c.expected.forbiddenDocSlugs,
      results: { vector: [], keyword: [], fused: [], reranked: [] },
    };
    const profile = deps.profileFor(c.userEmail);
    if (!profile) {
      results.push({
        goldenCase: c,
        retrieval: base,
        latencyMs: 0,
        error: `unknown user ${c.userEmail}`,
        rerank: null,
      });
      await deps.onCaseDone?.(results.length);
      continue;
    }
    const started = performance.now();
    let rerank: SuiteCaseResult['rerank'] = null;
    try {
      const { candidates, trace } = await deps.retrieve(caseQuery(c), profile);
      const ids = [...new Set([...trace.vector, ...trace.keyword].slice(0).map((h) => h.chunkId))];
      const chunks = new Map((await deps.loadChunks(ids)).map((ch) => [ch._id.toHexString(), ch]));
      const top = (hits: { chunkId: string }[]) =>
        hits
          .map((h) => chunks.get(h.chunkId))
          .filter((ch): ch is ChunkDoc => ch !== undefined)
          .slice(0, RECALL_K)
          .map(toDoc);
      const reranked = await deps.rerank(caseQuery(c), c.userEmail, candidates);
      const byId = new Map(candidates.map((cand) => [cand.chunk._id.toHexString(), cand.chunk]));
      const { chunkIds, ...rerankInfo } = reranked;
      rerank = rerankInfo;
      base.results = {
        vector: top(trace.vector),
        keyword: top(trace.keyword),
        fused: candidates.slice(0, RECALL_K).map((cand) => toDoc(cand.chunk)),
        reranked: chunkIds
          .map((chunkId) => byId.get(chunkId))
          .filter((ch): ch is ChunkDoc => ch !== undefined)
          .slice(0, RECALL_K)
          .map(toDoc),
      };
      const latencyMs = Math.round(performance.now() - started);
      results.push({ goldenCase: c, retrieval: base, latencyMs, error: null, rerank });
      deps.log?.(
        `${c.id} ${base.results.reranked.map((d) => d.slug).join(', ') || '(none)'} [${reranked.coverage}${reranked.fallback ? ', FALLBACK' : ''}]`,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({
        goldenCase: c,
        retrieval: base,
        latencyMs: Math.round(performance.now() - started),
        error,
        rerank,
      });
      deps.log?.(`${c.id} ERROR ${error}`);
    }
    await deps.onCaseDone?.(results.length);
  }
  return results;
}

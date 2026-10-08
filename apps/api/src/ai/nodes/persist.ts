// persist (code; playbook section 5). Writes the assistant message, the turn
// trace (user text redacted) and the conversation update. Documents are
// validated against the collection schemas on write. A DB failure throws: the
// API reports an error event and stores the message with status error.
import { ObjectId } from 'mongodb';
import type { DecisionThresholds } from '../../domain/decisionRules';
import type { MessageDoc, TurnTraceDoc } from '../../db/schemas';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { LlmCallTrace, State, StateUpdate } from '../graph/state';
import { redactPII } from '../guards/redaction';
import { recordedDecision } from './decide';

export interface PersistDeps {
  conversations: Pick<
    ConversationsRepository,
    'insertMessage' | 'insertTurnTrace' | 'updateConversation' | 'findConversation'
  >;
  thresholds: DecisionThresholds;
  now?: () => Date;
  /** Eval runs (W2-10): stored messages and traces are marked isEval (excluded from dashboards). */
  isEval?: boolean;
}

/** `name@vN#hash` → its parts. */
export function parsePromptRef(ref: string): { name: string; version: number; hash: string } {
  const m = /^(.+)@v(\d+)#(.+)$/.exec(ref);
  return m
    ? { name: m[1]!, version: Number(m[2]), hash: m[3]! }
    : { name: ref, version: 1, hash: 'unknown' };
}

const oid = (id: string) => new ObjectId(id);
const ranked = (hits: { chunkId: string; score: number }[]) =>
  hits.map((h, i) => ({ chunkId: oid(h.chunkId), score: h.score, rank: i + 1 }));

function llmCallDoc(c: LlmCallTrace): TurnTraceDoc['llmCalls'][number] {
  const prompt = parsePromptRef(c.promptRef);
  return {
    node: c.node,
    promptName: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    provider: c.provider,
    model: c.model,
    inputTokens: c.inputTokens ?? 0,
    outputTokens: c.outputTokens ?? 0,
    costUsd: c.costUsd,
    latencyMs: c.latencyMs,
    retries: c.retries,
    error: c.error ?? null,
  };
}

interface LoggedCitations {
  citationsProposed: string[];
  citationsValid: { marker: string; chunkId: string }[];
  citationsRejected: string[];
  numericViolations: string[];
  withdrawn: boolean;
}

export function createPersist(deps: PersistDeps) {
  const now = deps.now ?? (() => new Date());
  return async function persist(state: State): Promise<StateUpdate> {
    const { input, output, profile, trace } = state;
    if (!output) throw new Error('persist: no output to store');
    if (!profile) throw new Error('persist: profile not loaded');
    const decision = recordedDecision(state, deps.thresholds);
    const at = now();
    const conversationId = oid(input.conversationId);
    const messageId = oid(input.assistantMessageId);

    const message: MessageDoc = {
      _id: messageId,
      conversationId,
      role: 'assistant',
      content: output.text,
      decision: decision.value,
      reasonCode: decision.reasonCode,
      citations: output.citations.map((c) => ({
        marker: c.marker,
        chunkId: oid(c.chunkId),
        documentId: oid(c.documentId),
        docTitle: c.docTitle,
        sectionPath: c.sectionPath,
        effectiveDate: new Date(c.effectiveDate),
      })),
      uncovered: output.uncovered,
      ticketDraft: output.draft ? { ...output.draft } : null,
      status: output.withdrawn ? 'withdrawn' : 'complete',
      isEval: deps.isEval ?? false,
      createdAt: at,
    };

    const logged = trace.outputs.citations as LoggedCitations | undefined;
    const r = state.retrieval;
    const conversation = await deps.conversations.findConversation(input.conversationId);
    const turnTrace: TurnTraceDoc = {
      _id: new ObjectId(),
      messageId,
      conversationId,
      userId: oid(input.userId),
      graphRunId: `${input.conversationId}:${input.assistantMessageId}`,
      redactedInput: redactPII(input.text),
      profileSnapshot: {
        country: profile.country,
        employmentType: profile.employmentType,
        accessLevel: profile.accessLevel,
        department: profile.department,
      },
      precheck: state.precheckResult ?? { sensitiveHit: false, safetyHit: false, matchedRules: [] },
      analysis: state.analysis
        ? { ...state.analysis, searchQuery: redactPII(state.analysis.searchQuery) }
        : null,
      retrieval: r
        ? {
            query: redactPII(r.query),
            filter: r.filter,
            vector: ranked(r.vector),
            keyword: ranked(r.keyword),
            fused: ranked(r.fused),
            reranked: r.reranked.map((x) => ({ chunkId: oid(x.chunkId), relevance: x.relevance })),
            coverage: r.coverage,
          }
        : null,
      decision: { ...decision, thresholds: { ...deps.thresholds } },
      output: {
        citationsProposed: logged?.citationsProposed ?? [],
        citationsValid: logged?.citationsValid.map((c) => c.chunkId) ?? [],
        citationsRejected: logged?.citationsRejected ?? [],
        numericViolations: logged?.numericViolations ?? [],
        // The citation check's own verdict: an agent may still reply without the withdrawn text.
        withdrawn: logged?.withdrawn ?? output.withdrawn,
      },
      llmCalls: trace.llmCalls.map(llmCallDoc),
      stepLatencyMs: trace.stepLatencyMs,
      totalLatencyMs: Object.values(trace.stepLatencyMs).reduce((a, b) => a + b, 0),
      ttftMs: trace.llmCalls.find((c) => c.node === 'answer')?.ttftMs ?? null,
      totalCostUsd: trace.llmCalls.reduce((sum, c) => sum + c.costUsd, 0),
      errors: trace.errors,
      restricted: conversation?.restricted ?? false,
      isEval: deps.isEval ?? false,
      createdAt: at,
    };

    await deps.conversations.insertMessage(message);
    await deps.conversations.insertTurnTrace(turnTrace);
    await deps.conversations.updateConversation(
      conversationId,
      {
        lastDecision: decision.value,
        updatedAt: at,
        ...(conversation && !conversation.title && { title: titleFrom(input.text) }),
      },
      { incrementTurns: true },
    );
    return { decision };
  };
}

/** Conversation title from the first message: one line, at most 60 characters. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= 60 ? line : `${line.slice(0, 57).trimEnd()}…`;
}

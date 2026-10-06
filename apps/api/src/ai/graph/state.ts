// Graph state for supportTurnGraph (playbook section 5). One channel per key in
// the section 5 table. Channels without a reducer keep their last value, so
// state persists across turns on the same thread via the checkpointer;
// newTurn() resets the per-turn keys when a turn starts.
import { Annotation } from '@langchain/langgraph';
import type { AccessLevel, Country, Decision, Domain, EmploymentType } from '@sd/shared';
import { z } from 'zod';
import type { AnswerMode, RerankAssessment, TurnAnalysis } from '../schemas';

/** Written by the API before invoke; validated at the graph boundary. */
export const TurnInputSchema = z.strictObject({
  conversationId: z.string().min(1),
  userId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
  forceEscalate: z.boolean(),
});
export type TurnInput = z.infer<typeof TurnInputSchema>;

export interface Profile {
  country: Country;
  employmentType: EmploymentType;
  accessLevel: AccessLevel;
  department: string;
  jobTitle: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TicketFlow {
  active: boolean;
  category?: string;
  clarifyRounds: number;
  fields: Record<string, string>;
  requiredMissing: string[];
}
export const EMPTY_TICKET_FLOW: TicketFlow = {
  active: false,
  clarifyRounds: 0,
  fields: {},
  requiredMissing: [],
};

export interface Precheck {
  sensitiveHit: boolean;
  safetyHit: boolean;
  matchedRules: string[];
}

export interface ScoredChunk {
  chunkId: string;
  score: number;
}

/** A fused candidate the employee may see (access already re-checked). */
export interface SourceChunk {
  chunkId: string;
  documentId: string;
  docSlug: string;
  docTitle: string;
  sectionPath: string[];
  /** ISO date (strings survive checkpoint serialisation unchanged). */
  effectiveDate: string;
  text: string;
  /** RRF score and 1-based fused rank. */
  fusedScore: number;
  rank: number;
}

export interface RankedChunk {
  chunkId: string;
  relevance: number;
  reason: string;
}

/** One labelled source in the final context ([S1]…[S5]) given to P-3. */
export interface ContextSource extends SourceChunk {
  marker: string;
  relevance: number;
}

export interface Retrieval {
  query: string;
  domainHint: Domain | null;
  filter: Record<string, unknown>;
  /** True when embedding failed and only keyword search ran. */
  keywordOnly: boolean;
  vector: ScoredChunk[];
  keyword: ScoredChunk[];
  fused: ScoredChunk[];
  candidates: SourceChunk[];
  /** Set by rerankAssess: every candidate, best first; unknown IDs from the model dropped. */
  reranked: RankedChunk[];
  /** "unknown" when rerank fell back to fused order (rules 7–8 cannot fire). */
  coverage: RerankAssessment['coverage'] | 'unknown';
  missingAspects: string[];
  topRelevance: number;
  context: ContextSource[];
}

export interface DecisionResult {
  value: Decision;
  reasonCode: string;
  rulesFired: string[];
}

export interface Citation {
  marker: string;
  chunkId: string;
}

/** Placeholder until buildDraft (W3) defines the full TicketDraft. */
export interface TicketDraftState {
  domain: Domain | 'unknown';
  category: string;
  summary: string;
  fields: Record<string, string>;
}

export interface Output {
  text: string;
  /** Which answer prompt mode produced the text, when the answer node ran. */
  mode?: AnswerMode;
  citations: Citation[];
  uncovered: string[];
  withdrawn: boolean;
  draft?: TicketDraftState;
  handoff?: { kind: 'out_of_scope' | 'sensitive'; contact: string };
  ticketId?: string;
}

/** Resume value for awaitConfirmation (sent by the confirm/cancel endpoint). */
export const ConfirmationSchema = z.strictObject({
  action: z.enum(['confirm', 'cancel']),
  edits: z.record(z.string(), z.string()).optional(),
  duplicateDecision: z.enum(['create', 'use_existing']).optional(),
});
export type Confirmation = z.infer<typeof ConfirmationSchema>;

export interface LlmCallTrace {
  node: string;
  promptRef: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Provider-level retries inside this call (timeouts, 429, 5xx). */
  retries: number;
  /** native structured output, or the JSON-mode fallback. */
  mode: 'native' | 'json_fallback';
  costUsd: number;
  /** Set when this call's output failed validation. */
  error?: string;
}

export interface Trace {
  /** Nodes in the order they ran this turn (also the path tests assert on). */
  steps: { node: string; latencyMs: number }[];
  stepLatencyMs: Record<string, number>;
  llmCalls: LlmCallTrace[];
  errors: { node: string; code: string; message: string }[];
  /** Per-node outputs logged to turn_traces (precheck, analysis, …); last write wins. */
  outputs: Record<string, unknown>;
  /** Degradation flags, e.g. ANALYSIS_FALLBACK. */
  flags: string[];
}
export const EMPTY_TRACE: Trace = {
  steps: [],
  stepLatencyMs: {},
  llmCalls: [],
  errors: [],
  outputs: {},
  flags: [],
};

/** Sent through the trace channel to clear it at the start of a turn. */
export const RESET_TRACE = { reset: true } as const;
export type TraceUpdate = Partial<Trace> | typeof RESET_TRACE;

/** Append reducer: lists are appended, step latencies summed per node. */
export function traceReducer(current: Trace, update: TraceUpdate): Trace {
  if ('reset' in update) return EMPTY_TRACE;
  const latency = { ...current.stepLatencyMs };
  for (const [node, ms] of Object.entries(update.stepLatencyMs ?? {})) {
    latency[node] = (latency[node] ?? 0) + ms;
  }
  return {
    steps: [...current.steps, ...(update.steps ?? [])],
    stepLatencyMs: latency,
    llmCalls: [...current.llmCalls, ...(update.llmCalls ?? [])],
    errors: [...current.errors, ...(update.errors ?? [])],
    outputs: { ...current.outputs, ...update.outputs },
    flags: [...current.flags, ...(update.flags ?? [])],
  };
}

const lastValue = <T>(initial: T) =>
  Annotation<T>({ reducer: (_current, update) => update, default: () => initial });

export const GraphState = Annotation.Root({
  input: Annotation<TurnInput>(),
  profile: lastValue<Profile | null>(null),
  history: lastValue<HistoryMessage[]>([]),
  ticketFlow: lastValue<TicketFlow>(EMPTY_TICKET_FLOW),
  /** Named precheckResult: LangGraph forbids a channel sharing a node name (ADR-007). */
  precheckResult: lastValue<Precheck | null>(null),
  analysis: lastValue<TurnAnalysis | null>(null),
  retrieval: lastValue<Retrieval | null>(null),
  decision: lastValue<DecisionResult | null>(null),
  output: lastValue<Output | null>(null),
  confirmation: lastValue<Confirmation | null>(null),
  /** Set by decide when it asks a clarifying question; cleared by any other decision. Persists across turns. */
  topicClarified: lastValue<boolean>(false),
  trace: Annotation<Trace, TraceUpdate>({ reducer: traceReducer, default: () => EMPTY_TRACE }),
});
export type State = typeof GraphState.State;
export type StateUpdate = typeof GraphState.Update;

/**
 * The update the API passes to invoke() for a new turn: the validated input
 * plus resets of every per-turn key. Profile, history and ticketFlow persist
 * (loadContext refreshes the first two).
 */
export function newTurn(input: TurnInput): StateUpdate {
  return {
    input: TurnInputSchema.parse(input),
    precheckResult: null,
    analysis: null,
    retrieval: null,
    decision: null,
    output: null,
    confirmation: null,
    trace: RESET_TRACE,
  };
}

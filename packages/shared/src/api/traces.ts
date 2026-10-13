// Trace viewer (W4-03, playbook sections 3, 4 and 10): admins explain any AI
// decision. User text is always the redacted input from the trace; evaluation
// conversations are never listed.
import { z } from 'zod';
import { ConversationStatusSchema, DecisionSchema, PrioritySchema } from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';
import { IsoDateSchema } from './workspace';

export const AdminConversationListQuerySchema = PaginationQuerySchema.extend({
  /** Conversations with at least one turn that had this decision. */
  decision: DecisionSchema.optional(),
  status: ConversationStatusSchema.optional(),
  /** Created on or after / on or before (whole days, UTC). */
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  userId: ObjectIdStringSchema.optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  path: ['from'],
  message: 'from must not be after to',
});
export type AdminConversationListQuery = z.infer<typeof AdminConversationListQuerySchema>;

export const AdminConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  title: z.string(),
  status: ConversationStatusSchema,
  lastDecision: DecisionSchema.nullable(),
  turnCount: z.number().int().min(0),
  restricted: z.boolean(),
  createdAt: z.string(),
});
export type AdminConversation = z.infer<typeof AdminConversationSchema>;

export const AdminConversationListResponseSchema = paginatedSchema(AdminConversationSchema);
export type AdminConversationListResponse = z.infer<typeof AdminConversationListResponseSchema>;

/** What the timeline shows per turn before a trace is opened. */
export const TraceSummarySchema = z.object({
  decision: DecisionSchema,
  reasonCode: z.string(),
  sensitiveHit: z.boolean(),
  safetyHit: z.boolean(),
  coverage: z.enum(['full', 'partial', 'none', 'unknown']).nullable(),
  citationsValid: z.number().int().min(0),
  citationsRejected: z.number().int().min(0),
  withdrawn: z.boolean(),
  totalLatencyMs: z.number().min(0),
  totalCostUsd: z.number().min(0),
  llmCallCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
});
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

export const ConversationTracesResponseSchema = z.object({
  conversation: AdminConversationSchema.extend({
    /** The ticket raised from this conversation, with the priority floor code applied. */
    ticket: z
      .object({
        id: z.string(),
        humanId: z.string(),
        queue: z.string(),
        priority: PrioritySchema,
        aiUrgency: PrioritySchema,
        priorityFloorApplied: z.string().nullable(),
      })
      .nullable(),
  }),
  turns: z.array(
    z.object({
      traceId: z.string(),
      messageId: z.string(),
      createdAt: z.string(),
      /** Redacted (the trace's redactedInput); raw text is never sent. */
      userMessage: z.string(),
      assistantMessage: z.string(),
      traceSummary: TraceSummarySchema,
    }),
  ),
});
export type ConversationTracesResponse = z.infer<typeof ConversationTracesResponseSchema>;

/** A retrieval candidate with its chunk resolved (null text when the chunk is gone). */
export const TraceCandidateSchema = z.object({
  chunkId: z.string(),
  score: z.number(),
  rank: z.number().int().optional(),
  docTitle: z.string().nullable(),
  sectionPath: z.array(z.string()),
  text: z.string().nullable(),
});
export type TraceCandidate = z.infer<typeof TraceCandidateSchema>;

export const TraceLlmCallSchema = z.object({
  node: z.string(),
  promptName: z.string(),
  promptVersion: z.number().int(),
  promptHash: z.string(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number(),
  retries: z.number().int(),
  error: z.string().nullable(),
});

/** Every field of the turn trace (playbook section 3), ids as strings. */
export const TraceDetailSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  graphRunId: z.string(),
  redactedInput: z.string(),
  profileSnapshot: z.object({
    country: z.string(),
    employmentType: z.string(),
    accessLevel: z.string(),
    department: z.string(),
  }),
  precheck: z.object({
    sensitiveHit: z.boolean(),
    safetyHit: z.boolean(),
    matchedRules: z.array(z.string()),
  }),
  analysis: z.record(z.string(), z.unknown()).nullable(),
  retrieval: z
    .object({
      query: z.string(),
      filter: z.record(z.string(), z.unknown()),
      vector: z.array(TraceCandidateSchema),
      keyword: z.array(TraceCandidateSchema),
      fused: z.array(TraceCandidateSchema),
      /** `score` is the rerank relevance. */
      reranked: z.array(TraceCandidateSchema),
      coverage: z.enum(['full', 'partial', 'none', 'unknown']),
    })
    .nullable(),
  decision: z.object({
    value: DecisionSchema,
    reasonCode: z.string(),
    rulesFired: z.array(z.string()),
    thresholds: z.record(z.string(), z.number()),
  }),
  output: z.object({
    citationsProposed: z.array(z.string()),
    citationsValid: z.array(z.string()),
    citationsRejected: z.array(z.string()),
    numericViolations: z.array(z.string()),
    withdrawn: z.boolean(),
  }),
  llmCalls: z.array(TraceLlmCallSchema),
  stepLatencyMs: z.record(z.string(), z.number()),
  totalLatencyMs: z.number(),
  ttftMs: z.number().nullable(),
  totalCostUsd: z.number(),
  errors: z.array(z.object({ node: z.string(), code: z.string(), message: z.string() })),
  restricted: z.boolean(),
  isEval: z.boolean(),
  createdAt: z.string(),
});
export type TraceDetail = z.infer<typeof TraceDetailSchema>;

export const TraceDetailResponseSchema = z.object({ trace: TraceDetailSchema });
export type TraceDetailResponse = z.infer<typeof TraceDetailResponseSchema>;

// Zod schema for every collection (playbook section 3). Repositories validate
// documents with these before every write. IDs are ObjectId, timestamps are
// UTC Date. Unbounded children live in their own collections, never arrays.
import {
  AccessLevelSchema,
  AttendanceStatusSchema,
  ConversationStatusSchema,
  DeductionCodeSchema,
  EmailBodySchema,
  EmailDeliveryModeSchema,
  EmailIssueSourceSchema,
  EmailStatusSchema,
  EmailSubjectSchema,
  IsoDateSchema,
  NotificationKindSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
  TimesheetSourceSchema,
  CountrySchema,
  DecisionSchema,
  DocumentStatusSchema,
  DomainSchema,
  EmploymentTypeSchema,
  EvalRunStatusSchema,
  EvalSuiteSchema,
  EventVisibilitySchema,
  FeedbackRatingSchema,
  IngestStatusSchema,
  MessageRoleSchema,
  MessageStatusSchema,
  PrioritySchema,
  RoleSchema,
  SourceTypeSchema,
  TicketEventTypeSchema,
  TicketStatusSchema,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

export const zObjectId = z.instanceof(ObjectId);
const NonEmpty = z.string().trim().min(1);
const Count = z.number().int().min(0);
const Money = z.number().min(0);
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

// --- users -----------------------------------------------------------------

export const UserSchema = z
  .object({
    _id: zObjectId,
    email: z.email().refine((e) => e === e.toLowerCase(), 'must be lowercase'),
    name: NonEmpty,
    role: RoleSchema,
    country: CountrySchema,
    employmentType: EmploymentTypeSchema,
    department: NonEmpty,
    jobTitle: NonEmpty,
    accessLevel: AccessLevelSchema,
    /** Agents only; values are queue IDs from config/routing.yaml. */
    queues: z.array(NonEmpty),
    isDemo: z.boolean(),
    /** The user's own "Pro" setting (ADR-020); absent = off (local model). Never seeded. */
    proModels: z.boolean().optional(),
    createdAt: z.date(),
  })
  .refine((u) => (u.role === 'agent') === u.queues.length > 0, {
    path: ['queues'],
    message: 'must be non-empty for agents and empty for everyone else',
  });
export type UserDoc = z.infer<typeof UserSchema>;

// --- documents and chunks ------------------------------------------------------

export const DocumentSchema = z.object({
  _id: zObjectId,
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case'),
  title: NonEmpty,
  domain: DomainSchema,
  owner: NonEmpty,
  version: z.string().regex(/^\d+(\.\d+)*$/, 'must look like 3 or 3.1'),
  effectiveDate: z.date(),
  countries: z.array(CountrySchema).min(1),
  employmentTypes: z.array(EmploymentTypeSchema).min(1),
  /** Minimum access level required to read the document. */
  accessLevel: AccessLevelSchema,
  status: DocumentStatusSchema,
  supersededBy: nullable(zObjectId),
  sourceType: SourceTypeSchema,
  sourcePath: NonEmpty,
  contentHash: NonEmpty,
  chunkCount: Count,
  ingestStatus: IngestStatusSchema,
  ingestError: nullable(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DocumentDoc = z.infer<typeof DocumentSchema>;

/** Document metadata copied onto every chunk and its Qdrant point so search pre-filters can use it. */
export const CHUNK_FILTER_FIELDS = [
  'countries',
  'employmentTypes',
  'accessLevel',
  'status',
  'domain',
] as const;

export const ChunkSchema = z.object({
  _id: zObjectId,
  documentId: zObjectId,
  ordinal: Count,
  sectionPath: z.array(z.string()),
  text: NonEmpty,
  /** Title + section path + text: what is embedded (dense) and BM25-indexed (sparse) in Qdrant. */
  contextualText: NonEmpty,
  tokenCount: Count,
  /** Model whose vector is stored for this chunk in Qdrant (ADR-004). */
  embeddingModel: NonEmpty,
  domain: DomainSchema,
  countries: z.array(CountrySchema).min(1),
  employmentTypes: z.array(EmploymentTypeSchema).min(1),
  accessLevel: AccessLevelSchema,
  status: DocumentStatusSchema,
  effectiveDate: z.date(),
  docTitle: NonEmpty,
  docSlug: NonEmpty,
});
export type ChunkDoc = z.infer<typeof ChunkSchema>;

// --- conversations, messages, traces -----------------------------------------

export const ConversationSchema = z.object({
  _id: zObjectId,
  userId: zObjectId,
  title: z.string(),
  status: ConversationStatusSchema,
  resolution: nullable(z.object({ confirmed: z.boolean(), at: z.date(), messageId: zObjectId })),
  ticketId: nullable(zObjectId),
  /** True after a sensitive handoff. */
  restricted: z.boolean(),
  lastDecision: nullable(DecisionSchema),
  turnCount: Count,
  /** Created by the eval runner; excluded from every dashboard query. */
  isEval: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ConversationDoc = z.infer<typeof ConversationSchema>;

export const CitationSchema = z.object({
  marker: z.string().regex(/^S\d+$/),
  chunkId: zObjectId,
  documentId: zObjectId,
  docTitle: NonEmpty,
  sectionPath: z.array(z.string()),
  effectiveDate: z.date(),
});

export const MessageSchema = z.object({
  _id: zObjectId,
  conversationId: zObjectId,
  role: MessageRoleSchema,
  /** Final text as shown to the employee. */
  content: z.string(),
  decision: nullable(DecisionSchema),
  reasonCode: nullable(z.string()),
  /** Validated citations only. */
  citations: z.array(CitationSchema),
  /** PARTIAL: what the sources did not cover. */
  uncovered: z.array(z.string()),
  /** Snapshot of the ticket draft shown to the employee (shape owned by W3-02). */
  ticketDraft: nullable(z.record(z.string(), z.unknown())),
  status: MessageStatusSchema,
  isEval: z.boolean(),
  createdAt: z.date(),
});
export type MessageDoc = z.infer<typeof MessageSchema>;

const ScoredCandidate = z.object({ chunkId: zObjectId, score: z.number(), rank: Count });

export const LlmCallSchema = z.object({
  node: NonEmpty,
  promptName: NonEmpty,
  promptVersion: z.number().int().positive(),
  promptHash: NonEmpty,
  provider: NonEmpty,
  model: NonEmpty,
  inputTokens: Count,
  outputTokens: Count,
  costUsd: Money,
  latencyMs: z.number().min(0),
  retries: Count,
  error: nullable(z.string()),
});

export const TurnTraceSchema = z.object({
  _id: zObjectId,
  /** The assistant message this trace explains (1:1). */
  messageId: zObjectId,
  conversationId: zObjectId,
  userId: zObjectId,
  graphRunId: NonEmpty,
  /** User message after PII redaction; raw text lives only in messages. */
  redactedInput: z.string(),
  profileSnapshot: z.object({
    country: CountrySchema,
    employmentType: EmploymentTypeSchema,
    accessLevel: AccessLevelSchema,
    department: z.string(),
  }),
  precheck: z.object({
    sensitiveHit: z.boolean(),
    safetyHit: z.boolean(),
    matchedRules: z.array(z.string()),
  }),
  /** TurnAnalysis output; its schema lives in ai/schemas (W2-03). */
  analysis: nullable(z.record(z.string(), z.unknown())),
  retrieval: nullable(
    z.object({
      query: z.string(),
      filter: z.record(z.string(), z.unknown()),
      vector: z.array(ScoredCandidate),
      keyword: z.array(ScoredCandidate),
      fused: z.array(ScoredCandidate),
      reranked: z.array(z.object({ chunkId: zObjectId, relevance: z.number() })),
      coverage: z.enum(['full', 'partial', 'none', 'unknown']),
    }),
  ),
  decision: z.object({
    value: DecisionSchema,
    reasonCode: NonEmpty,
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
  llmCalls: z.array(LlmCallSchema),
  stepLatencyMs: z.record(z.string(), z.number().min(0)),
  totalLatencyMs: z.number().min(0),
  ttftMs: nullable(z.number().min(0)),
  totalCostUsd: Money,
  errors: z.array(z.object({ node: z.string(), code: z.string(), message: z.string() })),
  /** Copies the conversation flag. */
  restricted: z.boolean(),
  isEval: z.boolean(),
  createdAt: z.date(),
});
export type TurnTraceDoc = z.infer<typeof TurnTraceSchema>;

// --- tickets ---------------------------------------------------------------

/** P-6 agent assistance on a ticket (W3-06). */
export const AgentAssistSchema = z.object({
  status: z.enum(['generated', 'fallback', 'skipped']),
  /** The agent-facing one-line summary; the ticket summary stays the employee's. */
  headline: nullable(z.string()),
  firstChecks: z.array(z.string()),
  /** e.g. agent_ticket_summary@v1#hash; null when no model ran. */
  promptRef: nullable(z.string()),
});
export type AgentAssist = z.infer<typeof AgentAssistSchema>;

export const TicketSchema = z
  .object({
    _id: zObjectId,
    /** e.g. IT-1042, from the counters collection. */
    humanId: z.string().regex(/^(IT|HR)-\d{4,}$/),
    conversationId: zObjectId,
    /** Always the authenticated user; never taken from AI output or edits. */
    requesterId: zObjectId,
    requesterSnapshot: z.object({
      name: NonEmpty,
      email: z.email(),
      country: CountrySchema,
      employmentType: EmploymentTypeSchema,
      department: z.string(),
    }),
    domain: DomainSchema,
    category: NonEmpty,
    subcategory: nullable(NonEmpty),
    queue: NonEmpty,
    /** Final priority after floors. */
    priority: PrioritySchema,
    /** AI proposal before floors. */
    aiUrgency: PrioritySchema,
    priorityFloorApplied: nullable(NonEmpty),
    status: TicketStatusSchema,
    summary: NonEmpty,
    agentBrief: z.string(),
    /**
     * P-6 agent assistance (W3-06): written after creation by agentSummary.
     * Null until then; `fallback` keeps the description as the brief; `skipped`
     * for confidential cases (no AI on sensitive topics).
     */
    agentAssist: nullable(AgentAssistSchema).default(null),
    fields: z.record(z.string(), z.string()),
    aiFilledFields: z.array(z.string()),
    articlesShown: z.array(z.object({ documentId: zObjectId, docTitle: NonEmpty })),
    restricted: z.boolean(),
    duplicateOf: nullable(zObjectId),
    isEval: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    resolvedAt: nullable(z.date()),
  })
  .refine((t) => !t.restricted || t.queue === 'hr_case', {
    path: ['queue'],
    message: 'restricted tickets must be in hr_case',
  });
export type TicketDoc = z.infer<typeof TicketSchema>;

export const TicketEventSchema = z.object({
  _id: zObjectId,
  ticketId: zObjectId,
  /** Null for system-generated events. */
  actorId: nullable(zObjectId),
  type: TicketEventTypeSchema,
  visibility: EventVisibilitySchema,
  body: nullable(z.string()),
  /** For classification corrections: category, subcategory or priority. */
  field: nullable(z.enum(['category', 'subcategory', 'priority'])),
  oldValue: nullable(z.string()),
  newValue: nullable(z.string()),
  /** ai_draft_generated (W3-06): the P-7 call that produced the draft. */
  llmCall: LlmCallSchema.optional(),
  createdAt: z.date(),
});
export type TicketEventDoc = z.infer<typeof TicketEventSchema>;

export const FeedbackSchema = z.object({
  _id: zObjectId,
  messageId: zObjectId,
  conversationId: zObjectId,
  userId: zObjectId,
  rating: FeedbackRatingSchema,
  comment: z.string().max(500).optional(),
  createdAt: z.date(),
});
export type FeedbackDoc = z.infer<typeof FeedbackSchema>;

// --- evaluation --------------------------------------------------------------

export const EvalRunSchema = z.object({
  _id: zObjectId,
  suite: EvalSuiteSchema,
  datasetVersion: NonEmpty,
  status: EvalRunStatusSchema,
  configSnapshot: z.object({
    thresholds: z.record(z.string(), z.unknown()),
    promptVersions: z.record(z.string(), z.number()),
    models: z.record(z.string(), z.unknown()),
    gitCommit: z.string(),
  }),
  caseCount: Count,
  metrics: z.record(z.string(), z.number()),
  perCategory: z.record(z.string(), z.record(z.string(), z.number())),
  targets: z.record(z.string(), z.object({ target: z.number(), met: z.boolean() })),
  passed: nullable(z.boolean()),
  costUsd: Money,
  durationMs: nullable(z.number().min(0)),
  triggeredBy: z.union([zObjectId, z.literal('cli')]),
  startedAt: z.date(),
  finishedAt: nullable(z.date()),
  error: nullable(z.string()),
});
export type EvalRunDoc = z.infer<typeof EvalRunSchema>;

export const EvalResultSchema = z.object({
  _id: zObjectId,
  runId: zObjectId,
  caseId: NonEmpty,
  category: NonEmpty,
  tags: z.array(z.string()),
  expected: z.record(z.string(), z.unknown()),
  actual: z.object({
    decision: nullable(DecisionSchema),
    retrievedDocSlugs: z.array(z.string()),
    citedDocSlugs: z.array(z.string()),
    category: nullable(z.string()),
    priority: nullable(PrioritySchema),
    fields: z.record(z.string(), z.string()),
    answerText: z.string(),
  }),
  scores: z.record(z.string(), z.union([z.number(), z.boolean()])),
  passed: z.boolean(),
  failureReasons: z.array(z.string()),
  traceRef: z.record(z.string(), z.unknown()),
  latencyMs: z.number().min(0),
  costUsd: Money,
});
export type EvalResultDoc = z.infer<typeof EvalResultSchema>;

// --- audit and supporting collections ----------------------------------------

export const AuditLogSchema = z.object({
  _id: zObjectId,
  actorId: nullable(zObjectId),
  actorRole: nullable(RoleSchema),
  /** e.g. auth.login, ticket.status_change, admin.trace_view */
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  targetType: nullable(z.string()),
  targetId: nullable(z.string()),
  /** No PII beyond IDs. */
  metadata: z.record(z.string(), z.unknown()),
  ip: z.string(),
  requestId: z.string(),
  createdAt: z.date(),
});
export type AuditLogDoc = z.infer<typeof AuditLogSchema>;

// --- employee workspace: mock task tracker, timesheets, HR/payroll (UC-01) -----

/** Calendar day "YYYY-MM-DD" (UTC); string so equality and range queries are exact. */
const DayString = IsoDateSchema;

export const ProjectSchema = z.object({
  _id: zObjectId,
  /** Short code, e.g. BANK. */
  code: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  name: NonEmpty,
  client: nullable(NonEmpty),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Employees who may log time against the project. */
  memberIds: z.array(zObjectId),
  active: z.boolean(),
  createdAt: z.date(),
});
export type ProjectDoc = z.infer<typeof ProjectSchema>;

export const TaskSchema = z.object({
  _id: zObjectId,
  /** Tracker key, e.g. PROJ-123. */
  key: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
  projectId: zObjectId,
  assigneeId: zObjectId,
  title: NonEmpty,
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueDate: nullable(DayString),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TaskDoc = z.infer<typeof TaskSchema>;

export const TimesheetEntrySchema = z.object({
  _id: zObjectId,
  userId: zObjectId,
  date: DayString,
  projectId: zObjectId,
  hours: z.number().positive().max(24),
  note: nullable(z.string().max(200)),
  source: TimesheetSourceSchema,
  late: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TimesheetEntryDoc = z.infer<typeof TimesheetEntrySchema>;

export const AttendanceSchema = z.object({
  _id: zObjectId,
  userId: zObjectId,
  date: DayString,
  status: AttendanceStatusSchema,
  note: nullable(z.string()),
});
export type AttendanceDoc = z.infer<typeof AttendanceSchema>;

const PayLine = z.object({ code: NonEmpty, label: NonEmpty, amount: Money });

export const PayslipSchema = z
  .object({
    _id: zObjectId,
    userId: zObjectId,
    periodStart: DayString,
    periodEnd: DayString,
    payDate: DayString,
    currency: z.enum(['USD', 'GBP']),
    earnings: z.array(PayLine).min(1),
    deductions: z.array(
      PayLine.extend({
        code: DeductionCodeSchema,
        dates: z.array(DayString),
        note: nullable(z.string()),
      }),
    ),
    gross: Money,
    net: Money,
    createdAt: z.date(),
  })
  .refine((p) => p.periodStart <= p.periodEnd, { path: ['periodEnd'], message: 'before start' })
  .refine(
    (p) => {
      const sum = (lines: { amount: number }[]) => lines.reduce((t, l) => t + l.amount, 0);
      const cents = (n: number) => Math.round(n * 100);
      return (
        cents(sum(p.earnings)) === cents(p.gross) &&
        cents(p.gross - sum(p.deductions)) === cents(p.net)
      );
    },
    { path: ['net'], message: 'gross must equal earnings and net must equal gross − deductions' },
  )
  .refine((p) => p.deductions.every((d) => d.code !== 'lop' || d.dates.length > 0), {
    path: ['deductions'],
    message: 'an LOP deduction must list its dates',
  });
export type PayslipDoc = z.infer<typeof PayslipSchema>;

export const NotificationSchema = z.object({
  _id: zObjectId,
  userId: zObjectId,
  kind: NotificationKindSchema,
  title: NonEmpty,
  body: z.string(),
  link: nullable(z.string().startsWith('/')),
  readAt: nullable(z.date()),
  createdAt: z.date(),
});
export type NotificationDoc = z.infer<typeof NotificationSchema>;

// --- email_outbox (UC-07, ADR-017) -------------------------------------------

/**
 * One escalation email per conversation, written only after the employee
 * confirms. Recipient and sender are set by code (routing config and the user
 * record); subject and body are exactly the confirmed text.
 */
export const EmailOutboxSchema = z
  .object({
    _id: zObjectId,
    /** Idempotency key: one email per escalation conversation. */
    conversationId: zObjectId,
    ticketId: zObjectId,
    /** Metadata only; never written into the subject or body. */
    ticketHumanId: z.string().regex(/^(IT|HR)-\d{4,}$/),
    requesterId: zObjectId,
    from: z.object({ name: NonEmpty, address: z.email() }),
    to: z.object({ queueId: NonEmpty, label: NonEmpty, address: z.email() }),
    subject: EmailSubjectSchema,
    body: EmailBodySchema,
    /** The text as drafted, before the employee's edits (audit). */
    aiDraft: z.object({ subject: z.string(), body: z.string() }),
    edited: z.object({ subject: z.boolean(), body: z.boolean() }),
    issueSource: EmailIssueSourceSchema,
    recordsAsOf: IsoDateSchema,
    delivery: z.object({
      mode: EmailDeliveryModeSchema,
      status: EmailStatusSchema,
      attempts: Count,
      lastError: nullable(z.string()),
      deliveredAt: nullable(z.date()),
      providerMessageId: nullable(NonEmpty),
    }),
    isEval: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  // Confidential cases are never emailed (mirrors the routing cross-check).
  .refine((e) => e.to.queueId !== 'hr_case', {
    path: ['to', 'queueId'],
    message: 'emails to the sensitive queue hr_case are not allowed',
  });
export type EmailOutboxDoc = z.infer<typeof EmailOutboxSchema>;

export const COUNTER_IDS = ['IT', 'HR'] as const;
export const CounterSchema = z.object({ _id: z.enum(COUNTER_IDS), seq: Count });
export type CounterDoc = z.infer<typeof CounterSchema>;

/**
 * One cluster of a knowledge-gap snapshot (W4-02). A refresh replaces the whole
 * snapshot. Members are in the same order in messageIds and conversationIds; the
 * examples are the first members.
 */
export const GapClusterSchema = z.object({
  _id: zObjectId,
  snapshotAt: z.date(),
  /** The questions' date range (inclusive days). */
  rangeFrom: IsoDateSchema,
  rangeTo: IsoDateSchema,
  label: NonEmpty,
  /** False when P-8 failed and the label is the fallback. */
  labelled: z.boolean(),
  domain: z.enum(['IT', 'HR', 'unknown']),
  questionCount: Count,
  /** Redacted before storage (the trace's redactedInput). */
  exampleQuestions: z.array(z.string()),
  /** The assistant messages whose turns were gaps (trace messageId). */
  messageIds: z.array(zObjectId),
  conversationIds: z.array(zObjectId),
  centroid: z.array(z.number()).optional(),
  /** The P-8 call that named the cluster (trace entry); absent when none ran. */
  labelCall: LlmCallSchema.optional(),
});
export type GapClusterDoc = z.infer<typeof GapClusterSchema>;

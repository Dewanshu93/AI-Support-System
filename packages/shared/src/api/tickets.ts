// Ticket drafts (playbook sections 5 and 10; contract flow 4). The draft the
// graph builds (buildDraft) and the employee reviews before any ticket exists.
import { z } from 'zod';
import { DomainSchema, PrioritySchema, TicketEventTypeSchema, TicketStatusSchema } from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';

export const IMPACT_SCOPES = ['me', 'team', 'org', 'unknown'] as const;
export type ImpactScope = (typeof IMPACT_SCOPES)[number];

export const TicketDraftSchema = z.object({
  domain: DomainSchema,
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  /** Set by routing rules, never by AI output or edits. */
  queue: z.object({ id: z.string().min(1), label: z.string().min(1) }),
  /** Final priority after the code-applied floors (read-only for the employee). */
  priority: PrioritySchema,
  /** The AI's proposal before floors. */
  aiUrgency: PrioritySchema,
  /** The rule that raised the priority, or null. */
  priorityFloorApplied: z.string().nullable(),
  impactScope: z.enum(IMPACT_SCOPES),
  /** One line, at most 15 words. */
  summary: z.string().min(1),
  /** Agent-ready description, at most 120 words. */
  description: z.string(),
  alreadyTried: z.array(z.string()),
  /** Error messages, verbatim. */
  errorMessages: z.array(z.string()),
  /** The category's fields; absent information is "unknown". */
  fields: z.record(z.string(), z.string()),
  /** Field keys filled by the AI (not typed by the employee). */
  aiFilledFields: z.array(z.string()),
  /** Required fields still "unknown" after the clarification rounds. */
  requiredMissing: z.array(z.string()),
  /** Documents cited to the employee in this conversation. */
  articlesShown: z.array(z.object({ documentId: z.string(), docTitle: z.string() })),
  /** Sensitive (restricted) HR case. */
  restricted: z.boolean(),
});
export type TicketDraft = z.infer<typeof TicketDraftSchema>;

// --- Confirm / cancel (contract flows 4–6) -----------------------------------

export const DUPLICATE_DECISIONS = ['new', 'same'] as const;

/**
 * Confirming a draft. `edits` may only change the draft's category fields;
 * requester, queue and priority are set by code and cannot be edited.
 */
export const TicketDraftConfirmRequestSchema = z.strictObject({
  edits: z.record(z.string(), z.string().trim().max(500)).default({}),
  /** Required after a DUPLICATE_CANDIDATE answer: create a new ticket or add to the existing one. */
  duplicateDecision: z.enum(DUPLICATE_DECISIONS).optional(),
});
export type TicketDraftConfirmRequest = z.infer<typeof TicketDraftConfirmRequestSchema>;

/** `details` of a 409 DUPLICATE_CANDIDATE error. */
export const DuplicateCandidateSchema = z.object({
  existing: z.object({ humanId: z.string(), summary: z.string(), status: TicketStatusSchema }),
});
export type DuplicateCandidate = z.infer<typeof DuplicateCandidateSchema>;

export const TicketRefSchema = z.object({
  id: z.string(),
  humanId: z.string(),
  queue: z.string(),
  priority: PrioritySchema,
  status: TicketStatusSchema,
});
export const TicketConfirmResponseSchema = z.object({ ticket: TicketRefSchema });
export type TicketConfirmResponse = z.infer<typeof TicketConfirmResponseSchema>;

// --- Employee ticket views (no internal fields) ------------------------------

export const EmployeeTicketSummarySchema = z.object({
  id: z.string(),
  humanId: z.string(),
  summary: z.string(),
  status: TicketStatusSchema,
  priority: PrioritySchema,
  updatedAt: z.string(),
});
export const TicketListQuerySchema = PaginationQuerySchema.extend({
  status: TicketStatusSchema.optional(),
});
export type TicketListQuery = z.infer<typeof TicketListQuerySchema>;
export const TicketListResponseSchema = paginatedSchema(EmployeeTicketSummarySchema);
export type TicketListResponse = z.infer<typeof TicketListResponseSchema>;

export const PublicTicketEventSchema = z.object({
  id: z.string(),
  type: TicketEventTypeSchema,
  body: z.string().nullable(),
  createdAt: z.string(),
});
export const EmployeeTicketSchema = EmployeeTicketSummarySchema.extend({
  conversationId: z.string(),
  domain: DomainSchema,
  category: z.string(),
  subcategory: z.string().nullable(),
  queueLabel: z.string(),
  fields: z.record(z.string(), z.string()),
  restricted: z.boolean(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export const TicketDetailResponseSchema = z.object({
  ticket: EmployeeTicketSchema,
  /** Public events only (no internal notes). */
  events: z.array(PublicTicketEventSchema),
});
export type TicketDetailResponse = z.infer<typeof TicketDetailResponseSchema>;
export const TicketParamsSchema = z.object({ id: ObjectIdStringSchema });

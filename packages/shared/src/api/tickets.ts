// Ticket drafts (playbook sections 5 and 10; contract flow 4). The draft the
// graph builds (buildDraft) and the employee reviews before any ticket exists.
import { z } from 'zod';
import {
  DomainSchema,
  EmailDeliveryModeSchema,
  EmailIssueSourceSchema,
  EmailStatusSchema,
  PrioritySchema,
  TicketEventTypeSchema,
  TicketStatusSchema,
} from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';

export const IMPACT_SCOPES = ['me', 'team', 'org', 'unknown'] as const;
export type ImpactScope = (typeof IMPACT_SCOPES)[number];

// --- Escalation email (UC-07, ADR-017) ---------------------------------------

/** Length limits shared by the API and the web form. */
export const EMAIL_LIMITS = { subject: 150, body: 5000 } as const;

/** CRLF and lone CR become LF, so stored bodies use one newline form. */
export const normaliseNewlines = (text: string): string => text.replace(/\r\n?/g, '\n');

/** One line: CR, LF and other control characters are rejected (header-injection guard). */
export const EmailSubjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(EMAIL_LIMITS.subject)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f\x7f]+$/, 'must be a single line without control characters');

export const EmailBodySchema = z
  .string()
  .transform(normaliseNewlines)
  .pipe(z.string().trim().min(1).max(EMAIL_LIMITS.body));

/** The email code drafts alongside a ticket draft. Recipient and sender are set by code. */
export const EmailDraftSchema = z.object({
  to: z.object({ queueId: z.string().min(1), label: z.string().min(1), address: z.email() }),
  from: z.object({ name: z.string().min(1), address: z.email() }),
  subject: EmailSubjectSchema,
  body: EmailBodySchema,
  issueSource: EmailIssueSourceSchema,
  /** The date (YYYY-MM-DD) the records in the body were read. */
  recordsAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

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
  /** Field keys filled by code from the employee's records (UC-07), not by the AI. */
  recordFilledFields: z.array(z.string()).default([]),
  /** The escalation email, when the routed queue has an address and the case is not restricted. */
  email: EmailDraftSchema.optional(),
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
  /**
   * The on-screen email text (UC-07). Only subject and body: recipient and
   * sender are set by code. Absent means "send the drafted text shown".
   */
  email: z.strictObject({ subject: EmailSubjectSchema, body: EmailBodySchema }).optional(),
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
export const TicketConfirmResponseSchema = z.object({
  ticket: TicketRefSchema,
  /** The recorded email, null when the request had none. */
  email: z
    .object({ id: z.string(), status: EmailStatusSchema, mode: EmailDeliveryModeSchema })
    .nullable()
    .optional(),
});
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
/** An escalation email as shown to the requester and queue agents (no delivery internals). */
export const TicketEmailSchema = z.object({
  id: z.string(),
  to: z.object({ label: z.string(), address: z.email() }),
  subject: z.string(),
  body: z.string(),
  status: EmailStatusSchema,
  mode: EmailDeliveryModeSchema,
  edited: z.object({ subject: z.boolean(), body: z.boolean() }),
  createdAt: z.string(),
  deliveredAt: z.string().nullable(),
});
export type TicketEmail = z.infer<typeof TicketEmailSchema>;

export const TicketDetailResponseSchema = z.object({
  ticket: EmployeeTicketSchema,
  /** Public events only (no internal notes). */
  events: z.array(PublicTicketEventSchema),
  /** Escalation emails linked to the ticket, oldest first. */
  emails: z.array(TicketEmailSchema).default([]),
});
export type TicketDetailResponse = z.infer<typeof TicketDetailResponseSchema>;
export const TicketParamsSchema = z.object({ id: ObjectIdStringSchema });

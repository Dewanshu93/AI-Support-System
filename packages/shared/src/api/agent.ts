// Agent ticket endpoints (playbook section 4: Agent; contract flow 8). Agents
// see only tickets in their queues; restricted cases only with hr_case; admins
// see every queue. The draft-reply endpoint (P-7) arrives with W3-06.
import { z } from 'zod';
import {
  CountrySchema,
  DomainSchema,
  EmploymentTypeSchema,
  EventVisibilitySchema,
  MessageRoleSchema,
  PrioritySchema,
  TicketEventTypeSchema,
  TicketStatusSchema,
} from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';
import { CitationDtoSchema } from './conversations';

export const AgentTicketListQuerySchema = PaginationQuerySchema.extend({
  /** One of the agent's queues (403 otherwise); all of them when absent. */
  queue: z.string().min(1).optional(),
  status: TicketStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  category: z.string().min(1).optional(),
});
export type AgentTicketListQuery = z.infer<typeof AgentTicketListQuerySchema>;

export const AgentTicketSummarySchema = z.object({
  id: z.string(),
  humanId: z.string(),
  summary: z.string(),
  priority: PrioritySchema,
  status: TicketStatusSchema,
  category: z.string(),
  queue: z.string(),
  requesterName: z.string(),
  ageMinutes: z.number().int().min(0),
  restricted: z.boolean(),
});
/** Sorted by priority (critical first), then oldest first. */
export const AgentTicketListResponseSchema = paginatedSchema(AgentTicketSummarySchema);
export type AgentTicketListResponse = z.infer<typeof AgentTicketListResponseSchema>;

export const AgentTicketSchema = z.object({
  id: z.string(),
  humanId: z.string(),
  conversationId: z.string(),
  requester: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    country: CountrySchema,
    employmentType: EmploymentTypeSchema,
    department: z.string(),
  }),
  domain: DomainSchema,
  category: z.string(),
  subcategory: z.string().nullable(),
  queue: z.string(),
  queueLabel: z.string(),
  priority: PrioritySchema,
  aiUrgency: PrioritySchema,
  priorityFloorApplied: z.string().nullable(),
  status: TicketStatusSchema,
  summary: z.string(),
  agentBrief: z.string(),
  fields: z.record(z.string(), z.string()),
  restricted: z.boolean(),
  duplicateOf: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type AgentTicket = z.infer<typeof AgentTicketSchema>;

export const AgentTicketEventSchema = z.object({
  id: z.string(),
  type: TicketEventTypeSchema,
  visibility: EventVisibilitySchema,
  actorId: z.string().nullable(),
  body: z.string().nullable(),
  field: z.enum(['category', 'subcategory', 'priority']).nullable(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentTicketEvent = z.infer<typeof AgentTicketEventSchema>;

export const TranscriptMessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const AgentTicketDetailResponseSchema = z.object({
  ticket: AgentTicketSchema,
  aiFilledFields: z.array(z.string()),
  articlesShown: z.array(z.object({ documentId: z.string(), docTitle: z.string() })),
  /** Public and internal events, oldest first. */
  events: z.array(AgentTicketEventSchema),
  transcript: z.array(TranscriptMessageSchema),
  /** Every validated citation shown to the employee in the conversation. */
  citationsShown: z.array(CitationDtoSchema),
});
export type AgentTicketDetailResponse = z.infer<typeof AgentTicketDetailResponseSchema>;

export const AgentTicketResponseSchema = z.object({ ticket: AgentTicketSchema });
export type AgentTicketResponse = z.infer<typeof AgentTicketResponseSchema>;

export const AgentEventResponseSchema = z.object({ event: AgentTicketEventSchema });
export type AgentEventResponse = z.infer<typeof AgentEventResponseSchema>;

export const AgentReplyRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
  /** Whether the reply started from the AI draft (W3-06); stored on the audit entry. */
  usedAiDraft: z.boolean().default(false),
});
export type AgentReplyRequest = z.infer<typeof AgentReplyRequestSchema>;

export const AgentNoteRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
});
export type AgentNoteRequest = z.infer<typeof AgentNoteRequestSchema>;

export const AgentStatusRequestSchema = z.strictObject({ status: TicketStatusSchema });
export type AgentStatusRequest = z.infer<typeof AgentStatusRequestSchema>;

/** At least one field; category and subcategory are checked against the taxonomy in code. */
export const AgentClassificationRequestSchema = z
  .strictObject({
    category: z.string().min(1).optional(),
    subcategory: z.string().min(1).nullable().optional(),
    priority: PrioritySchema.optional(),
  })
  .refine((b) => b.category !== undefined || b.subcategory !== undefined || b.priority, {
    message: 'Give at least one of category, subcategory or priority',
  });
export type AgentClassificationRequest = z.infer<typeof AgentClassificationRequestSchema>;

export const AgentTicketParamsSchema = z.object({ id: ObjectIdStringSchema });

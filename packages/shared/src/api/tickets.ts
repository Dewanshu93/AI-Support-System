// Ticket drafts (playbook sections 5 and 10; contract flow 4). The draft the
// graph builds (buildDraft) and the employee reviews before any ticket exists.
import { z } from 'zod';
import { DomainSchema, PrioritySchema } from '../enums';

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

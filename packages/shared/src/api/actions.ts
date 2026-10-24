// Copilot actions waiting for the employee's confirmation (UC-05 timesheet entries,
// UC-11c leave requests, UC-17 changes to the employee's own requests). Built by code from the model's extraction; nothing is
// written until the employee confirms the exact action shown (rule E.4).
import { z } from 'zod';
import { TicketStatusSchema } from '../enums';
import { ObjectIdStringSchema } from './common';
import { LeaveTypeSchema } from './leave';
import { IsoDateSchema, TimesheetActionSchema } from './workspace';

/** A leave request the copilot proposes (UC-11c): dates resolved and every rule checked by code. */
export const LeaveActionSchema = z.object({
  kind: z.enum(['leave_apply']),
  type: LeaveTypeSchema,
  typeLabel: z.string(),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  /** Working days covered. */
  days: z.number().int().positive(),
  /** Balance for the type after this request. */
  availableAfter: z.number(),
  /** False for sick leave, which is recorded at once. */
  needsApproval: z.boolean(),
  /** Policy reminders that do not block the request. */
  warnings: z.array(z.string()),
});
export type LeaveAction = z.infer<typeof LeaveActionSchema>;

/** A change to one of the employee's own requests (UC-17): found and checked by code. */
export const RequestChangeActionSchema = z.object({
  kind: z.enum(['request_change']),
  change: z.enum(['comment', 'withdraw', 'reopen']),
  ticketId: ObjectIdStringSchema,
  humanId: z.string(),
  summary: z.string(),
  /** comment: the exact text that will be added. */
  comment: z.string().nullable(),
  /** The status after the change; null when it stays the same (a comment). */
  statusAfter: TicketStatusSchema.nullable(),
});
export type RequestChangeAction = z.infer<typeof RequestChangeActionSchema>;

export const CopilotActionSchema = z.discriminatedUnion('kind', [
  TimesheetActionSchema,
  LeaveActionSchema,
  RequestChangeActionSchema,
]);
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

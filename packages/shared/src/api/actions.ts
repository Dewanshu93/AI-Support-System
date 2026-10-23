// Copilot actions waiting for the employee's confirmation (UC-05 timesheet entries,
// UC-11c leave requests). Built by code from the model's extraction; nothing is
// written until the employee confirms the exact action shown (rule E.4).
import { z } from 'zod';
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

export const CopilotActionSchema = z.discriminatedUnion('kind', [
  TimesheetActionSchema,
  LeaveActionSchema,
]);
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

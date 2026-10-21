// Leave contracts (UC-11, Build Contract amendment A-1): balances, applying for
// and cancelling leave, and HR approval (an HR agent stands in for the manager,
// ADR-025). Days are working days, counted by code from the holiday calendar.
import { z } from 'zod';
import { CountrySchema } from '../enums';
import { ObjectIdStringSchema } from './common';
import { IsoDateSchema } from './workspace';

export const LEAVE_TYPES = ['annual', 'sick', 'casual'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LeaveTypeSchema = z.enum(LEAVE_TYPES);

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LeaveStatusSchema = z.enum(LEAVE_STATUSES);

/** Where a leave request came from: the form, the copilot (after confirmation) or seed data. */
export const LEAVE_SOURCES = ['form', 'copilot', 'seed'] as const;
export type LeaveSource = (typeof LEAVE_SOURCES)[number];
export const LeaveSourceSchema = z.enum(LEAVE_SOURCES);

export const LeaveBalanceSchema = z.object({
  type: LeaveTypeSchema,
  label: z.string(),
  /** Days for the calendar year (config/workday.yaml). */
  entitlement: z.number(),
  /** Approved days this year, past and booked. */
  used: z.number(),
  /** Days in requests waiting for approval. */
  pending: z.number(),
  /** entitlement − used − pending. */
  available: z.number(),
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;

export const LeaveRequestSchema = z.object({
  id: ObjectIdStringSchema,
  type: LeaveTypeSchema,
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  /** Working days the request covers (weekends and holidays excluded). */
  days: z.number().int(),
  reason: z.string().nullable(),
  status: LeaveStatusSchema,
  source: LeaveSourceSchema,
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  /** The employee may still cancel it (pending, or approved and not started). */
  cancellable: z.boolean(),
});
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

export const LeaveOverviewResponseSchema = z.object({
  year: z.number().int(),
  today: IsoDateSchema,
  /** False for contractors: their time off is agreed with their manager and agency. */
  eligible: z.boolean(),
  balances: z.array(LeaveBalanceSchema),
  /** This year's requests and any later ones, newest start first. */
  requests: z.array(LeaveRequestSchema),
  /** Bounds for the form. */
  rules: z.object({ earliestSickDate: IsoDateSchema, latestDate: IsoDateSchema }),
});
export type LeaveOverviewResponse = z.infer<typeof LeaveOverviewResponseSchema>;

export const LeaveApplyRequestSchema = z
  .strictObject({
    type: LeaveTypeSchema,
    startDate: IsoDateSchema,
    endDate: IsoDateSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((r) => r.startDate <= r.endDate, {
    message: 'must not be before the start date',
    path: ['endDate'],
  });
export type LeaveApplyRequest = z.infer<typeof LeaveApplyRequestSchema>;

export const LeaveApplyResponseSchema = z.object({
  request: LeaveRequestSchema,
  /** Policy reminders that do not block the request (notice periods, doctor's note). */
  warnings: z.array(z.string()),
  overview: LeaveOverviewResponseSchema,
});
export type LeaveApplyResponse = z.infer<typeof LeaveApplyResponseSchema>;

export const LeaveRequestParamsSchema = z.object({ id: ObjectIdStringSchema });

// --- HR approval -------------------------------------------------------------

export const AgentLeaveRequestSchema = LeaveRequestSchema.omit({ cancellable: true }).extend({
  /** "Annual leave", from config. */
  typeLabel: z.string(),
  employee: z.object({
    id: ObjectIdStringSchema,
    name: z.string(),
    department: z.string(),
    country: CountrySchema,
  }),
  /** The employee's balance for this type if the request is approved. */
  availableAfter: z.number(),
});
export type AgentLeaveRequest = z.infer<typeof AgentLeaveRequestSchema>;

export const AgentLeaveListQuerySchema = z.object({
  status: LeaveStatusSchema.default('pending'),
});
export type AgentLeaveListQuery = z.infer<typeof AgentLeaveListQuerySchema>;
export const AgentLeaveListResponseSchema = z.object({ items: z.array(AgentLeaveRequestSchema) });
export type AgentLeaveListResponse = z.infer<typeof AgentLeaveListResponseSchema>;

export const AgentLeaveDecisionRequestSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.decision === 'approve' || (d.note?.length ?? 0) > 0, {
    message: 'give the employee a reason when rejecting',
    path: ['note'],
  });
export type AgentLeaveDecisionRequest = z.infer<typeof AgentLeaveDecisionRequestSchema>;
export const AgentLeaveDecisionResponseSchema = z.object({ request: AgentLeaveRequestSchema });
export type AgentLeaveDecisionResponse = z.infer<typeof AgentLeaveDecisionResponseSchema>;

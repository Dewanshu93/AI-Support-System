// Employee workspace contracts (Build Contract v2.0, UC-01 – UC-03): projects
// and tasks (mock task tracker), timesheets, attendance, payslips,
// notifications and the dashboard summary. Employees only ever see their own data.
import { z } from 'zod';
import {
  CountrySchema,
  EmploymentTypeSchema,
  TicketStatusSchema,
  type TicketStatus,
} from '../enums';
import { ObjectIdStringSchema } from './common';

/** A calendar date without time, e.g. "2026-09-11" (dates are UTC calendar days). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
  }, 'is not a real date');
export type IsoDate = z.infer<typeof IsoDateSchema>;

// --- enums -----------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TaskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);

/** Where a timesheet entry came from: the form, the AI copilot (after confirmation) or seed data. */
export const TIMESHEET_SOURCES = ['form', 'copilot', 'seed'] as const;
export type TimesheetSource = (typeof TIMESHEET_SOURCES)[number];
export const TimesheetSourceSchema = z.enum(TIMESHEET_SOURCES);

/** Computed status of one day in the timesheet view (code, never AI). */
export const DAY_STATUSES = [
  'complete',
  'partial',
  'missing',
  'today',
  'future',
  'weekend',
  'holiday',
  'leave',
] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const DayStatusSchema = z.enum(DAY_STATUSES);

export const ATTENDANCE_STATUSES = ['present', 'remote', 'absent', 'leave', 'holiday'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const DEDUCTION_CODES = [
  'tax',
  'social_security',
  'retirement',
  'health',
  'lop',
  'other',
] as const;
export type DeductionCode = (typeof DEDUCTION_CODES)[number];
export const DeductionCodeSchema = z.enum(DEDUCTION_CODES);

export const NOTIFICATION_KINDS = ['payroll', 'timesheet', 'request', 'task', 'system'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NotificationKindSchema = z.enum(NOTIFICATION_KINDS);

/**
 * Employee-facing request stages (Build Contract v2.0, section G), mapped from
 * the ticket workflow statuses. A request exists only after escalation, so its
 * first stage is "Escalated".
 */
export const REQUEST_STAGE_LABEL: Record<TicketStatus, string> = {
  new: 'Escalated',
  in_progress: 'Under review',
  waiting_on_employee: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed',
};

// --- projects and tasks --------------------------------------------------------

export const ProjectSchema = z.object({
  id: ObjectIdStringSchema,
  code: z.string(),
  name: z.string(),
  client: z.string().nullable(),
  /** Hex colour used for the project chip. */
  color: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectListResponseSchema = z.object({ items: z.array(ProjectSchema) });
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

export const TaskSchema = z.object({
  id: ObjectIdStringSchema,
  key: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  project: ProjectSchema.pick({ id: true, code: true, name: true, color: true }),
  dueDate: IsoDateSchema.nullable(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;
export const TaskListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  /** `open` = everything except done. */
  view: z.enum(['open', 'all']).default('all'),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;
export const TaskListResponseSchema = z.object({
  items: z.array(TaskSchema),
  today: IsoDateSchema,
});
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

// --- timesheets ----------------------------------------------------------------

export const TimesheetEntrySchema = z.object({
  id: ObjectIdStringSchema,
  date: IsoDateSchema,
  projectId: ObjectIdStringSchema,
  hours: z.number(),
  note: z.string().nullable(),
  source: TimesheetSourceSchema,
  /** Logged after the pay period it belongs to had closed. */
  late: z.boolean(),
  updatedAt: z.string(),
});
export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;

export const TimesheetDaySchema = z.object({
  date: IsoDateSchema,
  status: DayStatusSchema,
  hours: z.number(),
  requiredHours: z.number(),
  /** Holiday name or leave label, when relevant. */
  label: z.string().nullable(),
});
export type TimesheetDay = z.infer<typeof TimesheetDaySchema>;

export const TimesheetWeekQuerySchema = z.object({
  /** Any date in the week; defaults to today. */
  date: IsoDateSchema.optional(),
});
export type TimesheetWeekQuery = z.infer<typeof TimesheetWeekQuerySchema>;

export const TimesheetWeekResponseSchema = z.object({
  weekStart: IsoDateSchema,
  weekEnd: IsoDateSchema,
  today: IsoDateSchema,
  days: z.array(TimesheetDaySchema),
  entries: z.array(TimesheetEntrySchema),
  projects: z.array(ProjectSchema),
  totalHours: z.number(),
  requiredHours: z.number(),
  /** Bounds for the form, from config/workday.yaml. */
  rules: z.object({
    maxHoursPerDay: z.number(),
    hourStep: z.number(),
    earliestDate: IsoDateSchema,
  }),
});
export type TimesheetWeekResponse = z.infer<typeof TimesheetWeekResponseSchema>;

/** One cell of the timesheet grid; `hours: 0` removes the entry. */
export const TimesheetCellSchema = z.strictObject({
  date: IsoDateSchema,
  projectId: ObjectIdStringSchema,
  hours: z.number().min(0).max(24),
  note: z.string().trim().max(200).optional(),
});
export type TimesheetCell = z.infer<typeof TimesheetCellSchema>;

export const TimesheetSaveRequestSchema = z.strictObject({
  cells: z.array(TimesheetCellSchema).min(1).max(100),
});
export type TimesheetSaveRequest = z.infer<typeof TimesheetSaveRequestSchema>;

export const TimesheetSaveResponseSchema = z.object({
  saved: z.number().int(),
  removed: z.number().int(),
  week: TimesheetWeekResponseSchema,
});
export type TimesheetSaveResponse = z.infer<typeof TimesheetSaveResponseSchema>;

// --- attendance and payroll ------------------------------------------------------

export const AttendanceRecordSchema = z.object({
  date: IsoDateSchema,
  status: AttendanceStatusSchema,
  note: z.string().nullable(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;
export const AttendanceQuerySchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['from'] })
  .refine(
    (q) => Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`) <= 92 * 86_400_000,
    { message: 'range must be at most 92 days', path: ['to'] },
  );
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;
export const AttendanceResponseSchema = z.object({ items: z.array(AttendanceRecordSchema) });
export type AttendanceResponse = z.infer<typeof AttendanceResponseSchema>;

export const PayslipLineSchema = z.object({
  code: z.string(),
  label: z.string(),
  amount: z.number(),
});
export const PayslipDeductionSchema = PayslipLineSchema.extend({
  code: DeductionCodeSchema,
  /** Calendar days the deduction relates to (LOP). */
  dates: z.array(IsoDateSchema),
  note: z.string().nullable(),
});
export type PayslipDeduction = z.infer<typeof PayslipDeductionSchema>;

export const PayslipSummarySchema = z.object({
  id: ObjectIdStringSchema,
  periodStart: IsoDateSchema,
  periodEnd: IsoDateSchema,
  payDate: IsoDateSchema,
  currency: z.enum(['USD', 'GBP']),
  gross: z.number(),
  totalDeductions: z.number(),
  net: z.number(),
  /** Sum of LOP deductions on this payslip (0 when none). */
  lopAmount: z.number(),
});
export type PayslipSummary = z.infer<typeof PayslipSummarySchema>;
export const PayslipSchema = PayslipSummarySchema.extend({
  earnings: z.array(PayslipLineSchema),
  deductions: z.array(PayslipDeductionSchema),
});
export type Payslip = z.infer<typeof PayslipSchema>;
export const PayslipListResponseSchema = z.object({
  items: z.array(PayslipSummarySchema),
  /** Contractors are paid by their agency: no payslips here. */
  paidByAgency: z.boolean(),
});
export type PayslipListResponse = z.infer<typeof PayslipListResponseSchema>;
export const PayslipResponseSchema = z.object({ payslip: PayslipSchema });
export type PayslipResponse = z.infer<typeof PayslipResponseSchema>;
export const PayslipParamsSchema = z.object({ id: ObjectIdStringSchema });

// --- notifications ----------------------------------------------------------------

export const NotificationSchema = z.object({
  id: ObjectIdStringSchema,
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string(),
  /** In-app path to open, e.g. /payroll. */
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;
export const NotificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
/** Marks the given notifications (or all, when `ids` is omitted) as read. */
export const NotificationReadRequestSchema = z.strictObject({
  ids: z.array(ObjectIdStringSchema).min(1).max(100).optional(),
});
export type NotificationReadRequest = z.infer<typeof NotificationReadRequestSchema>;
export const NotificationReadResponseSchema = z.object({
  updated: z.number().int(),
  unreadCount: z.number().int(),
});
export type NotificationReadResponse = z.infer<typeof NotificationReadResponseSchema>;

// --- dashboard ----------------------------------------------------------------

export const DashboardRequestSchema = z.object({
  id: ObjectIdStringSchema,
  humanId: z.string(),
  summary: z.string(),
  status: TicketStatusSchema,
  stage: z.string(),
  department: z.string(),
  updatedAt: z.string(),
});
export type DashboardRequest = z.infer<typeof DashboardRequestSchema>;

export const DashboardResponseSchema = z.object({
  profile: z.object({
    name: z.string(),
    firstName: z.string(),
    jobTitle: z.string(),
    department: z.string(),
    country: CountrySchema,
    employmentType: EmploymentTypeSchema,
  }),
  today: IsoDateSchema,
  tasks: z.object({
    open: z.number().int(),
    dueSoon: z.number().int(),
    items: z.array(TaskSchema),
  }),
  timesheet: z.object({
    weekStart: IsoDateSchema,
    days: z.array(TimesheetDaySchema),
    loggedHours: z.number(),
    requiredHours: z.number(),
    /** Past working days this week and last with fewer hours than required. */
    missingDays: z.array(IsoDateSchema),
  }),
  requests: z.object({
    active: z.number().int(),
    items: z.array(DashboardRequestSchema),
  }),
  payroll: z
    .object({ latest: PayslipSummarySchema.nullable(), paidByAgency: z.boolean() })
    .nullable(),
  notifications: z.object({
    unread: z.number().int(),
    items: z.array(NotificationSchema),
  }),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

// --- copilot actions (UC-05) ---------------------------------------------------------

/**
 * A timesheet change the copilot proposes. Built by code from the model's
 * extraction (dates resolved, projects mapped, rules checked); nothing is
 * saved until the employee confirms the exact entries shown.
 */
export const TimesheetActionEntrySchema = z.object({
  date: IsoDateSchema,
  projectId: ObjectIdStringSchema,
  projectName: z.string(),
  projectColor: z.string(),
  hours: z.number(),
  /** Hours already logged for this day and project (replaced by `hours`). */
  previousHours: z.number(),
  /** The day's total across projects after the change. */
  dayTotalAfter: z.number(),
  /** Logged after the day's pay period closed. */
  late: z.boolean(),
});
export type TimesheetActionEntry = z.infer<typeof TimesheetActionEntrySchema>;

export const TimesheetActionSchema = z.object({
  kind: z.enum(['timesheet_log']),
  entries: z.array(TimesheetActionEntrySchema).min(1),
});
export type TimesheetAction = z.infer<typeof TimesheetActionSchema>;

/** What happened when a confirmed action was applied. */
export const ActionResultSchema = z.object({
  status: z.enum(['applied', 'cancelled', 'failed']),
  message: z.string(),
  saved: z.number().int(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;
export const ActionConfirmResponseSchema = z.object({ result: ActionResultSchema });
export type ActionConfirmResponse = z.infer<typeof ActionConfirmResponseSchema>;

// Document → API DTO mappers for the employee workspace (shared contracts).
import type {
  AttendanceRecord,
  Notification,
  Payslip,
  PayslipSummary,
  Project,
  Task,
  TimesheetEntry,
} from '@sd/shared';
import type {
  AttendanceDoc,
  NotificationDoc,
  PayslipDoc,
  ProjectDoc,
  TaskDoc,
  TimesheetEntryDoc,
} from '../../db/schemas';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const toProject = (p: ProjectDoc): Project => ({
  id: p._id.toHexString(),
  code: p.code,
  name: p.name,
  client: p.client,
  color: p.color,
});

/** Tasks whose project is unknown are dropped by the caller. */
export function toTask(t: TaskDoc, project: ProjectDoc): Task {
  return {
    id: t._id.toHexString(),
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project: {
      id: project._id.toHexString(),
      code: project.code,
      name: project.name,
      color: project.color,
    },
    dueDate: t.dueDate,
    updatedAt: t.updatedAt.toISOString(),
    source: 'mock',
    url: null,
  };
}

export const toTimesheetEntry = (e: TimesheetEntryDoc): TimesheetEntry => ({
  id: e._id.toHexString(),
  date: e.date,
  projectId: e.projectId.toHexString(),
  hours: e.hours,
  note: e.note,
  source: e.source,
  late: e.late,
  updatedAt: e.updatedAt.toISOString(),
});

export const toAttendance = (a: AttendanceDoc): AttendanceRecord => ({
  date: a.date,
  status: a.status,
  note: a.note,
});

export function toPayslipSummary(p: PayslipDoc): PayslipSummary {
  const totalDeductions = p.deductions.reduce((sum, d) => sum + d.amount, 0);
  return {
    id: p._id.toHexString(),
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    payDate: p.payDate,
    currency: p.currency,
    gross: round2(p.gross),
    totalDeductions: round2(totalDeductions),
    net: round2(p.net),
    lopAmount: round2(
      p.deductions.filter((d) => d.code === 'lop').reduce((sum, d) => sum + d.amount, 0),
    ),
  };
}

export const toPayslip = (p: PayslipDoc): Payslip => ({
  ...toPayslipSummary(p),
  earnings: p.earnings.map(({ code, label, amount }) => ({ code, label, amount })),
  deductions: p.deductions.map(({ code, label, amount, dates, note }) => ({
    code,
    label,
    amount,
    dates,
    note,
  })),
});

export const toNotification = (n: NotificationDoc): Notification => ({
  id: n._id.toHexString(),
  kind: n.kind,
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

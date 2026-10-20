// "Needs your attention" (UC-12, ADR-024): what the employee should act on,
// computed from their own records. Pure, no I/O and no model (Build Contract
// v2.0, rule E.2). The Loss of Pay rule follows corpus hr-loss-of-pay and
// hr-timesheet-policy: a working day with no timesheet and no attendance
// record, or marked absent, at its payroll cutoff.
import type { AttendanceStatus, AttentionItem, IsoDate, TimesheetDay } from '@sd/shared';
import { addDays, type HolidayCalendar, isWorkingDay, workingDays } from './workday';

export interface PayrollCutoffRules {
  cutoffWorkingDays: number;
  urgentWithinWorkingDays: number;
}

/** Payroll cutoff of a day: the Nth working day after it. Hours logged on that day still count. */
export function payrollCutoff(date: IsoDate, workingDaysAfter: number, holidays: HolidayCalendar) {
  let day = date;
  for (let left = workingDaysAfter; left > 0;) {
    day = addDays(day, 1);
    if (isWorkingDay(day, holidays)) left -= 1;
  }
  return day;
}

/** True when the day, as it stands, would be treated as Loss of Pay at its cutoff. */
export function wouldBeLop(day: TimesheetDay, attendance: AttendanceStatus | undefined): boolean {
  if (day.status !== 'missing' && day.status !== 'partial') return false;
  return day.hours === 0 && (attendance === undefined || attendance === 'absent');
}

export interface AttentionInput {
  today: IsoDate;
  /** Day statuses for the window to check, in date order. */
  days: readonly TimesheetDay[];
  /** Attendance status per date in the window (no entry = no record). */
  attendance: ReadonlyMap<IsoDate, AttendanceStatus>;
  /** Loss of Pay applies to full-time employees only. */
  lopApplies: boolean;
  /** Dates already deducted as Loss of Pay on a payslip (shown by the payroll card instead). */
  deductedLopDates: ReadonlySet<IsoDate>;
  waitingRequests: readonly { id: string; humanId: string; summary: string }[];
  rules: PayrollCutoffRules;
  holidays: HolidayCalendar;
}

const KIND_ORDER: Record<AttentionItem['kind'], number> = {
  lop_risk: 0,
  timesheet_gap: 1,
  request_waiting: 2,
};
const dateOf = (item: AttentionItem) => ('date' in item ? item.date : '');

/** Attention items, most urgent first: urgent before normal, then by kind, then oldest day first. */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { today, rules, holidays } = input;
  const items: AttentionItem[] = [];

  for (const day of input.days) {
    if (day.status !== 'missing' && day.status !== 'partial') continue;
    const lop = input.lopApplies && wouldBeLop(day, input.attendance.get(day.date));
    const cutoff = payrollCutoff(day.date, rules.cutoffWorkingDays, holidays);
    const gap = (lopCutoff: IsoDate | null, urgent: boolean): AttentionItem => ({
      kind: 'timesheet_gap',
      severity: urgent ? 'urgent' : 'normal',
      date: day.date,
      hours: day.hours,
      requiredHours: day.requiredHours,
      lopCutoff,
    });

    if (today > cutoff) {
      if (!lop) items.push(gap(null, false));
      else if (!input.deductedLopDates.has(day.date)) {
        items.push({ kind: 'lop_risk', severity: 'urgent', date: day.date, cutoff });
      }
      continue;
    }
    const workingDaysLeft = workingDays(addDays(today, 1), cutoff, holidays).length;
    items.push(
      lop ? gap(cutoff, workingDaysLeft <= rules.urgentWithinWorkingDays) : gap(null, false),
    );
  }

  for (const request of input.waitingRequests) {
    items.push({ kind: 'request_waiting', severity: 'normal', request });
  }

  return items.sort(
    (a, b) =>
      Number(b.severity === 'urgent') - Number(a.severity === 'urgent') ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      dateOf(a).localeCompare(dateOf(b)),
  );
}

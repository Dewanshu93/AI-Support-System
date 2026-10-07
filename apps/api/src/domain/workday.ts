// Working-time rules (UC-01): calendar days, timesheet day status, entry
// validation and pay periods. Pure functions, no I/O. Dates are "YYYY-MM-DD"
// UTC calendar days, compared as strings.
import type { Country, DayStatus, IsoDate } from '@sd/shared';

const DAY_MS = 86_400_000;

const toTime = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number): IsoDate => new Date(time).toISOString().slice(0, 10);

export const isoDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);
export const addDays = (date: IsoDate, days: number): IsoDate =>
  fromTime(toTime(date) + days * DAY_MS);
export const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((toTime(to) - toTime(from)) / DAY_MS);
/** 0 = Sunday … 6 = Saturday. */
export const dayOfWeek = (date: IsoDate) => new Date(toTime(date)).getUTCDay();
export const isWeekend = (date: IsoDate) => [0, 6].includes(dayOfWeek(date));

/** Monday of the ISO week containing `date`. */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

/** Every day from `from` to `to`, inclusive. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export const lastDayOfMonth = (date: IsoDate): IsoDate => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return isoDate(new Date(Date.UTC(y, m, 0)));
};
export const firstDayOfMonth = (date: IsoDate): IsoDate => `${date.slice(0, 7)}-01`;

export type HolidayCalendar = ReadonlyMap<IsoDate, string>;

export function holidayCalendar(
  holidays: readonly { date: string; name: string }[],
): HolidayCalendar {
  return new Map(holidays.map((h) => [h.date, h.name]));
}

export const isWorkingDay = (date: IsoDate, holidays: HolidayCalendar) =>
  !isWeekend(date) && !holidays.has(date);

export function workingDays(from: IsoDate, to: IsoDate, holidays: HolidayCalendar): IsoDate[] {
  return dateRange(from, to).filter((d) => isWorkingDay(d, holidays));
}

// --- day status --------------------------------------------------------------------

export interface DayStatusInput {
  date: IsoDate;
  today: IsoDate;
  hours: number;
  requiredHours: number;
  holidays: HolidayCalendar;
  /** True when attendance records approved leave for the day. */
  onLeave?: boolean;
}

/**
 * Status of one day in the timesheet view. Non-working days (weekend, holiday,
 * leave) are never "missing"; a past working day with too few hours is.
 */
export function dayStatus(input: DayStatusInput): { status: DayStatus; label: string | null } {
  const { date, today, hours, requiredHours, holidays } = input;
  if (isWeekend(date)) return { status: 'weekend', label: null };
  const holiday = holidays.get(date);
  if (holiday) return { status: 'holiday', label: holiday };
  if (input.onLeave) return { status: 'leave', label: 'Leave' };
  if (hours >= requiredHours) return { status: 'complete', label: null };
  if (date > today) return { status: 'future', label: null };
  if (date === today) return { status: 'today', label: null };
  return { status: hours > 0 ? 'partial' : 'missing', label: null };
}

// --- entry validation -------------------------------------------------------------

export interface TimesheetRules {
  requiredHoursPerDay: number;
  maxHoursPerDay: number;
  hourStep: number;
  maxBackDays: number;
}

export interface CellToValidate {
  date: IsoDate;
  projectId: string;
  hours: number;
}

export interface CellProblem {
  date: IsoDate;
  projectId: string;
  field: 'date' | 'projectId' | 'hours';
  message: string;
}

export const earliestLoggableDate = (today: IsoDate, rules: TimesheetRules) =>
  addDays(today, -rules.maxBackDays);

/**
 * Validates the cells of one save. `existingHours(date, projectId)` returns the
 * stored hours for the cell, so day totals include entries the save does not
 * touch. Every rule here is enforced in code for the form and the copilot alike.
 */
export function validateCells(
  cells: readonly CellToValidate[],
  context: {
    today: IsoDate;
    rules: TimesheetRules;
    allowedProjectIds: ReadonlySet<string>;
    /** Stored hours per date, by project. */
    existing: ReadonlyMap<IsoDate, ReadonlyMap<string, number>>;
  },
): CellProblem[] {
  const { today, rules, allowedProjectIds, existing } = context;
  const problems: CellProblem[] = [];
  const earliest = earliestLoggableDate(today, rules);
  const seen = new Set<string>();

  for (const cell of cells) {
    const add = (field: CellProblem['field'], message: string) =>
      problems.push({ date: cell.date, projectId: cell.projectId, field, message });
    const key = `${cell.date}|${cell.projectId}`;
    if (seen.has(key)) add('date', 'appears more than once in this save');
    seen.add(key);
    if (cell.date > today) add('date', 'cannot log time for a future date');
    if (cell.date < earliest) {
      add('date', `can only log time for the last ${rules.maxBackDays} days (from ${earliest})`);
    }
    if (!allowedProjectIds.has(cell.projectId)) add('projectId', 'is not one of your projects');
    if (cell.hours < 0) add('hours', 'cannot be negative');
    if (Math.abs(cell.hours / rules.hourStep - Math.round(cell.hours / rules.hourStep)) > 1e-9) {
      add('hours', `must be in steps of ${rules.hourStep}`);
    }
  }

  // Day totals after the save: stored hours, overridden by the cells being saved.
  const byDate = new Map<IsoDate, Map<string, number>>();
  for (const cell of cells) {
    if (!byDate.has(cell.date)) byDate.set(cell.date, new Map(existing.get(cell.date) ?? []));
    byDate.get(cell.date)!.set(cell.projectId, cell.hours);
  }
  for (const [date, projects] of byDate) {
    const total = [...projects.values()].reduce((sum, h) => sum + h, 0);
    if (total > rules.maxHoursPerDay) {
      const cell = cells.find((c) => c.date === date)!;
      problems.push({
        date,
        projectId: cell.projectId,
        field: 'hours',
        message: `would make the day total ${total} hours (maximum ${rules.maxHoursPerDay})`,
      });
    }
  }
  return problems;
}

// --- pay periods -------------------------------------------------------------------

/**
 * Pay period containing `date` (corpus hr-payroll-and-payslips): US employees
 * are paid semi-monthly (1st–15th, 16th–end), UK employees monthly.
 */
export function payPeriodFor(date: IsoDate, country: Country): { start: IsoDate; end: IsoDate } {
  const first = firstDayOfMonth(date);
  const last = lastDayOfMonth(date);
  if (country === 'UK') return { start: first, end: last };
  const fifteenth = `${date.slice(0, 7)}-15`;
  return date <= fifteenth
    ? { start: first, end: fifteenth }
    : { start: addDays(fifteenth, 1), end: last };
}

/** Pay date of a period: US on the period end, UK on the 25th; moved back to a working day. */
export function payDateFor(
  period: { start: IsoDate; end: IsoDate },
  country: Country,
  holidays: HolidayCalendar,
): IsoDate {
  let day = country === 'UK' ? `${period.start.slice(0, 7)}-25` : period.end;
  while (!isWorkingDay(day, holidays)) day = addDays(day, -1);
  return day;
}

/** An entry is late when its pay period had already ended on the day it was logged. */
export const isLateEntry = (date: IsoDate, loggedOn: IsoDate, country: Country) =>
  payPeriodFor(date, country).end < loggedOn;

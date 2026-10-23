// Bulk timesheet requests (UC-13, amendment A-1): code expands "fill my missing
// days" or "copy last week" into the exact cells to propose. Pure; the model only
// says which kind of request it is (P-10 v2), never which days or how many hours.
import type { IsoDate, TimesheetDay } from '@sd/shared';
import { addDays } from './workday';

export interface BulkCell {
  date: IsoDate;
  projectId: string;
  hours: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every missing or partial past working day in `days` (this week and last, as in
 * "Which days am I missing?") gets the project: the given hours, or what is left
 * of the required hours when none are given.
 */
export function fillMissingDays(
  days: readonly TimesheetDay[],
  projectId: string,
  hours: number | null,
): BulkCell[] {
  return days
    .filter((d) => d.status === 'missing' || d.status === 'partial')
    .map((d) => ({
      date: d.date,
      projectId,
      hours: hours ?? round2(d.requiredHours - d.hours),
    }))
    .filter((c) => c.hours > 0);
}

/**
 * This week's empty working days up to today take last week's entries for the same
 * weekday. Days with any hours, non-working days (weekend, holiday, leave) and days
 * whose weekday last week was empty are skipped.
 */
export function copyLastWeek(
  thisWeek: readonly TimesheetDay[],
  lastWeekEntries: readonly BulkCell[],
): BulkCell[] {
  const empty = thisWeek.filter(
    (d) => (d.status === 'missing' || d.status === 'today') && d.hours === 0,
  );
  return empty.flatMap((d) =>
    lastWeekEntries
      .filter((e) => e.date === addDays(d.date, -7) && e.hours > 0)
      .map((e) => ({ date: d.date, projectId: e.projectId, hours: e.hours })),
  );
}

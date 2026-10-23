import type { TimesheetDay } from '@sd/shared';
import { copyLastWeek, fillMissingDays } from './timesheetBulk';

const day = (date: string, status: TimesheetDay['status'], hours = 0): TimesheetDay => ({
  date,
  status,
  hours,
  requiredHours: ['weekend', 'holiday', 'leave'].includes(status) ? 0 : 8,
  label: null,
});
const BANK = 'b'.repeat(24);
const API = 'a'.repeat(24);

describe('fillMissingDays', () => {
  const days = [
    day('2026-09-28', 'complete', 8),
    day('2026-09-29', 'partial', 5),
    day('2026-09-30', 'missing'),
    day('2026-10-03', 'weekend'),
    day('2026-10-05', 'leave'),
    day('2026-10-06', 'missing'),
    day('2026-10-07', 'today'),
  ];

  it('fills each missing or partial day up to the required hours when none are given', () => {
    expect(fillMissingDays(days, BANK, null)).toEqual([
      { date: '2026-09-29', projectId: BANK, hours: 3 },
      { date: '2026-09-30', projectId: BANK, hours: 8 },
      { date: '2026-10-06', projectId: BANK, hours: 8 },
    ]);
  });

  it('uses the given hours on every gap (the timesheet rules then check day totals)', () => {
    expect(fillMissingDays(days, BANK, 8).map((c) => [c.date, c.hours])).toEqual([
      ['2026-09-29', 8],
      ['2026-09-30', 8],
      ['2026-10-06', 8],
    ]);
  });

  it('returns nothing when no day needs hours', () => {
    expect(fillMissingDays([day('2026-10-05', 'complete', 8)], BANK, null)).toEqual([]);
  });
});

describe('copyLastWeek', () => {
  // Last week Mon 28 Sep – Fri 2 Oct; this week Mon 5 – today Wed 7 Oct.
  const lastWeek = [
    { date: '2026-09-28', projectId: BANK, hours: 6 },
    { date: '2026-09-28', projectId: API, hours: 2 },
    { date: '2026-09-29', projectId: BANK, hours: 8 },
    { date: '2026-09-30', projectId: API, hours: 8 },
  ];

  it('copies the same weekday into empty days up to today, every project', () => {
    const thisWeek = [
      day('2026-10-05', 'missing'),
      day('2026-10-06', 'missing'),
      day('2026-10-07', 'today'),
    ];
    expect(copyLastWeek(thisWeek, lastWeek)).toEqual([
      { date: '2026-10-05', projectId: BANK, hours: 6 },
      { date: '2026-10-05', projectId: API, hours: 2 },
      { date: '2026-10-06', projectId: BANK, hours: 8 },
      { date: '2026-10-07', projectId: API, hours: 8 },
    ]);
  });

  it('skips days with hours, non-working days, future days and empty source days', () => {
    const thisWeek = [
      day('2026-10-05', 'partial', 4),
      day('2026-10-06', 'holiday'),
      day('2026-10-07', 'today'),
      day('2026-10-08', 'future'),
    ];
    expect(
      copyLastWeek(thisWeek, [lastWeek[0]!, { date: '2026-10-01', projectId: BANK, hours: 8 }]),
    ).toEqual([]);
  });
});

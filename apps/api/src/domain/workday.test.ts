import { loadConfig } from '../config';
import {
  addDays,
  dayStatus,
  holidayCalendar,
  isLateEntry,
  payDateFor,
  payPeriodFor,
  validateCells,
  weekStartOf,
  workingDays,
} from './workday';

const config = loadConfig({
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk',
  JWT_SECRET: 'test-secret-that-is-at-least-32-bytes-long',
});
const US = holidayCalendar(config.workday.holidays.US);
const UK = holidayCalendar(config.workday.holidays.UK);
const rules = config.workday.timesheet;

describe('calendar', () => {
  it('finds the Monday of a week and adds days across months', () => {
    expect(weekStartOf('2026-10-07')).toBe('2026-10-05'); // Wednesday
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('excludes weekends and the country holidays from working days', () => {
    // September 2026: 22 weekdays; Labor Day (7 Sep) is a US holiday only.
    expect(workingDays('2026-09-01', '2026-09-30', US)).toHaveLength(21);
    expect(workingDays('2026-09-01', '2026-09-30', UK)).toHaveLength(22);
  });
});

describe('dayStatus', () => {
  const base = { today: '2026-10-07', requiredHours: 8, holidays: US };

  it.each([
    ['2026-10-10', 0, false, 'weekend'],
    ['2026-09-07', 0, false, 'holiday'],
    ['2026-10-02', 0, true, 'leave'],
    ['2026-10-06', 8, false, 'complete'],
    ['2026-10-06', 4, false, 'partial'],
    ['2026-10-06', 0, false, 'missing'],
    ['2026-10-07', 0, false, 'today'],
    ['2026-10-07', 8, false, 'complete'],
    ['2026-10-08', 0, false, 'future'],
  ] as const)('%s with %d h (leave %s) is %s', (date, hours, onLeave, expected) => {
    expect(dayStatus({ ...base, date, hours, onLeave }).status).toBe(expected);
  });

  it('labels holidays with their name', () => {
    expect(dayStatus({ ...base, date: '2026-09-07', hours: 0 }).label).toBe('Labor Day');
  });
});

describe('validateCells', () => {
  const projects = new Set(['p1', 'p2']);
  const validate = (
    cells: { date: string; projectId: string; hours: number }[],
    existing = new Map(),
  ) => validateCells(cells, { today: '2026-10-07', rules, allowedProjectIds: projects, existing });

  it('accepts a valid late entry for an earlier month', () => {
    expect(validate([{ date: '2026-09-11', projectId: 'p1', hours: 8 }])).toEqual([]);
  });

  it('rejects future dates, dates beyond the window, unknown projects and bad steps', () => {
    const problems = validate([
      { date: '2026-10-08', projectId: 'p1', hours: 8 },
      { date: '2026-07-01', projectId: 'p1', hours: 8 },
      { date: '2026-10-06', projectId: 'other', hours: 8 },
      { date: '2026-10-05', projectId: 'p2', hours: 2.25 },
    ]);
    expect(problems.map((p) => p.field)).toEqual(['date', 'date', 'projectId', 'hours']);
    expect(problems[0]!.message).toContain('future');
  });

  it('checks the day total including entries the save does not touch', () => {
    const existing = new Map([['2026-10-06', new Map([['p2', 8]])]]);
    const problems = validate([{ date: '2026-10-06', projectId: 'p1', hours: 5 }], existing);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain('13 hours');
    // Replacing the stored cell instead stays within the limit.
    expect(validate([{ date: '2026-10-06', projectId: 'p2', hours: 5 }], existing)).toEqual([]);
  });

  it('rejects the same cell twice in one save', () => {
    const cell = { date: '2026-10-06', projectId: 'p1', hours: 2 };
    expect(validate([cell, cell]).some((p) => p.message.includes('more than once'))).toBe(true);
  });
});

describe('pay periods', () => {
  it('splits US months in two and keeps UK months whole', () => {
    expect(payPeriodFor('2026-09-11', 'US')).toEqual({ start: '2026-09-01', end: '2026-09-15' });
    expect(payPeriodFor('2026-09-16', 'US')).toEqual({ start: '2026-09-16', end: '2026-09-30' });
    expect(payPeriodFor('2026-09-11', 'UK')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('moves pay dates back to the previous working day', () => {
    // 15 Aug 2026 is a Saturday; 25 Oct 2026 is a Sunday.
    expect(payDateFor({ start: '2026-08-01', end: '2026-08-15' }, 'US', US)).toBe('2026-08-14');
    expect(payDateFor({ start: '2026-10-01', end: '2026-10-31' }, 'UK', UK)).toBe('2026-10-23');
  });

  it('marks an entry late once its pay period has ended', () => {
    expect(isLateEntry('2026-09-11', '2026-10-07', 'US')).toBe(true);
    expect(isLateEntry('2026-10-06', '2026-10-07', 'US')).toBe(false);
  });
});

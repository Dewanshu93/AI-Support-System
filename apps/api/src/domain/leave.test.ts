import { loadConfig } from '../config';
import { canCancelLeave, checkLeave, type LeaveRecord, leaveBalances } from './leave';
import { holidayCalendar, workingDays } from './workday';

const config = loadConfig({
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk',
  JWT_SECRET: 'test-secret-that-is-at-least-32-bytes-long',
});
const rules = config.workday.leave;
const US = holidayCalendar(config.workday.holidays.US);
const TODAY = '2026-10-07'; // Wednesday

const context = (
  existing: LeaveRecord[] = [],
  over: Partial<Parameters<typeof checkLeave>[1]> = {},
) => ({
  today: TODAY,
  country: 'US' as const,
  employmentType: 'full_time' as const,
  rules,
  holidays: US,
  existing,
  ...over,
});
const messages = (r: ReturnType<typeof checkLeave>) =>
  r.problems.map((p) => `${p.field}: ${p.message}`);

describe('leaveBalances', () => {
  it('subtracts approved and pending days of the year from the entitlement', () => {
    const balances = leaveBalances(rules, 'US', 2026, [
      { type: 'annual', status: 'approved', dates: ['2026-07-06', '2026-07-07', '2026-07-08'] },
      { type: 'annual', status: 'pending', dates: ['2026-11-02'] },
      { type: 'annual', status: 'rejected', dates: ['2026-11-09'] },
      { type: 'annual', status: 'approved', dates: ['2025-12-29'] }, // last year
      { type: 'sick', status: 'approved', dates: ['2026-03-02'] },
    ]);
    expect(balances).toEqual([
      {
        type: 'annual',
        label: 'Annual leave',
        entitlement: 15,
        used: 3,
        pending: 1,
        available: 11,
      },
      { type: 'sick', label: 'Sick leave', entitlement: 10, used: 1, pending: 0, available: 9 },
      { type: 'casual', label: 'Casual leave', entitlement: 6, used: 0, pending: 0, available: 6 },
    ]);
  });

  it('uses the country entitlement', () => {
    const [annual] = leaveBalances(rules, 'UK', 2026, []);
    expect(annual).toMatchObject({ entitlement: 25, available: 25 });
  });
});

describe('checkLeave', () => {
  it('accepts a short annual leave in the future and counts working days only', () => {
    // Fri 23 – Tue 27 Oct: Fri, Mon, Tue.
    const r = checkLeave(
      { type: 'annual', startDate: '2026-10-23', endDate: '2026-10-27' },
      context(),
    );
    expect(r).toEqual({
      dates: ['2026-10-23', '2026-10-26', '2026-10-27'],
      problems: [],
      warnings: [],
      availableAfter: 12,
    });
  });

  it('skips public holidays', () => {
    // Thanksgiving (26 Nov) and the day after are US holidays.
    const r = checkLeave(
      { type: 'annual', startDate: '2026-11-25', endDate: '2026-11-27' },
      context(),
    );
    expect(r.dates).toEqual(['2026-11-25']);
  });

  it('warns about short notice for longer annual leave without blocking it', () => {
    const r = checkLeave(
      { type: 'annual', startDate: '2026-10-12', endDate: '2026-10-15' },
      context(),
    );
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([
      "Annual leave of more than 3 working days needs 10 working days' notice; your manager may decline a late request.",
    ]);
  });

  it('blocks contractors, past dates, cross-year ranges and weekend-only ranges', () => {
    expect(
      messages(
        checkLeave(
          { type: 'annual', startDate: '2026-10-26', endDate: '2026-10-26' },
          context([], { employmentType: 'contractor' }),
        ),
      ),
    ).toEqual([
      'type: contractors do not book leave here: agree time off with your manager and your agency',
    ]);
    expect(
      messages(
        checkLeave({ type: 'casual', startDate: '2026-10-06', endDate: '2026-10-06' }, context()),
      ),
    ).toEqual(['startDate: Casual leave cannot start in the past']);
    expect(
      messages(
        checkLeave({ type: 'annual', startDate: '2026-12-31', endDate: '2027-01-04' }, context()),
      ),
    ).toEqual(['endDate: must be in the same calendar year as the start']);
    expect(
      messages(
        checkLeave({ type: 'annual', startDate: '2026-10-10', endDate: '2026-10-11' }, context()),
      ),
    ).toEqual(['startDate: the dates contain no working days']);
  });

  it('records sick leave only for today or the recent past, with the doctor-note reminder', () => {
    expect(
      messages(
        checkLeave({ type: 'sick', startDate: '2026-10-08', endDate: '2026-10-08' }, context()),
      ),
    ).toEqual(['endDate: sick leave is recorded for today or past days']);
    expect(
      messages(
        checkLeave({ type: 'sick', startDate: '2026-09-01', endDate: '2026-09-01' }, context()),
      ),
    ).toEqual(['startDate: sick leave can be recorded for the last 30 days (from 2026-09-07)']);
    const long = checkLeave(
      { type: 'sick', startDate: '2026-09-28', endDate: '2026-10-01' },
      context(),
    );
    expect(long.problems).toEqual([]);
    expect(long.warnings).toEqual(["A doctor's note is needed after 3 consecutive days."]);
  });

  it('limits casual leave to two days and reminds about notice', () => {
    expect(
      messages(
        checkLeave({ type: 'casual', startDate: '2026-10-12', endDate: '2026-10-14' }, context()),
      ),
    ).toEqual(['endDate: Casual leave is at most 2 working days at a time']);
    const tomorrow = checkLeave(
      { type: 'casual', startDate: '2026-10-08', endDate: '2026-10-08' },
      context(),
    );
    expect(tomorrow.problems).toEqual([]);
    expect(tomorrow.warnings).toEqual([
      "Casual leave needs 1 working day's notice except in an emergency: tell your manager as well.",
    ]);
  });

  it('sends annual leave over 15 days to the department head', () => {
    // 17 working days; a UK employee has the balance for it.
    const r = checkLeave(
      { type: 'annual', startDate: '2026-11-02', endDate: '2026-11-24' },
      context([], { country: 'UK', holidays: holidayCalendar(config.workday.holidays.UK) }),
    );
    expect(messages(r)).toEqual([
      'endDate: Annual leave of more than 15 working days needs the department head: raise an HR request instead',
    ]);
  });

  it('blocks overlaps with pending or approved leave, but not with cancelled or rejected', () => {
    const existing: LeaveRecord[] = [
      { type: 'casual', status: 'pending', dates: ['2026-10-26'] },
      { type: 'annual', status: 'cancelled', dates: ['2026-10-27'] },
    ];
    const r = checkLeave(
      { type: 'annual', startDate: '2026-10-26', endDate: '2026-10-27' },
      context(existing),
    );
    expect(messages(r)).toEqual(['startDate: you already have leave on 2026-10-26']);
  });

  it('blocks a request beyond the balance', () => {
    const fourteen = workingDays('2026-06-01', '2026-06-18', US).slice(0, 14);
    const r = checkLeave(
      { type: 'annual', startDate: '2026-10-26', endDate: '2026-10-27' },
      context([{ type: 'annual', status: 'approved', dates: fourteen }]),
    );
    expect(r.availableAfter).toBe(-1);
    expect(messages(r)).toEqual([
      'endDate: only 1 day of annual leave left in 2026; days beyond your entitlement are Loss of Pay',
    ]);
  });
});

describe('canCancelLeave', () => {
  it('allows pending requests and approved ones that have not started', () => {
    expect(canCancelLeave({ status: 'pending', dates: ['2026-10-01'] }, TODAY)).toBe(true);
    expect(canCancelLeave({ status: 'approved', dates: ['2026-10-08'] }, TODAY)).toBe(true);
    expect(canCancelLeave({ status: 'approved', dates: ['2026-10-07'] }, TODAY)).toBe(false);
    expect(canCancelLeave({ status: 'rejected', dates: ['2026-10-20'] }, TODAY)).toBe(false);
  });
});

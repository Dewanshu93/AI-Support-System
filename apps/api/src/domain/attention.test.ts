import type { AttendanceStatus, TimesheetDay } from '@sd/shared';
import { loadConfig } from '../config';
import { type AttentionInput, attentionItems, payrollCutoff, wouldBeLop } from './attention';
import { holidayCalendar } from './workday';

const config = loadConfig({
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk',
  JWT_SECRET: 'test-secret-that-is-at-least-32-bytes-long',
});
const US = holidayCalendar(config.workday.holidays.US);
const UK = holidayCalendar(config.workday.holidays.UK);
const rules = config.workday.payroll;
const TODAY = '2026-10-20'; // Tuesday

const day = (date: string, status: TimesheetDay['status'], hours = 0): TimesheetDay => ({
  date,
  status,
  hours,
  requiredHours: 8,
  label: null,
});

function input(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    today: TODAY,
    days: [],
    attendance: new Map(),
    lopApplies: true,
    deductedLopDates: new Set(),
    waitingRequests: [],
    rules,
    holidays: US,
    ...over,
  };
}

describe('leave expiring', () => {
  const annualLeave = { available: 12, carryOverDays: 5, reminderFrom: '10-01' };

  it('reminds about annual leave beyond the carry-over from the reminder date', () => {
    expect(attentionItems(input({ annualLeave }))).toEqual([
      {
        kind: 'leave_expiring',
        severity: 'normal',
        available: 12,
        carryOverDays: 5,
        expiresOn: '2026-12-31',
      },
    ]);
  });

  it('stays quiet before the reminder date, within the carry-over, or without leave', () => {
    expect(attentionItems(input({ annualLeave, today: '2026-09-30' }))).toEqual([]);
    expect(attentionItems(input({ annualLeave: { ...annualLeave, available: 5 } }))).toEqual([]);
    expect(attentionItems(input({ annualLeave: null }))).toEqual([]);
  });
});

describe('payrollCutoff', () => {
  it('is the fifth working day after the day', () => {
    expect(payrollCutoff('2026-10-12', 5, US)).toBe('2026-10-19'); // Mon → next Mon
    expect(payrollCutoff('2026-10-16', 5, US)).toBe('2026-10-23'); // Fri → next Fri
  });

  it('skips weekends and the country holidays', () => {
    // Labor Day (Mon 7 Sep) is a US holiday only.
    expect(payrollCutoff('2026-09-04', 5, US)).toBe('2026-09-14');
    expect(payrollCutoff('2026-09-04', 5, UK)).toBe('2026-09-11');
  });
});

describe('wouldBeLop', () => {
  it.each<[TimesheetDay, AttendanceStatus | undefined, boolean]>([
    [day('2026-10-12', 'missing'), undefined, true], // no timesheet, no attendance record
    [day('2026-10-12', 'missing'), 'absent', true],
    [day('2026-10-12', 'missing'), 'present', false], // attended: reminder only
    [day('2026-10-12', 'missing'), 'remote', false],
    [day('2026-10-12', 'partial', 4), undefined, false], // some hours logged
    [day('2026-10-12', 'leave'), 'leave', false],
    [day('2026-10-12', 'complete', 8), undefined, false],
  ])('%o with attendance %s → %s', (d, attendance, expected) => {
    expect(wouldBeLop(d, attendance)).toBe(expected);
  });
});

describe('attentionItems', () => {
  it('flags a day past its cutoff that would be Loss of Pay', () => {
    expect(attentionItems(input({ days: [day('2026-10-12', 'missing')] }))).toEqual([
      { kind: 'lop_risk', severity: 'urgent', date: '2026-10-12', cutoff: '2026-10-19' },
    ]);
  });

  it('leaves out days already deducted on a payslip', () => {
    const items = attentionItems(
      input({ days: [day('2026-10-12', 'missing')], deductedLopDates: new Set(['2026-10-12']) }),
    );
    expect(items).toEqual([]);
  });

  it('marks a Loss of Pay risk urgent only when its cutoff is close', () => {
    const items = attentionItems(
      input({
        days: [day('2026-10-14', 'missing'), day('2026-10-16', 'missing')],
        attendance: new Map([['2026-10-14', 'absent']]),
      }),
    );
    expect(items).toEqual([
      // Cutoff Wed 21 Oct: one working day left.
      expect.objectContaining({ date: '2026-10-14', severity: 'urgent', lopCutoff: '2026-10-21' }),
      // Cutoff Fri 23 Oct: three working days left.
      expect.objectContaining({ date: '2026-10-16', severity: 'normal', lopCutoff: '2026-10-23' }),
    ]);
  });

  it('counts the cutoff day itself as still in time', () => {
    // Cutoff of Tue 13 Oct is today.
    const [item] = attentionItems(input({ days: [day('2026-10-13', 'missing')] }));
    expect(item).toMatchObject({ kind: 'timesheet_gap', severity: 'urgent', lopCutoff: TODAY });
  });

  it('reminds about attended or partial days without a Loss of Pay warning', () => {
    const items = attentionItems(
      input({
        days: [day('2026-10-08', 'missing'), day('2026-10-15', 'partial', 4)],
        attendance: new Map([['2026-10-08', 'present']]),
      }),
    );
    expect(items).toEqual([
      {
        kind: 'timesheet_gap',
        severity: 'normal',
        date: '2026-10-08',
        hours: 0,
        requiredHours: 8,
        lopCutoff: null,
      },
      {
        kind: 'timesheet_gap',
        severity: 'normal',
        date: '2026-10-15',
        hours: 4,
        requiredHours: 8,
        lopCutoff: null,
      },
    ]);
  });

  it('never warns about Loss of Pay when it does not apply (contractors)', () => {
    const items = attentionItems(
      input({ days: [day('2026-10-12', 'missing')], lopApplies: false }),
    );
    expect(items).toEqual([expect.objectContaining({ kind: 'timesheet_gap', lopCutoff: null })]);
  });

  it('ignores days that need nothing', () => {
    const days = (['complete', 'today', 'future', 'weekend', 'holiday', 'leave'] as const).map(
      (s) => day('2026-10-12', s),
    );
    expect(attentionItems(input({ days }))).toEqual([]);
  });

  it('orders urgent first, then by kind, then oldest day first', () => {
    const request = { id: 'a'.repeat(24), humanId: 'HR-0001', summary: 'LOP review' };
    const items = attentionItems(
      input({
        days: [
          day('2026-10-08', 'partial', 4),
          day('2026-10-12', 'missing'),
          day('2026-10-14', 'missing'),
          day('2026-10-16', 'missing'),
        ],
        waitingRequests: [request],
      }),
    );
    expect(
      items.map((i) => [
        i.kind,
        i.severity,
        'date' in i ? i.date : 'request' in i ? i.request.humanId : null,
      ]),
    ).toEqual([
      ['lop_risk', 'urgent', '2026-10-12'],
      ['timesheet_gap', 'urgent', '2026-10-14'],
      ['timesheet_gap', 'normal', '2026-10-08'],
      ['timesheet_gap', 'normal', '2026-10-16'],
      ['request_waiting', 'normal', 'HR-0001'],
    ]);
  });
});

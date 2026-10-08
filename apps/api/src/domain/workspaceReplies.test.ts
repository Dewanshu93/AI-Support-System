import type { TimesheetDay } from '@sd/shared';
import {
  lateLoggingLines,
  lopDatesText,
  payPeriodText,
  payrollEmailLines,
  type PayrollFacts,
  payrollFactsForModel,
  payrollNextSteps,
  payrollRecordsText,
  payrollReply,
  requestStatusReply,
  timesheetStatusReply,
  withoutPayrollRecords,
} from './workspaceReplies';

const day = (
  date: string,
  status: TimesheetDay['status'],
  hours = 0,
  label: string | null = null,
) => ({
  date,
  status,
  hours,
  requiredHours: ['weekend', 'holiday', 'leave'].includes(status) ? 0 : 8,
  label,
});

describe('timesheetStatusReply', () => {
  // Last week Mon 28 Sep – Sun 4 Oct, this week Mon 5 Oct – today Wed 7 Oct.
  const days: TimesheetDay[] = [
    day('2026-09-28', 'complete', 8),
    day('2026-09-29', 'partial', 4),
    day('2026-09-30', 'complete', 8),
    day('2026-10-01', 'leave', 0, 'Leave'),
    day('2026-10-02', 'complete', 8),
    day('2026-10-03', 'weekend'),
    day('2026-10-04', 'weekend'),
    day('2026-10-05', 'complete', 8),
    day('2026-10-06', 'missing'),
    day('2026-10-07', 'today'),
  ];

  it('states this week’s hours and lists every day that needs hours, from the records', () => {
    const text = timesheetStatusReply(days, '2026-10-07');
    expect(text).toContain('logged 8 h of the 24 h due so far');
    expect(text).toContain('2 working days need hours');
    expect(text).toContain('Tue 29 Sept: 4 h of 8 h');
    expect(text).toContain('Tue 6 Oct: nothing logged');
    expect(text).toContain('Loss of Pay');
    expect(text).toContain('Not counted: Thu 1 Oct (Leave)');
  });

  it('says so when nothing is missing', () => {
    const complete = days.map((d) =>
      d.status === 'missing' || d.status === 'partial'
        ? { ...d, status: 'complete' as const, hours: 8 }
        : d,
    );
    expect(timesheetStatusReply(complete, '2026-10-07')).toContain('has its hours logged');
  });
});

describe('requestStatusReply', () => {
  it('lists open requests with their stage, flags those waiting, then the last closed one', () => {
    const text = requestStatusReply([
      { humanId: 'IT-9001', summary: 'VPN access', status: 'in_progress', department: 'IT Access' },
      {
        humanId: 'HR-9002',
        summary: 'Agency contact',
        status: 'waiting_on_employee',
        department: 'HR General',
      },
      {
        humanId: 'HR-9001',
        summary: 'Parental leave',
        status: 'resolved',
        department: 'HR General',
      },
    ]);
    expect(text).toContain('You have 2 open requests');
    expect(text).toContain('IT-9001 — VPN access (IT Access): Under review');
    expect(text).toContain('HR-9002 is waiting for your reply');
    expect(text).toContain('Most recently closed: HR-9001 — Parental leave (HR General): Resolved');
  });

  it('handles no requests at all', () => {
    expect(requestStatusReply([])).toContain('no requests yet');
  });
});

describe('payroll replies (UC-06)', () => {
  const facts = (over: Partial<PayrollFacts['lopDays'][number]> = {}): PayrollFacts => ({
    paidByAgency: false,
    currency: 'USD',
    payslips: [
      {
        periodStart: '2026-09-16',
        periodEnd: '2026-09-30',
        payDate: '2026-09-30',
        gross: 4333.33,
        net: 2571.83,
        deductions: [
          { code: 'retirement', label: '401(k) contribution (5%)', amount: 216.67, dates: [] },
          { code: 'lop', label: 'Loss of Pay (1 day)', amount: 400, dates: ['2026-09-11'] },
        ],
      },
    ],
    lopDays: [
      {
        date: '2026-09-11',
        amount: 400,
        payDate: '2026-09-30',
        attendance: 'absent',
        attendanceNote: 'No badge-in on 11/09 at 09:00',
        hoursNow: 0,
        lateHours: 0,
        requiredHours: 8,
        ...over,
      },
    ],
  });

  it('the model summary contains no digit at all (no amount, date, hour or note figure)', () => {
    for (const f of [facts(), facts({ hoursNow: 4, lateHours: 4 }), { ...facts(), lopDays: [] }]) {
      expect(payrollFactsForModel(f)).not.toMatch(/[0-9]/);
    }
    expect(payrollFactsForModel(facts())).toContain('attendance recorded as absent');
    expect(payrollFactsForModel({ ...facts(), lopDays: [] })).toContain('retirement contribution');
  });

  it('describes all, some or none of a day as logged late', () => {
    expect(payrollRecordsText(facts({ hoursNow: 8, lateHours: 8 }))).toContain(
      'your timesheet now shows 8 h, logged after the pay period closed',
    );
    expect(payrollRecordsText(facts({ hoursNow: 8, lateHours: 4 }))).toContain(
      'your timesheet now shows 8 h, 4 h of it logged after the pay period closed',
    );
    expect(payrollRecordsText(facts({ hoursNow: 8, lateHours: 0 }))).toContain(
      'your timesheet now shows 8 h.',
    );
    expect(payrollFactsForModel(facts({ hoursNow: 8, lateHours: 4 }))).toContain(
      'partly logged after the pay period closed',
    );
  });

  it('suggests only the hours still missing, rounded', () => {
    expect(payrollNextSteps(facts({ hoursNow: 7.3 }))).toContain('"Log 0.7 hours for <project>');
    expect(payrollNextSteps(facts({ hoursNow: 0 }))).toContain('"Log 8 hours for <project>');
    expect(payrollNextSteps(facts({ hoursNow: 8 }))).not.toContain('log the hours first');
  });

  it('history replay keeps the next steps but not the pay figures', () => {
    const reply = payrollReply(facts(), 'Policy text [S1].');
    const replayed = withoutPayrollRecords(reply);
    expect(reply).toContain('$400.00');
    expect(replayed).not.toContain('$400.00');
    expect(replayed).not.toContain('4,333.33');
    expect(replayed).toContain('Policy text [S1].');
    expect(replayed).toContain('If you worked on Fri 11 Sept');
    expect(withoutPayrollRecords('Any other reply')).toBe('Any other reply');
  });

  describe('escalation email lines (UC-07)', () => {
    it('writes one line per LOP day whose amounts add up to the deduction', () => {
      // A $400.01 deduction over three days, split in cents by the workspace service.
      const base = facts();
      const days = [
        { ...base.lopDays[0]!, date: '2026-09-09', amount: 133.33 },
        { ...base.lopDays[0]!, date: '2026-09-10', amount: 133.33 },
        { ...base.lopDays[0]!, date: '2026-09-11', amount: 133.35 },
      ];
      const lines = payrollEmailLines({ ...base, lopDays: days });
      expect(lines[0]).toBe(
        'Latest payslip Wed 16 Sept 2026 – Wed 30 Sept 2026, paid Wed 30 Sept 2026.',
      );
      expect(lines.slice(1)).toHaveLength(3);
      const amounts = lines.slice(1).map((l) => Number(/\$([\d.]+)/.exec(l)![1]));
      expect(amounts.reduce((s, a) => s + a * 100, 0)).toBe(40001);
      expect(lopDatesText({ ...base, lopDays: days })).toBe(
        'Wed 9 Sept 2026, Thu 10 Sept 2026, Fri 11 Sept 2026',
      );
    });

    it('formats the currency, attendance and late logging', () => {
      const line = payrollEmailLines({
        ...facts({ hoursNow: 8, lateHours: 4, attendanceNote: null }),
        currency: 'GBP',
      })[1];
      expect(line).toBe(
        'Loss of Pay £400.00 for Fri 11 Sept 2026 (payslip paid Wed 30 Sept 2026); attendance: absent; timesheet now 8 of 8 h, 4 h of it logged after the pay period closed.',
      );
      expect(payrollEmailLines(facts({ attendance: null }))[1]).toContain('attendance: no record;');
      expect(lateLoggingLines(facts({ hoursNow: 8, lateHours: 4 }))).toEqual([
        'Logged 4 h for Fri 11 Sept 2026 after the pay period closed.',
      ]);
      expect(lateLoggingLines(facts())).toEqual([]);
    });

    it('covers agency pay, no payslips and no LOP', () => {
      expect(
        payrollEmailLines({ paidByAgency: true, currency: null, payslips: [], lopDays: [] }),
      ).toEqual(['Paid by agency; no company payslips.']);
      expect(payrollEmailLines({ ...facts(), payslips: [], lopDays: [] })).toEqual([
        'No payslips on record yet.',
      ]);
      expect(payrollEmailLines({ ...facts(), lopDays: [] })[1]).toBe(
        'No Loss of Pay deduction on the recent payslips.',
      );
    });

    it('writes the pay period of the first LOP day, else the latest payslip', () => {
      expect(payPeriodText(facts())).toBe('Wed 16 Sept – Wed 30 Sept (paid Wed 30 Sept 2026)');
      const older = {
        ...facts().payslips[0]!,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        payDate: '2026-09-15',
      };
      const lopInOlder = {
        ...facts(),
        payslips: [facts().payslips[0]!, older],
        lopDays: [{ ...facts().lopDays[0]!, payDate: '2026-09-15' }],
      };
      expect(payPeriodText(lopInOlder)).toBe('Tue 1 Sept – Tue 15 Sept (paid Tue 15 Sept 2026)');
      expect(payPeriodText({ ...facts(), lopDays: [] })).toBe(
        'Wed 16 Sept – Wed 30 Sept (paid Wed 30 Sept 2026)',
      );
      expect(
        payPeriodText({ paidByAgency: true, currency: null, payslips: [], lopDays: [] }),
      ).toBeNull();
    });
  });
});

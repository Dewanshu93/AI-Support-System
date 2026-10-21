// Leave balance and daily briefing replies (UC-11b, UC-12): every figure from the records.
import { dailyBriefingReply, type LeaveFacts, leaveBalanceReply } from './workspaceReplies';

const FACTS: LeaveFacts = {
  eligible: true,
  year: 2026,
  balances: [
    { type: 'annual', label: 'Annual leave', entitlement: 25, used: 0, pending: 0, available: 25 },
    { type: 'sick', label: 'Sick leave', entitlement: 20, used: 2, pending: 0, available: 18 },
    { type: 'casual', label: 'Casual leave', entitlement: 6, used: 0, pending: 0, available: 6 },
  ],
  requests: [
    { type: 'annual', startDate: '2026-11-02', endDate: '2026-11-06', days: 5, status: 'approved' },
    { type: 'sick', startDate: '2026-03-02', endDate: '2026-03-03', days: 2, status: 'approved' },
    {
      type: 'casual',
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      days: 1,
      status: 'cancelled',
    },
  ],
};

describe('leaveBalanceReply', () => {
  it('lists balances and only upcoming pending or approved leave', () => {
    expect(leaveBalanceReply(FACTS, '2026-10-07')).toBe(
      [
        'Your leave for 2026:',
        '• Annual leave: 25 days left of 25',
        '• Sick leave: 18 days left of 20 (2 used)',
        '• Casual leave: 6 days left of 6',
        'Coming up:',
        '• Annual leave, Mon 2 Nov – Fri 6 Nov (5 days): approved',
        'You can request leave on the Leave page.',
      ].join('\n'),
    );
  });

  it('leaves out "Coming up" when nothing is booked', () => {
    expect(leaveBalanceReply({ ...FACTS, requests: [] }, '2026-10-07')).not.toContain('Coming up');
  });
});

describe('dailyBriefingReply', () => {
  it('words every kind, marking urgent ones', () => {
    expect(
      dailyBriefingReply([
        { kind: 'lop_risk', severity: 'urgent', date: '2026-10-07', cutoff: '2026-10-14' },
        {
          kind: 'timesheet_gap',
          severity: 'urgent',
          date: '2026-10-09',
          hours: 0,
          requiredHours: 8,
          lopCutoff: '2026-10-16',
        },
        {
          kind: 'timesheet_gap',
          severity: 'normal',
          date: '2026-10-06',
          hours: 4,
          requiredHours: 8,
          lopCutoff: null,
        },
        {
          kind: 'request_waiting',
          severity: 'normal',
          request: { humanId: 'HR-9002', summary: 'Badge access' },
        },
      ]),
    ).toBe(
      [
        '4 things need your attention:',
        '• Urgent: Wed 7 Oct passed its payroll cutoff (Wed 14 Oct) with no timesheet or attendance record and may be deducted as Loss of Pay. Log the hours and ask Payroll for a review.',
        '• Urgent: Log your hours for Fri 9 Oct by Fri 16 Oct (payroll cutoff), or it counts as Loss of Pay.',
        '• Log your hours for Tue 6 Oct: 4 h of 8 h.',
        '• HR-9002 (Badge access) is waiting for your reply.',
        'The same list is on your dashboard.',
      ].join('\n'),
    );
  });

  it('says so when nothing needs the employee', () => {
    expect(dailyBriefingReply([])).toMatch(/^Nothing needs your attention right now/);
  });
});

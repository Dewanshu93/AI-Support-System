import type { TimesheetDay } from '@sd/shared';
import { requestStatusReply, timesheetStatusReply } from './workspaceReplies';

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

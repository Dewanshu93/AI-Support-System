// What the employee sees before confirming a copilot action (UC-05, UC-11c).
import type { CopilotAction, LeaveAction, TimesheetAction } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionCard } from './ActionCard';

const ACTION: TimesheetAction = {
  kind: 'timesheet_log',
  entries: [
    {
      date: '2026-09-11',
      projectId: 'a'.repeat(24),
      projectName: 'Banking Module',
      projectColor: '#4f46e5',
      hours: 8,
      previousHours: 0,
      dayTotalAfter: 8,
      late: true,
    },
    {
      date: '2026-10-05',
      projectId: 'a'.repeat(24),
      projectName: 'Banking Module',
      projectColor: '#4f46e5',
      hours: 2,
      previousHours: 6,
      dayTotalAfter: 4,
      late: false,
    },
  ],
};

const render = (action: CopilotAction = ACTION) =>
  renderToStaticMarkup(<ActionCard conversationId="c" action={action} onDone={() => undefined} />);

describe('ActionCard', () => {
  it('lists every entry with day, project, hours and the day total after', () => {
    const html = render();
    expect(html.match(/data-testid="action-entry"/g)).toHaveLength(2);
    expect(html).toContain('Fri 11 Sept');
    expect(html).toContain('Banking Module');
    expect(html).toContain('8h');
    expect(html).toContain('Day total after');
  });

  it('says nothing is saved before confirming, and offers confirm and cancel', () => {
    const html = render();
    expect(html).toContain('Nothing is saved until you confirm.');
    expect(html).toContain('data-testid="action-confirm"');
    expect(html).toContain('data-testid="action-cancel"');
  });

  it('shows what an entry replaces and marks late entries', () => {
    const html = render();
    expect(html).toContain('replaces 6h');
    expect(html).toContain('Late entry');
    expect(html).toContain('Payroll reviews late entries');
  });

  it('has no late note when no entry is late', () => {
    const html = render({ ...ACTION, entries: [ACTION.entries[1]!] });
    expect(html).not.toContain('Late entry');
    expect(html).toContain('Confirm timesheet entry');
  });
});

// UC-11c: a leave request proposed by the copilot.
describe('ActionCard (leave)', () => {
  const LEAVE: LeaveAction = {
    kind: 'leave_apply',
    type: 'annual',
    typeLabel: 'Annual leave',
    startDate: '2026-10-23',
    endDate: '2026-10-27',
    days: 3,
    availableAfter: 9,
    needsApproval: true,
    warnings: ["Annual leave of more than 3 working days needs 10 working days' notice."],
  };

  it('shows the dates, working days, balance after and who approves, with any warning', () => {
    const html = render(LEAVE);
    expect(html).toContain('data-kind="leave_apply"');
    expect(html).toContain('Confirm annual leave');
    expect(html).toContain('Fri 23 Oct – Tue 27 Oct');
    expect(html).toContain('9 days');
    expect(html).toContain('HR approves for your manager');
    expect(html).toContain('needs 10 working days');
    expect(html).toContain('Nothing is sent until you confirm.');
    expect(html).toContain('Confirm and send');
    expect(html).not.toContain('action-entry');
  });

  it('shows a request change: the request, the exact comment, the status after', () => {
    const comment = render({
      kind: 'request_change',
      change: 'comment',
      ticketId: 'a'.repeat(24),
      humanId: 'HR-9002',
      summary: 'Badge access',
      comment: 'The new badge works now',
      statusAfter: null,
    });
    expect(comment).toContain('Add a comment to HR-9002');
    expect(comment).toContain('The new badge works now');
    expect(comment).toContain('Confirm and add');
    expect(comment).not.toContain('It will show as');
    const withdraw = render({
      kind: 'request_change',
      change: 'withdraw',
      ticketId: 'a'.repeat(24),
      humanId: 'IT-9001',
      summary: 'VPN access',
      comment: null,
      statusAfter: 'closed',
    });
    expect(withdraw).toContain('Withdraw IT-9001');
    expect(withdraw).toContain('It will show as');
    expect(withdraw).toContain('Confirm and withdraw');
  });

  it('says sick leave is recorded at once', () => {
    const html = render({ ...LEAVE, type: 'sick', typeLabel: 'Sick leave', needsApproval: false });
    expect(html).toContain('Recorded at once');
    expect(html).toContain('Confirm and record');
  });
});

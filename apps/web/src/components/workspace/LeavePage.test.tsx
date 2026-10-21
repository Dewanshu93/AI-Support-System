import type { AgentLeaveRequest, LeaveOverviewResponse } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeaveRow } from '@/components/agent/AgentLeave';
import { LeaveView } from './LeavePage';

const DATA: LeaveOverviewResponse = {
  year: 2026,
  today: '2026-10-07',
  eligible: true,
  balances: [
    { type: 'annual', label: 'Annual leave', entitlement: 15, used: 3, pending: 0, available: 12 },
    { type: 'sick', label: 'Sick leave', entitlement: 10, used: 0, pending: 0, available: 10 },
    { type: 'casual', label: 'Casual leave', entitlement: 6, used: 0, pending: 1, available: 5 },
  ],
  requests: [
    {
      id: '6ac4eacc592a1f25e55be24e',
      type: 'casual',
      startDate: '2026-10-14',
      endDate: '2026-10-14',
      days: 1,
      reason: 'Moving house',
      status: 'pending',
      source: 'seed',
      decisionNote: null,
      decidedAt: null,
      createdAt: '2026-10-06T10:00:00.000Z',
      cancellable: true,
    },
    {
      id: '6ac4eacc592a1f25e55be24f',
      type: 'annual',
      startDate: '2026-07-27',
      endDate: '2026-07-29',
      days: 3,
      reason: null,
      status: 'approved',
      source: 'seed',
      decisionNote: null,
      decidedAt: '2026-07-13T11:00:00.000Z',
      createdAt: '2026-07-12T10:00:00.000Z',
      cancellable: false,
    },
  ],
  rules: { earliestSickDate: '2026-09-07', latestDate: '2026-12-31' },
};

describe('LeaveView', () => {
  it('shows balances, the form and the requests with their status', () => {
    const html = renderToStaticMarkup(<LeaveView data={DATA} onChange={() => undefined} />);
    expect(html.match(/data-testid="leave-balance"/g)).toHaveLength(3);
    expect(html).toContain('12<span class="text-base font-medium text-slate-500"> / 15 days');
    expect(html).toContain('1 waiting for approval');
    expect(html).toContain('Casual leave (5 left)');
    expect(html).toContain('Casual leave · Wed 14 Oct');
    expect(html).toContain('Annual leave · Mon 27 Jul – Wed 29 Jul');
    expect(html).toContain('Waiting for approval');
    // Only the waiting request can be cancelled.
    expect(html.match(/>Cancel</g)).toHaveLength(1);
  });

  it('explains that contractors agree time off with their agency', () => {
    const html = renderToStaticMarkup(
      <LeaveView
        data={{ ...DATA, eligible: false, balances: [], requests: [] }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('Your time off is agreed with your agency');
    expect(html).not.toContain('Request leave');
  });
});

describe('LeaveRow (HR approval)', () => {
  const request: AgentLeaveRequest = {
    ...DATA.requests[0]!,
    typeLabel: 'Casual leave',
    employee: {
      id: '6a1f00000000000000000001',
      name: 'Priya Shah',
      department: 'Engineering',
      country: 'US',
    },
    availableAfter: 5,
  };

  it('shows the employee, the dates and the balance after approval, with the decision buttons', () => {
    const html = renderToStaticMarkup(<LeaveRow request={request} onDecided={() => undefined} />);
    expect(html).toContain('Priya Shah');
    expect(html).toContain('Casual leave · Wed 14 Oct · 1 working day');
    expect(html).toContain('5 days left after this');
    expect(html).toContain('>Approve<');
    expect(html).toContain('>Decline<');
  });

  it('shows no buttons once decided', () => {
    const html = renderToStaticMarkup(
      <LeaveRow request={{ ...request, status: 'approved' }} onDecided={() => undefined} />,
    );
    expect(html).not.toContain('>Approve<');
  });
});

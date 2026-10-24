import { TICKET_STATUSES, type TicketStatus } from '@sd/shared';
import { checkRequestChange } from './requestChanges';

describe('checkRequestChange', () => {
  it.each<[TicketStatus, string | null]>([
    ['new', null],
    ['in_progress', null],
    ['waiting_on_employee', null], // a comment never moves the status
    ['resolved', null],
    ['closed', 'it is closed; raise a new request instead'],
  ])('comment on %s', (status, reason) => {
    expect(checkRequestChange('comment', status)).toEqual(
      reason ? { ok: false, reason } : { ok: true, to: null },
    );
  });

  it('withdraws any open request to closed, never a resolved or closed one', () => {
    const results = Object.fromEntries(
      TICKET_STATUSES.map((s) => [s, checkRequestChange('withdraw', s)]),
    );
    expect(results).toEqual({
      new: { ok: true, to: 'closed' },
      in_progress: { ok: true, to: 'closed' },
      waiting_on_employee: { ok: true, to: 'closed' },
      resolved: { ok: false, reason: 'it is already resolved' },
      closed: { ok: false, reason: 'it is already closed' },
    });
  });

  it('reopens only a resolved request, back to in progress', () => {
    expect(checkRequestChange('reopen', 'resolved')).toEqual({ ok: true, to: 'in_progress' });
    expect(checkRequestChange('reopen', 'in_progress')).toEqual({
      ok: false,
      reason: 'it is still open',
    });
    expect(checkRequestChange('reopen', 'closed')).toMatchObject({ ok: false });
  });
});

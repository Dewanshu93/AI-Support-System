// What a requester may do to their own request (UC-17, ADR-028): add a comment,
// withdraw it, or reopen it. Pure. Agents keep the ADR-012 transitions; the
// requester's own transitions are this separate, smaller table.
import { type TicketStatus } from '@sd/shared';
import { isOpen } from './ticketStateMachine';

export const REQUEST_CHANGES = ['comment', 'withdraw', 'reopen'] as const;
export type RequestChange = (typeof REQUEST_CHANGES)[number];

export type RequestChangeCheck =
  { ok: true; to: TicketStatus | null } | { ok: false; reason: string };

/** The status after the change (null = unchanged), or why it is not allowed. */
export function checkRequestChange(
  change: RequestChange,
  status: TicketStatus,
): RequestChangeCheck {
  switch (change) {
    case 'comment':
      // A comment changes no status (owner decision): the agent moves the request on.
      return status === 'closed'
        ? { ok: false, reason: 'it is closed; raise a new request instead' }
        : { ok: true, to: null };
    case 'withdraw':
      if (isOpen(status)) return { ok: true, to: 'closed' };
      return {
        ok: false,
        reason: status === 'closed' ? 'it is already closed' : 'it is already resolved',
      };
    case 'reopen':
      if (status === 'resolved') return { ok: true, to: 'in_progress' };
      return {
        ok: false,
        reason:
          status === 'closed' ? 'it is closed; raise a new request instead' : 'it is still open',
      };
  }
}

/** Requests a change could apply to, for "which request?" when none is named. */
export const fitsChange = (change: RequestChange, status: TicketStatus) =>
  checkRequestChange(change, status).ok;

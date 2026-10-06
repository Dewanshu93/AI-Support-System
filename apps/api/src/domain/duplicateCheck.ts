// Duplicate ticket rule (playbook W3-01): same requester, same category, still
// open (not resolved or closed), created within the window (thresholds.yaml
// ticket.duplicateWindowDays, 7). The newest match is offered to the employee. Pure.
import type { TicketStatus } from '@sd/shared';
import { isOpen } from './ticketStateMachine';

export interface DuplicateCandidate<Id = string> {
  id: Id;
  requesterId: string;
  category: string;
  status: TicketStatus;
  createdAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function findDuplicate<Id>(
  draft: { requesterId: string; category: string },
  tickets: readonly DuplicateCandidate<Id>[],
  options: { now: Date; windowDays: number },
): DuplicateCandidate<Id> | null {
  const since = options.now.getTime() - options.windowDays * DAY_MS;
  const matches = tickets.filter(
    (t) =>
      t.requesterId === draft.requesterId &&
      t.category === draft.category &&
      isOpen(t.status) &&
      t.createdAt.getTime() >= since,
  );
  if (matches.length === 0) return null;
  return matches.reduce((newest, t) => (t.createdAt > newest.createdAt ? t : newest));
}

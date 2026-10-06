// Ticket lifecycle (playbook W3-01; transitions defined in ADR-012). Pure.
// The API answers 409 for a transition this table does not allow.
import type { TicketStatus } from '@sd/shared';

export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  new: ['in_progress', 'waiting_on_employee', 'resolved'],
  in_progress: ['waiting_on_employee', 'resolved'],
  waiting_on_employee: ['in_progress', 'resolved'],
  // Reopen: the employee's issue came back before the ticket was closed.
  resolved: ['closed', 'in_progress'],
  closed: [],
};

export const canTransition = (from: TicketStatus, to: TicketStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const isOpen = (status: TicketStatus): boolean =>
  status !== 'resolved' && status !== 'closed';

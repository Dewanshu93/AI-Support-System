// The requester's own changes to a request (UC-17, ADR-028): comment, withdraw,
// reopen. Rules in domain/requestChanges.ts; used by the request page and by the
// copilot action after the employee confirms. Another employee's request is "not found".
import { ObjectId } from 'mongodb';
import type { TicketDoc, TicketEventDoc } from '../../db/schemas';
import { checkRequestChange, type RequestChange } from '../../domain/requestChanges';
import { AppError } from '../../lib/errors';
import type { AgentTicketsRepository } from '../agent/repository';
import type { TicketsRepository } from './repository';

export interface RequesterServiceDeps {
  tickets: Pick<TicketsRepository, 'findById' | 'insertEvent'>;
  /** The guarded ticket update shared with agents (fails if the ticket changed meanwhile). */
  agentTickets: Pick<AgentTicketsRepository, 'update'>;
  now?: () => Date;
}

const VERB: Record<RequestChange, string> = {
  comment: 'commented on',
  withdraw: 'withdrawn',
  reopen: 'reopened',
};

export function createRequesterService(deps: RequesterServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function own(userId: string, ticketId: string): Promise<TicketDoc> {
    const ticket = ObjectId.isValid(ticketId) ? await deps.tickets.findById(ticketId) : null;
    if (!ticket || ticket.requesterId.toHexString() !== userId) {
      throw new AppError('NOT_FOUND', 'Request not found');
    }
    return ticket;
  }

  /**
   * Applies one change. A comment is a public reply; withdraw and reopen change the
   * status (with the reason, if any, on the status event).
   */
  async function change(
    userId: string,
    ticketId: string,
    kind: RequestChange,
    text?: string,
  ): Promise<{ ticket: TicketDoc; from: TicketDoc['status']; event: TicketEventDoc }> {
    const before = await own(userId, ticketId);
    const check = checkRequestChange(kind, before.status);
    if (!check.ok) {
      throw new AppError('CONFLICT', `This request cannot be ${VERB[kind]}: ${check.reason}`, {
        status: before.status,
      });
    }
    const at = now();
    let after = before;
    if (check.to) {
      after = {
        ...before,
        status: check.to,
        updatedAt: at,
        // Reopening clears the resolution time; withdrawing keeps it (none when open).
        resolvedAt: check.to === 'in_progress' ? null : before.resolvedAt,
      };
      if (!(await deps.agentTickets.update(after, before.updatedAt))) {
        throw new AppError('CONFLICT', 'The request changed meanwhile; reload and try again');
      }
    }
    const event: TicketEventDoc = {
      _id: new ObjectId(),
      ticketId: before._id,
      actorId: new ObjectId(userId),
      ...(kind === 'comment'
        ? {
            type: 'reply',
            visibility: 'public',
            body: text ?? '',
            field: null,
            oldValue: null,
            newValue: null,
          }
        : {
            type: 'status_change',
            visibility: 'public',
            body: text || null,
            field: null,
            oldValue: before.status,
            newValue: check.to,
          }),
      createdAt: at,
    };
    await deps.tickets.insertEvent(event);
    return { ticket: after, from: before.status, event };
  }

  return { own, change };
}
export type RequesterService = ReturnType<typeof createRequesterService>;

// Agent ticket operations (W3-05): visibility, replies, notes, status changes
// and classification corrections. Rules live in domain/ (agentAccess,
// ticketStateMachine); this module does the I/O and writes the ticket events.
import type { AuthUser, Priority, TicketStatus } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import type { TicketDoc, TicketEventDoc } from '../../db/schemas';
import { applyClassification, canSeeTicket } from '../../domain/agentAccess';
import { type RequestNotice, replyNotice, statusNotice } from '../../domain/requestNotifications';
import { canTransition } from '../../domain/ticketStateMachine';
import { AppError } from '../../lib/errors';
import type { TicketsRepository } from '../tickets/repository';
import type { WorkspaceRepository } from '../workspace/repository';
import type { AgentTicketsRepository } from './repository';

export interface AgentServiceDeps {
  tickets: TicketsRepository;
  agentTickets: AgentTicketsRepository;
  /** The requester's in-app notifications (UC-08): status changes and replies. */
  notifications: Pick<WorkspaceRepository, 'insertNotification'>;
  taxonomy: ConfigFiles['taxonomy'];
  routing: ConfigFiles['routing'];
  now?: () => Date;
}

const CLASSIFICATION_ERRORS = {
  unknown_category: 'Category is not in the taxonomy',
  unknown_subcategory: 'Subcategory is not in the taxonomy for this category',
  restricted_category: 'A confidential HR case keeps its category and queue',
} as const;

export function createAgentService(deps: AgentServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const queueLabel = (id: string) => deps.routing.queues.find((q) => q.id === id)?.label ?? id;

  /** The ticket if the viewer may see it; NOT_FOUND otherwise (no existence leak). */
  async function getVisible(id: string, viewer: AuthUser): Promise<TicketDoc> {
    const ticket = await deps.tickets.findById(id);
    if (!ticket || !canSeeTicket(viewer, ticket, deps.routing.sensitiveQueue)) {
      throw new AppError('NOT_FOUND', 'Ticket not found');
    }
    return ticket;
  }

  async function addEvent(
    ticket: TicketDoc,
    viewer: AuthUser,
    event: Pick<TicketEventDoc, 'type' | 'visibility'> & Partial<TicketEventDoc>,
    at: Date,
  ): Promise<TicketEventDoc> {
    const doc: TicketEventDoc = {
      _id: new ObjectId(),
      ticketId: ticket._id,
      actorId: new ObjectId(viewer.id),
      body: null,
      field: null,
      oldValue: null,
      newValue: null,
      createdAt: at,
      ...event,
    };
    await deps.tickets.insertEvent(doc);
    return doc;
  }

  /** Tells the requester in the bell; the link opens their request. */
  async function notify(ticket: TicketDoc, notice: RequestNotice, at: Date): Promise<void> {
    await deps.notifications.insertNotification({
      _id: new ObjectId(),
      userId: ticket.requesterId,
      kind: 'request',
      title: notice.title,
      body: notice.body,
      link: `/tickets/${ticket._id.toHexString()}`,
      readAt: null,
      createdAt: at,
    });
  }

  /** Saves the ticket unless another agent changed it since it was read (409). */
  async function save(before: TicketDoc, after: TicketDoc): Promise<void> {
    if (!(await deps.agentTickets.update(after, before.updatedAt))) {
      throw new AppError('CONFLICT', 'The ticket was changed by someone else; reload and retry');
    }
  }

  return {
    getVisible,

    async reply(id: string, viewer: AuthUser, body: string): Promise<TicketEventDoc> {
      const ticket = await getVisible(id, viewer);
      if (ticket.status === 'closed') {
        throw new AppError('CONFLICT', 'The ticket is closed; replies are no longer possible');
      }
      const at = now();
      const event = await addEvent(
        ticket,
        viewer,
        { type: 'reply', visibility: 'public', body },
        at,
      );
      await notify(ticket, replyNotice(ticket, body), at);
      return event;
    },

    async note(id: string, viewer: AuthUser, body: string): Promise<TicketEventDoc> {
      const ticket = await getVisible(id, viewer);
      return addEvent(ticket, viewer, { type: 'note', visibility: 'internal', body }, now());
    },

    async setStatus(
      id: string,
      viewer: AuthUser,
      status: TicketStatus,
    ): Promise<{ ticket: TicketDoc; from: TicketStatus }> {
      const before = await getVisible(id, viewer);
      if (!canTransition(before.status, status)) {
        throw new AppError('CONFLICT', `A ticket cannot move from ${before.status} to ${status}`, {
          from: before.status,
          to: status,
        });
      }
      const at = now();
      const after: TicketDoc = {
        ...before,
        status,
        updatedAt: at,
        // Reopening clears the resolution time; closing keeps it.
        resolvedAt:
          status === 'resolved' ? at : status === 'in_progress' ? null : before.resolvedAt,
      };
      await save(before, after);
      await addEvent(
        after,
        viewer,
        { type: 'status_change', visibility: 'public', oldValue: before.status, newValue: status },
        at,
      );
      await notify(after, statusNotice(after, status), at);
      return { ticket: after, from: before.status };
    },

    async classify(
      id: string,
      viewer: AuthUser,
      request: { category?: string; subcategory?: string | null; priority?: Priority },
    ): Promise<{ ticket: TicketDoc; changed: string[]; rerouted: boolean }> {
      const before = await getVisible(id, viewer);
      const result = applyClassification(
        { taxonomy: deps.taxonomy, routing: deps.routing },
        before,
        request,
      );
      if (!result.ok) {
        throw new AppError('VALIDATION_ERROR', CLASSIFICATION_ERRORS[result.reason], {
          reason: result.reason,
        });
      }
      if (result.changes.length === 0) return { ticket: before, changed: [], rerouted: false };

      const at = now();
      const after: TicketDoc = { ...before, ...result.next, updatedAt: at };
      await save(before, after);
      // One internal event per changed field with old/new values (override rate input).
      for (const change of result.changes) {
        await addEvent(
          after,
          viewer,
          {
            type: 'classification_correction',
            visibility: 'internal',
            ...change,
            body:
              change.field === 'category' && result.rerouted
                ? `Re-routed to ${queueLabel(after.queue)}`
                : null,
          },
          at,
        );
      }
      return {
        ticket: after,
        changed: result.changes.map((c) => c.field),
        rerouted: result.rerouted,
      };
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;

// In-memory tickets storage for tests; writes are validated with the MongoDB
// schemas, like the real repository.
import { PRIORITIES } from '@sd/shared';
import { validateForWrite } from '../../src/db/collections';
import {
  type TicketDoc,
  type TicketEventDoc,
  TicketEventSchema,
  TicketSchema,
} from '../../src/db/schemas';
import {
  type AgentTicketsRepository,
  decodeQueueCursor,
  encodeQueueCursor,
  overrideRateOf,
} from '../../src/modules/agent/repository';
import { decodeCursor, encodeCursor } from '../../src/modules/conversations/repository';
import { formatHumanId, type TicketsRepository } from '../../src/modules/tickets/repository';

export interface MemoryTickets extends TicketsRepository {
  tickets: TicketDoc[];
  events: TicketEventDoc[];
}

export function memoryTicketsRepository(): MemoryTickets {
  const tickets: TicketDoc[] = [];
  const events: TicketEventDoc[] = [];
  const seq = { IT: 0, HR: 0 };
  return {
    tickets,
    events,
    nextHumanId: async (domain) => formatHumanId(domain, ++seq[domain]),
    async insert(ticket) {
      if (tickets.some((t) => t.conversationId.equals(ticket.conversationId))) {
        throw new Error('E11000 duplicate key: conversationId_unique');
      }
      tickets.push(validateForWrite('tickets', TicketSchema, ticket));
    },
    findById: async (id) => tickets.find((t) => t._id.toHexString() === id) ?? null,
    findByConversation: async (id) => tickets.find((t) => t.conversationId.equals(id)) ?? null,
    findRecentByRequester: async (requesterId, category, since) =>
      tickets.filter(
        (t) => t.requesterId.equals(requesterId) && t.category === category && t.createdAt >= since,
      ),
    async listForRequester(requesterId, { limit, cursor, status }) {
      const after = cursor ? decodeCursor(cursor) : null;
      const sorted = tickets
        .filter((t) => t.requesterId.equals(requesterId) && (!status || t.status === status))
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b._id.toHexString().localeCompare(a._id.toHexString()),
        )
        .filter(
          (t) =>
            !after ||
            t.updatedAt < after.updatedAt ||
            (t.updatedAt.getTime() === after.updatedAt.getTime() &&
              t._id.toHexString() < after.id.toHexString()),
        );
      const items = sorted.slice(0, limit);
      return {
        items,
        nextCursor: sorted.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    },
    async insertEvent(event) {
      events.push(validateForWrite('ticket_events', TicketEventSchema, event));
    },
    listEvents: async (ticketId, visibility) =>
      events.filter(
        (e) => e.ticketId.equals(ticketId) && (!visibility || e.visibility === visibility),
      ),
  };
}

/** Agent queries over the memory tickets (same ordering and cursor as the MongoDB version). */
export function memoryAgentTicketsRepository(store: MemoryTickets): AgentTicketsRepository {
  const rank = (t: TicketDoc) => PRIORITIES.indexOf(t.priority);
  const order = (a: TicketDoc, b: TicketDoc) =>
    rank(b) - rank(a) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a._id.toHexString().localeCompare(b._id.toHexString());
  return {
    async listQueue({ queues, status, priority, category, limit, cursor }) {
      const after = cursor ? decodeQueueCursor(cursor) : null;
      const sorted = store.tickets
        .filter(
          (t) =>
            !t.isEval &&
            (!queues || queues.includes(t.queue)) &&
            (!status || t.status === status) &&
            (!priority || t.priority === priority) &&
            (!category || t.category === category),
        )
        .sort(order)
        .filter((t) => {
          if (!after) return true;
          const ref = {
            priority: PRIORITIES[after.rank]!,
            createdAt: after.createdAt,
            _id: after.id,
          };
          return order(t, ref as TicketDoc) > 0;
        });
      const items = sorted.slice(0, limit);
      return {
        items,
        nextCursor: sorted.length > limit ? encodeQueueCursor(items[items.length - 1]!) : null,
      };
    },
    async update(ticket, expectedUpdatedAt) {
      const i = store.tickets.findIndex((t) => t._id.equals(ticket._id));
      if (i < 0 || store.tickets[i]!.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        return false;
      }
      store.tickets[i] = validateForWrite('tickets', TicketSchema, ticket);
      return true;
    },
    async overrideRate({ from, to } = {}) {
      const created = store.tickets.filter(
        (t) => !t.isEval && (!from || t.createdAt >= from) && (!to || t.createdAt < to),
      );
      const corrected = new Set(
        store.events
          .filter((e) => e.type === 'classification_correction')
          .map((e) => e.ticketId.toHexString()),
      );
      return overrideRateOf(
        created.length,
        created.filter((t) => corrected.has(t._id.toHexString())).length,
      );
    },
  };
}

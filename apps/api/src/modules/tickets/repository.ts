// Ticket data access: tickets, ticket events and human IDs (IT-0001, HR-0001).
// Every write is validated against the collection schemas (db/schemas).
import { type Collection, ObjectId } from 'mongodb';
import type { TicketStatus } from '@sd/shared';
import { validateForWrite } from '../../db/collections';
import { nextSequence } from '../../db/counters';
import {
  type AgentAssist,
  AgentAssistSchema,
  type CounterDoc,
  type TicketDoc,
  type TicketEventDoc,
  TicketEventSchema,
  TicketSchema,
} from '../../db/schemas';
import { decodeCursor, encodeCursor } from '../conversations/repository';

export interface TicketPage {
  items: TicketDoc[];
  nextCursor: string | null;
}

export interface TicketsRepository {
  /** Next human ID for a domain, e.g. "IT-0042" (atomic counter). */
  nextHumanId(domain: 'IT' | 'HR'): Promise<string>;
  insert(ticket: TicketDoc): Promise<void>;
  findById(id: string): Promise<TicketDoc | null>;
  findByConversation(conversationId: ObjectId): Promise<TicketDoc | null>;
  /** The requester's tickets in a category created since `since` (duplicate check input). */
  findRecentByRequester(requesterId: ObjectId, category: string, since: Date): Promise<TicketDoc[]>;
  listForRequester(
    requesterId: ObjectId,
    options: { limit: number; cursor?: string; status?: TicketStatus },
  ): Promise<TicketPage>;
  insertEvent(event: TicketEventDoc): Promise<void>;
  /** Writes the P-6 agent assistance (W3-06) after creation. */
  setAgentAssist(
    id: ObjectId,
    update: { agentBrief: string; agentAssist: AgentAssist },
  ): Promise<void>;
  listEvents(
    ticketId: ObjectId,
    visibility?: TicketEventDoc['visibility'],
  ): Promise<TicketEventDoc[]>;
}

export const formatHumanId = (domain: 'IT' | 'HR', seq: number) =>
  `${domain}-${String(seq).padStart(4, '0')}`;

export function mongoTicketsRepository(collections: {
  tickets: Collection<TicketDoc>;
  ticketEvents: Collection<TicketEventDoc>;
  counters: Collection<CounterDoc>;
}): TicketsRepository {
  const { tickets, ticketEvents, counters } = collections;
  return {
    nextHumanId: async (domain) => formatHumanId(domain, await nextSequence(counters, domain)),
    async insert(ticket) {
      await tickets.insertOne(validateForWrite('tickets', TicketSchema, ticket));
    },
    findById: async (id) =>
      ObjectId.isValid(id) ? tickets.findOne({ _id: new ObjectId(id) }) : null,
    findByConversation: (conversationId) => tickets.findOne({ conversationId }),
    findRecentByRequester: (requesterId, category, since) =>
      tickets.find({ requesterId, category, createdAt: { $gte: since }, isEval: false }).toArray(),
    async listForRequester(requesterId, { limit, cursor, status }) {
      const filter: Record<string, unknown> = { requesterId, isEval: false };
      if (status) filter.status = status;
      const after = cursor ? decodeCursor(cursor) : null;
      if (after) {
        filter.$or = [
          { updatedAt: { $lt: after.updatedAt } },
          { updatedAt: after.updatedAt, _id: { $lt: after.id } },
        ];
      }
      const docs = await tickets
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
      const items = docs.slice(0, limit);
      return {
        items,
        nextCursor: docs.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    },
    async insertEvent(event) {
      await ticketEvents.insertOne(validateForWrite('ticket_events', TicketEventSchema, event));
    },
    async setAgentAssist(id, { agentBrief, agentAssist }) {
      await tickets.updateOne(
        { _id: id },
        {
          $set: {
            agentBrief,
            agentAssist: validateForWrite('tickets', AgentAssistSchema, agentAssist),
          },
        },
      );
    },
    listEvents: (ticketId, visibility) =>
      ticketEvents
        .find({ ticketId, ...(visibility && { visibility }) })
        .sort({ createdAt: 1, _id: 1 })
        .toArray(),
  };
}

// Agent ticket queries (W3-05): the queue in severity order, guarded updates and
// the override-rate metric. Priority is stored as a string, so "priority desc"
// sorts on a rank computed in the query (ADR-014), not on the stored value.
import { type Collection, ObjectId } from 'mongodb';
import { PRIORITIES, type Priority, type TicketStatus } from '@sd/shared';
import { validateForWrite } from '../../db/collections';
import { type TicketDoc, type TicketEventDoc, TicketSchema } from '../../db/schemas';

export interface QueueQuery {
  /** null = every queue (admin). */
  queues: readonly string[] | null;
  status?: TicketStatus;
  priority?: Priority;
  category?: string;
  limit: number;
  cursor?: string;
}

export interface QueuePage {
  items: TicketDoc[];
  nextCursor: string | null;
}

export interface OverrideRate {
  /** Tickets created in the range (eval tickets excluded). */
  created: number;
  /** Of those, tickets with at least one classification correction. */
  overridden: number;
  /** overridden ÷ created, 0 when nothing was created. */
  rate: number;
}

export interface AgentTicketsRepository {
  listQueue(query: QueueQuery): Promise<QueuePage>;
  /**
   * Replaces the ticket if it is unchanged since `expectedUpdatedAt` (validated);
   * false when someone else updated it first.
   */
  update(ticket: TicketDoc, expectedUpdatedAt: Date): Promise<boolean>;
  /** Override rate (playbook section 4 metric definitions) for tickets created in [from, to). */
  overrideRate(range?: { from?: Date; to?: Date }): Promise<OverrideRate>;
}

interface QueueCursor {
  rank: number;
  createdAt: Date;
  id: ObjectId;
}

export const encodeQueueCursor = (t: Pick<TicketDoc, 'priority' | 'createdAt' | '_id'>) =>
  Buffer.from(
    `${PRIORITIES.indexOf(t.priority)}|${t.createdAt.toISOString()}|${t._id.toHexString()}`,
  ).toString('base64url');

export function decodeQueueCursor(cursor: string): QueueCursor | null {
  const [rank, date, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(date ?? '');
  const r = Number(rank);
  if (!id || !ObjectId.isValid(id) || !Number.isInteger(r) || Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return { rank: r, createdAt, id: new ObjectId(id) };
}

export const overrideRateOf = (created: number, overridden: number): OverrideRate => ({
  created,
  overridden,
  rate: created === 0 ? 0 : overridden / created,
});

export function mongoAgentTicketsRepository(collections: {
  tickets: Collection<TicketDoc>;
  ticketEvents: Collection<TicketEventDoc>;
}): AgentTicketsRepository {
  const { tickets, ticketEvents } = collections;
  return {
    async listQueue({ queues, status, priority, category, limit, cursor }) {
      const match: Record<string, unknown> = { isEval: false };
      if (queues) match.queue = { $in: [...queues] };
      if (status) match.status = status;
      if (priority) match.priority = priority;
      if (category) match.category = category;
      const after = cursor ? decodeQueueCursor(cursor) : null;
      const docs = await tickets
        .aggregate<TicketDoc & { rank?: number }>([
          { $match: match },
          { $addFields: { rank: { $indexOfArray: [[...PRIORITIES], '$priority'] } } },
          ...(after
            ? [
                {
                  $match: {
                    $or: [
                      { rank: { $lt: after.rank } },
                      { rank: after.rank, createdAt: { $gt: after.createdAt } },
                      { rank: after.rank, createdAt: after.createdAt, _id: { $gt: after.id } },
                    ],
                  },
                },
              ]
            : []),
          { $sort: { rank: -1, createdAt: 1, _id: 1 } },
          { $limit: limit + 1 },
          { $project: { rank: 0 } },
        ])
        .toArray();
      const items = docs.slice(0, limit) as TicketDoc[];
      return {
        items,
        nextCursor: docs.length > limit ? encodeQueueCursor(items[items.length - 1]!) : null,
      };
    },

    async update(ticket, expectedUpdatedAt) {
      const doc = validateForWrite('tickets', TicketSchema, ticket);
      const res = await tickets.replaceOne({ _id: doc._id, updatedAt: expectedUpdatedAt }, doc);
      return res.matchedCount === 1;
    },

    async overrideRate({ from, to } = {}) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.$gte = from;
      if (to) createdAt.$lt = to;
      const filter = { isEval: false, ...(from || to ? { createdAt } : {}) };
      const ids = (await tickets.find(filter, { projection: { _id: 1 } }).toArray()).map(
        (t) => t._id,
      );
      if (ids.length === 0) return overrideRateOf(0, 0);
      const overridden = await ticketEvents.distinct('ticketId', {
        type: 'classification_correction',
        ticketId: { $in: ids },
      });
      return overrideRateOf(ids.length, overridden.length);
    },
  };
}

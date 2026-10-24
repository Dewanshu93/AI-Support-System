// Admin reads for the trace viewer (W4-03): every conversation (evaluation runs
// excluded from the list), its turn traces and assistant messages, and the
// chunks a trace refers to; answer ratings with their traces (UC-16). Read-only.
import { type Collection, ObjectId } from 'mongodb';
import type {
  ChunkDoc,
  ConversationDoc,
  FeedbackDoc,
  MessageDoc,
  TurnTraceDoc,
} from '../../db/schemas';
import { decodeCursor, encodeCursor } from '../conversations/repository';

export interface AdminConversationFilter {
  decision?: TurnTraceDoc['decision']['value'];
  status?: ConversationDoc['status'];
  /** createdAt in [start, end). */
  start?: Date;
  end?: Date;
  userId?: string;
}

export interface TracesRepository {
  listConversations(
    filter: AdminConversationFilter,
    page: { limit: number; cursor?: string },
  ): Promise<{ items: ConversationDoc[]; nextCursor: string | null }>;
  findConversation(id: string): Promise<ConversationDoc | null>;
  /** Oldest first. */
  listTraces(conversationId: ObjectId): Promise<TurnTraceDoc[]>;
  findMessages(ids: ObjectId[]): Promise<MessageDoc[]>;
  findTrace(id: string): Promise<TurnTraceDoc | null>;
  findChunks(ids: string[]): Promise<ChunkDoc[]>;
  /** Most recent first (UC-16): ratings of answers, one per user and message. */
  listFeedback(rating: FeedbackDoc['rating'], limit: number): Promise<FeedbackDoc[]>;
  findTracesByMessages(messageIds: ObjectId[]): Promise<TurnTraceDoc[]>;
}

const toId = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export function mongoTracesRepository(c: {
  conversations: Collection<ConversationDoc>;
  messages: Collection<MessageDoc>;
  turnTraces: Collection<TurnTraceDoc>;
  chunks: Collection<ChunkDoc>;
  feedback: Collection<FeedbackDoc>;
}): TracesRepository {
  return {
    async listConversations(filter, { limit, cursor }) {
      const query: Record<string, unknown> = { isEval: false };
      if (filter.status) query.status = filter.status;
      if (filter.userId) query.userId = toId(filter.userId);
      if (filter.start || filter.end) {
        query.createdAt = {
          ...(filter.start && { $gte: filter.start }),
          ...(filter.end && { $lt: filter.end }),
        };
      }
      if (filter.decision) {
        query._id = {
          $in: await c.turnTraces.distinct('conversationId', {
            isEval: false,
            'decision.value': filter.decision,
          }),
        };
      }
      const after = cursor ? decodeCursor(cursor) : null;
      if (after) {
        query.$or = [
          { updatedAt: { $lt: after.updatedAt } },
          { updatedAt: after.updatedAt, _id: { $lt: after.id } },
        ];
      }
      const docs = await c.conversations
        .find(query)
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
      const items = docs.slice(0, limit);
      return {
        items,
        nextCursor: docs.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    },
    async findConversation(id) {
      const _id = toId(id);
      return _id ? c.conversations.findOne({ _id }) : null;
    },
    async listTraces(conversationId) {
      return c.turnTraces.find({ conversationId }).sort({ createdAt: 1, _id: 1 }).toArray();
    },
    async findMessages(ids) {
      return ids.length === 0 ? [] : c.messages.find({ _id: { $in: ids } }).toArray();
    },
    async findTrace(id) {
      const _id = toId(id);
      return _id ? c.turnTraces.findOne({ _id }) : null;
    },
    async findChunks(ids) {
      const valid = ids.map(toId).filter((id): id is ObjectId => id !== null);
      return valid.length === 0 ? [] : c.chunks.find({ _id: { $in: valid } }).toArray();
    },
    listFeedback: (rating, limit) =>
      c.feedback.find({ rating }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray(),
    findTracesByMessages: (messageIds) =>
      messageIds.length === 0
        ? Promise.resolve([])
        : c.turnTraces.find({ messageId: { $in: messageIds } }).toArray(),
  };
}

// Conversation data access: conversations, messages, turn traces and feedback.
// Every write is validated against the collection schema (db/schemas).
import { type Collection, ObjectId } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import {
  type ConversationDoc,
  ConversationSchema,
  type FeedbackDoc,
  FeedbackSchema,
  type MessageDoc,
  MessageSchema,
  type TurnTraceDoc,
  TurnTraceSchema,
} from '../../db/schemas';

export interface ConversationPage {
  items: ConversationDoc[];
  nextCursor: string | null;
}

export interface ConversationsRepository {
  /**
   * The last `limit` user/assistant messages of a conversation, oldest first,
   * excluding `excludeMessageId` (the current turn's message, stored before invoke).
   */
  recentMessages(
    conversationId: string,
    limit: number,
    excludeMessageId?: string,
  ): Promise<MessageDoc[]>;
  insertConversation(doc: ConversationDoc): Promise<void>;
  findConversation(id: string): Promise<ConversationDoc | null>;
  /** The user's conversations, most recently updated first (eval conversations excluded). */
  listConversations(
    userId: ObjectId,
    options: { limit: number; cursor?: string; status?: ConversationDoc['status'] },
  ): Promise<ConversationPage>;
  updateConversation(
    id: ObjectId,
    set: Partial<Omit<ConversationDoc, '_id'>>,
    options?: { incrementTurns?: boolean },
  ): Promise<void>;
  insertMessage(doc: MessageDoc): Promise<void>;
  findMessage(id: string): Promise<MessageDoc | null>;
  /** All messages of a conversation, oldest first. */
  listMessages(conversationId: ObjectId): Promise<MessageDoc[]>;
  insertTurnTrace(doc: TurnTraceDoc): Promise<void>;
  /** One rating per user per message: replaces an earlier rating. */
  upsertFeedback(doc: FeedbackDoc): Promise<FeedbackDoc>;
}

/** Opaque cursor over (updatedAt desc, _id desc). */
export function encodeCursor(doc: Pick<ConversationDoc, 'updatedAt' | '_id'>): string {
  return Buffer.from(`${doc.updatedAt.toISOString()}|${doc._id.toHexString()}`).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): { updatedAt: Date; id: ObjectId } | null {
  const [date, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const updatedAt = new Date(date ?? '');
  if (!id || !ObjectId.isValid(id) || Number.isNaN(updatedAt.getTime())) return null;
  return { updatedAt, id: new ObjectId(id) };
}

export function mongoConversationsRepository(collections: {
  conversations: Collection<ConversationDoc>;
  messages: Collection<MessageDoc>;
  turnTraces: Collection<TurnTraceDoc>;
  feedback: Collection<FeedbackDoc>;
}): ConversationsRepository {
  const { conversations, messages, turnTraces, feedback } = collections;
  const byId = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

  return {
    async recentMessages(conversationId, limit, excludeMessageId) {
      const id = byId(conversationId);
      if (!id) return [];
      const filter: Record<string, unknown> = {
        conversationId: id,
        role: { $in: ['user', 'assistant'] },
      };
      const exclude = excludeMessageId ? byId(excludeMessageId) : null;
      if (exclude) filter._id = { $ne: exclude };
      const newestFirst = await messages
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return newestFirst.reverse();
    },
    async insertConversation(doc) {
      await conversations.insertOne(validateForWrite('conversations', ConversationSchema, doc));
    },
    async findConversation(id) {
      const _id = byId(id);
      return _id ? conversations.findOne({ _id }) : null;
    },
    async listConversations(userId, { limit, cursor, status }) {
      const filter: Record<string, unknown> = { userId, isEval: false };
      if (status) filter.status = status;
      const after = cursor ? decodeCursor(cursor) : null;
      if (after) {
        filter.$or = [
          { updatedAt: { $lt: after.updatedAt } },
          { updatedAt: after.updatedAt, _id: { $lt: after.id } },
        ];
      }
      const docs = await conversations
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
    async updateConversation(id, set, options = {}) {
      await conversations.updateOne(
        { _id: id },
        { $set: set, ...(options.incrementTurns && { $inc: { turnCount: 1 } }) },
      );
    },
    async insertMessage(doc) {
      await messages.insertOne(validateForWrite('messages', MessageSchema, doc));
    },
    async findMessage(id) {
      const _id = byId(id);
      return _id ? messages.findOne({ _id }) : null;
    },
    listMessages: (conversationId) =>
      messages.find({ conversationId }).sort({ createdAt: 1, _id: 1 }).toArray(),
    async insertTurnTrace(doc) {
      await turnTraces.insertOne(validateForWrite('turn_traces', TurnTraceSchema, doc));
    },
    async upsertFeedback(doc) {
      const valid = validateForWrite('feedback', FeedbackSchema, doc);
      const { _id, ...fields } = valid;
      await feedback.updateOne(
        { messageId: valid.messageId, userId: valid.userId },
        { $set: fields, $setOnInsert: { _id } },
        { upsert: true },
      );
      return (await feedback.findOne({ messageId: valid.messageId, userId: valid.userId }))!;
    },
  };
}

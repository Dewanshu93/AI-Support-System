// In-memory conversation storage for API and workflow tests. Writes are
// validated against the same collection schemas as MongoDB, so a test that
// persists a turn also proves the stored document shapes.
import type { ObjectId } from 'mongodb';
import { validateForWrite } from '../../src/db/collections';
import {
  type ChunkDoc,
  type ConversationDoc,
  ConversationSchema,
  type DocumentDoc,
  type FeedbackDoc,
  FeedbackSchema,
  type MessageDoc,
  MessageSchema,
  type TurnTraceDoc,
  TurnTraceSchema,
} from '../../src/db/schemas';
import {
  type ConversationsRepository,
  decodeCursor,
  encodeCursor,
} from '../../src/modules/conversations/repository';
import type { SourcesReader } from '../../src/modules/documents/repository';

export interface MemoryConversations extends ConversationsRepository {
  conversations: ConversationDoc[];
  messages: MessageDoc[];
  traces: TurnTraceDoc[];
  feedback: FeedbackDoc[];
}

export function memoryConversationsRepository(): MemoryConversations {
  const conversations: ConversationDoc[] = [];
  const messages: MessageDoc[] = [];
  const traces: TurnTraceDoc[] = [];
  const feedback: FeedbackDoc[] = [];
  const byHex = <T extends { _id: ObjectId }>(list: T[], id: string) =>
    list.find((x) => x._id.toHexString() === id) ?? null;
  const ordered = (list: MessageDoc[]) =>
    [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    conversations,
    messages,
    traces,
    feedback,
    async recentMessages(conversationId, limit, excludeMessageId) {
      return ordered(
        messages.filter(
          (m) =>
            m.conversationId.toHexString() === conversationId &&
            (m.role === 'user' || m.role === 'assistant') &&
            m._id.toHexString() !== excludeMessageId,
        ),
      ).slice(-limit);
    },
    async insertConversation(doc) {
      conversations.push(validateForWrite('conversations', ConversationSchema, doc));
    },
    findConversation: async (id) => byHex(conversations, id),
    async listConversations(userId, { limit, cursor, status }) {
      const after = cursor ? decodeCursor(cursor) : null;
      const sorted = conversations
        .filter((c) => c.userId.equals(userId) && !c.isEval && (!status || c.status === status))
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b._id.toHexString().localeCompare(a._id.toHexString()),
        )
        .filter(
          (c) =>
            !after ||
            c.updatedAt < after.updatedAt ||
            (c.updatedAt.getTime() === after.updatedAt.getTime() &&
              c._id.toHexString() < after.id.toHexString()),
        );
      const items = sorted.slice(0, limit);
      return {
        items,
        nextCursor: sorted.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    },
    async updateConversation(id, set, options = {}) {
      const c = conversations.find((x) => x._id.equals(id));
      if (!c) return;
      Object.assign(c, set);
      if (options.incrementTurns) c.turnCount += 1;
      validateForWrite('conversations', ConversationSchema, c);
    },
    async insertMessage(doc) {
      if (messages.some((m) => m._id.equals(doc._id))) throw new Error('duplicate message _id');
      messages.push(validateForWrite('messages', MessageSchema, doc));
    },
    findMessage: async (id) => byHex(messages, id),
    listMessages: async (conversationId) =>
      ordered(messages.filter((m) => m.conversationId.equals(conversationId))),
    async insertTurnTrace(doc) {
      traces.push(validateForWrite('turn_traces', TurnTraceSchema, doc));
    },
    async upsertFeedback(doc) {
      const valid = validateForWrite('feedback', FeedbackSchema, doc);
      const existing = feedback.find(
        (f) => f.messageId.equals(valid.messageId) && f.userId.equals(valid.userId),
      );
      if (existing) {
        Object.assign(existing, { ...valid, _id: existing._id });
        return existing;
      }
      feedback.push(valid);
      return valid;
    },
  };
}

export function memorySourcesReader(
  chunks: ChunkDoc[] = [],
  documents: DocumentDoc[] = [],
): SourcesReader {
  return {
    findChunk: async (id) => chunks.find((c) => c._id.toHexString() === id) ?? null,
    findDocument: async (id) => documents.find((d) => d._id.equals(id)) ?? null,
    neighbourIds: async (chunk) => {
      const at = (ordinal: number) =>
        chunks
          .find((c) => c.documentId.equals(chunk.documentId) && c.ordinal === ordinal)
          ?._id.toHexString() ?? null;
      return [at(chunk.ordinal - 1), at(chunk.ordinal + 1)];
    },
  };
}

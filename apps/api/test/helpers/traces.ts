// In-memory trace-viewer reads for API tests (W4-03), over plain arrays.
import type { ChunkDoc, ConversationDoc, MessageDoc, TurnTraceDoc } from '../../src/db/schemas';
import { decodeCursor, encodeCursor } from '../../src/modules/conversations/repository';
import type { TracesRepository } from '../../src/modules/traces/repository';

export interface TraceStore {
  conversations: ConversationDoc[];
  traces: TurnTraceDoc[];
  messages: MessageDoc[];
  chunks: ChunkDoc[];
}

export function memoryTracesRepository(
  store: TraceStore = { conversations: [], traces: [], messages: [], chunks: [] },
): TracesRepository {
  return {
    async listConversations(filter, { limit, cursor }) {
      const after = cursor ? decodeCursor(cursor) : null;
      const withDecision = filter.decision
        ? new Set(
            store.traces
              .filter((t) => !t.isEval && t.decision.value === filter.decision)
              .map((t) => t.conversationId.toHexString()),
          )
        : null;
      const docs = store.conversations
        .filter(
          (c) =>
            !c.isEval &&
            (!filter.status || c.status === filter.status) &&
            (!filter.userId || c.userId.toHexString() === filter.userId) &&
            (!filter.start || c.createdAt >= filter.start) &&
            (!filter.end || c.createdAt < filter.end) &&
            (!withDecision || withDecision.has(c._id.toHexString())) &&
            (!after ||
              c.updatedAt < after.updatedAt ||
              (c.updatedAt.getTime() === after.updatedAt.getTime() &&
                c._id.toHexString() < after.id.toHexString())),
        )
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b._id.toHexString().localeCompare(a._id.toHexString()),
        );
      const items = docs.slice(0, limit);
      return {
        items,
        nextCursor: docs.length > limit ? encodeCursor(items[items.length - 1]!) : null,
      };
    },
    findConversation: async (id) =>
      store.conversations.find((c) => c._id.toHexString() === id) ?? null,
    listTraces: async (conversationId) =>
      store.traces
        .filter((t) => t.conversationId.equals(conversationId))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    findMessages: async (ids) => store.messages.filter((m) => ids.some((id) => id.equals(m._id))),
    findTrace: async (id) => store.traces.find((t) => t._id.toHexString() === id) ?? null,
    findChunks: async (ids) => store.chunks.filter((c) => ids.includes(c._id.toHexString())),
  };
}

import { type Collection, ObjectId } from 'mongodb';
import type { MessageDoc } from '../../db/schemas';

/** Conversation data access. Grows with the chat endpoints (W2-08). */
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
}

export function mongoConversationsRepository(
  messages: Collection<MessageDoc>,
): ConversationsRepository {
  return {
    async recentMessages(conversationId, limit, excludeMessageId) {
      if (!ObjectId.isValid(conversationId)) return [];
      const filter: Record<string, unknown> = {
        conversationId: new ObjectId(conversationId),
        role: { $in: ['user', 'assistant'] },
      };
      if (excludeMessageId && ObjectId.isValid(excludeMessageId)) {
        filter._id = { $ne: new ObjectId(excludeMessageId) };
      }
      const newestFirst = await messages
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return newestFirst.reverse();
    },
  };
}

// Conversation rules: ownership (another user's conversation is NOT_FOUND, never
// FORBIDDEN), resolution and feedback (playbook section 4).
import type { AuthUser, FeedbackRequest, ResolutionRequest } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { ConversationDoc, FeedbackDoc, MessageDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import type { ConversationsRepository } from './repository';

export interface ConversationServiceDeps {
  conversations: ConversationsRepository;
  /** templates.yaml resolution_declined: the system message offering escalation. */
  resolutionDeclinedText: string;
  now?: () => Date;
}

const ANSWER_DECISIONS = new Set(['ANSWER', 'PARTIAL']);

export function createConversationService(deps: ConversationServiceDeps) {
  const { conversations } = deps;
  const now = deps.now ?? (() => new Date());

  /** The conversation if `user` owns it; NOT_FOUND otherwise (no existence leak). */
  async function getOwned(id: string, user: AuthUser): Promise<ConversationDoc> {
    const conversation = await conversations.findConversation(id);
    if (!conversation || conversation.userId.toHexString() !== user.id) {
      throw new AppError('NOT_FOUND', 'Conversation not found');
    }
    return conversation;
  }

  return {
    getOwned,

    async create(user: AuthUser): Promise<ConversationDoc> {
      const at = now();
      const doc: ConversationDoc = {
        _id: new ObjectId(),
        userId: new ObjectId(user.id),
        title: '',
        status: 'open',
        resolution: null,
        ticketId: null,
        restricted: false,
        lastDecision: null,
        turnCount: 0,
        isEval: false,
        createdAt: at,
        updatedAt: at,
      };
      await conversations.insertConversation(doc);
      return doc;
    },

    async resolve(id: string, user: AuthUser, req: ResolutionRequest): Promise<ConversationDoc> {
      const conversation = await getOwned(id, user);
      const message = await conversations.findMessage(req.messageId);
      if (!message || !message.conversationId.equals(conversation._id)) {
        throw new AppError('NOT_FOUND', 'Message not found');
      }
      if (
        message.role !== 'assistant' ||
        !message.decision ||
        !ANSWER_DECISIONS.has(message.decision)
      ) {
        throw new AppError('CONFLICT', 'Only an answer can be marked as resolving the question');
      }
      const at = now();
      const resolution = { confirmed: req.resolved, at, messageId: message._id };
      if (req.resolved) {
        await conversations.updateConversation(conversation._id, {
          status: 'resolved',
          resolution,
          updatedAt: at,
        });
      } else {
        const offer: MessageDoc = {
          _id: new ObjectId(),
          conversationId: conversation._id,
          role: 'system_event',
          content: deps.resolutionDeclinedText,
          decision: null,
          reasonCode: null,
          citations: [],
          uncovered: [],
          ticketDraft: null,
          status: 'complete',
          isEval: false,
          createdAt: at,
        };
        await conversations.insertMessage(offer);
        await conversations.updateConversation(conversation._id, { resolution, updatedAt: at });
      }
      return (await conversations.findConversation(id))!;
    },

    async feedback(messageId: string, user: AuthUser, req: FeedbackRequest): Promise<FeedbackDoc> {
      const message = await conversations.findMessage(messageId);
      if (!message) throw new AppError('NOT_FOUND', 'Message not found');
      const conversation = await conversations.findConversation(
        message.conversationId.toHexString(),
      );
      if (!conversation || conversation.userId.toHexString() !== user.id) {
        throw new AppError('NOT_FOUND', 'Message not found');
      }
      if (message.role !== 'assistant') {
        throw new AppError('CONFLICT', 'Only assistant messages can be rated');
      }
      return conversations.upsertFeedback({
        _id: new ObjectId(),
        messageId: message._id,
        conversationId: conversation._id,
        userId: new ObjectId(user.id),
        rating: req.rating,
        ...(req.comment && { comment: req.comment }),
        createdAt: now(),
      });
    },
  };
}
export type ConversationService = ReturnType<typeof createConversationService>;

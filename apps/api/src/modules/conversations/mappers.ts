// Database documents → API DTOs (packages/shared/src/api/conversations.ts).
import type { ConversationDto, FeedbackResponse, MessageDto } from '@sd/shared';
import type { ConversationDoc, FeedbackDoc, MessageDoc } from '../../db/schemas';

export function toConversationDto(c: ConversationDoc): ConversationDto {
  return {
    id: c._id.toHexString(),
    title: c.title,
    status: c.status,
    lastDecision: c.lastDecision,
    restricted: c.restricted,
    resolution: c.resolution
      ? {
          confirmed: c.resolution.confirmed,
          at: c.resolution.at.toISOString(),
          messageId: c.resolution.messageId.toHexString(),
        }
      : null,
    turnCount: c.turnCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toMessageDto(m: MessageDoc): MessageDto {
  return {
    id: m._id.toHexString(),
    role: m.role,
    content: m.content,
    decision: m.decision,
    reasonCode: m.reasonCode,
    citations: m.citations.map((c) => ({
      marker: c.marker,
      chunkId: c.chunkId.toHexString(),
      documentId: c.documentId.toHexString(),
      docTitle: c.docTitle,
      sectionPath: c.sectionPath,
      effectiveDate: c.effectiveDate.toISOString(),
    })),
    uncovered: m.uncovered,
    ticketDraft: m.ticketDraft,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toFeedbackDto(f: FeedbackDoc): FeedbackResponse['feedback'] {
  return {
    id: f._id.toHexString(),
    messageId: f.messageId.toHexString(),
    rating: f.rating,
    ...(f.comment !== undefined && { comment: f.comment }),
    createdAt: f.createdAt.toISOString(),
  };
}

// Conversations, chat, resolution, feedback and source viewing (playbook
// section 4: Conversations and Chat). Request and response bodies.
import { z } from 'zod';
import {
  ConversationStatusSchema,
  DecisionSchema,
  FeedbackRatingSchema,
  MessageRoleSchema,
  MessageStatusSchema,
} from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';
import { TicketDraftSchema } from './tickets';

/** A validated citation as shown to the employee. */
export const CitationDtoSchema = z.object({
  marker: z.string().regex(/^S\d+$/),
  chunkId: ObjectIdStringSchema,
  documentId: ObjectIdStringSchema,
  docTitle: z.string(),
  sectionPath: z.array(z.string()),
  /** ISO date. */
  effectiveDate: z.string(),
});
export type CitationDto = z.infer<typeof CitationDtoSchema>;

export const ConversationDtoSchema = z.object({
  id: ObjectIdStringSchema,
  title: z.string(),
  status: ConversationStatusSchema,
  lastDecision: DecisionSchema.nullable(),
  restricted: z.boolean(),
  resolution: z
    .object({ confirmed: z.boolean(), at: z.string(), messageId: ObjectIdStringSchema })
    .nullable(),
  turnCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationDto = z.infer<typeof ConversationDtoSchema>;

export const ConversationResponseSchema = z.object({ conversation: ConversationDtoSchema });
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

export const CreateConversationRequestSchema = z.strictObject({});

export const ConversationListQuerySchema = PaginationQuerySchema.extend({
  status: ConversationStatusSchema.optional(),
});
export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

export const ConversationSummarySchema = z.object({
  id: ObjectIdStringSchema,
  title: z.string(),
  status: ConversationStatusSchema,
  lastDecision: DecisionSchema.nullable(),
  updatedAt: z.string(),
  ticketHumanId: z.string().optional(),
});
export const ConversationListResponseSchema = paginatedSchema(ConversationSummarySchema);
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

export const MessageDtoSchema = z.object({
  id: ObjectIdStringSchema,
  role: MessageRoleSchema,
  content: z.string(),
  decision: DecisionSchema.nullable(),
  reasonCode: z.string().nullable(),
  citations: z.array(CitationDtoSchema),
  uncovered: z.array(z.string()),
  ticketDraft: z.record(z.string(), z.unknown()).nullable(),
  status: MessageStatusSchema,
  createdAt: z.string(),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const ConversationDetailResponseSchema = z.object({
  conversation: ConversationDtoSchema,
  messages: z.array(MessageDtoSchema),
  /** The draft awaiting confirmation, read from the graph checkpoint. */
  pendingDraft: TicketDraftSchema.optional(),
});
export type ConversationDetailResponse = z.infer<typeof ConversationDetailResponseSchema>;

export const ConversationParamsSchema = z.object({ id: ObjectIdStringSchema });

export const PostMessageRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(2000),
});
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;

export const EscalateRequestSchema = z.strictObject({
  reason: z.string().trim().max(500).optional(),
});
export type EscalateRequest = z.infer<typeof EscalateRequestSchema>;

export const ResolutionRequestSchema = z.strictObject({
  messageId: ObjectIdStringSchema,
  resolved: z.boolean(),
});
export type ResolutionRequest = z.infer<typeof ResolutionRequestSchema>;

export const MessageParamsSchema = z.object({ id: ObjectIdStringSchema });

export const FeedbackRequestSchema = z.strictObject({
  rating: FeedbackRatingSchema,
  comment: z.string().trim().max(500).optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({
  feedback: z.object({
    id: ObjectIdStringSchema,
    messageId: ObjectIdStringSchema,
    rating: FeedbackRatingSchema,
    comment: z.string().optional(),
    createdAt: z.string(),
  }),
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

export const ChunkParamsSchema = z.object({ chunkId: ObjectIdStringSchema });

export const SourceChunkResponseSchema = z.object({
  chunk: z.object({ id: ObjectIdStringSchema, text: z.string(), sectionPath: z.array(z.string()) }),
  document: z.object({
    title: z.string(),
    version: z.string(),
    effectiveDate: z.string(),
    owner: z.string(),
  }),
  /** Adjacent chunks of the same document the caller may read; null at either end. */
  neighbours: z.tuple([ObjectIdStringSchema.nullable(), ObjectIdStringSchema.nullable()]),
});
export type SourceChunkResponse = z.infer<typeof SourceChunkResponseSchema>;

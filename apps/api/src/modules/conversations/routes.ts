// Conversation endpoints (playbook section 4: Conversations, Chat resolution and
// feedback). Employees only; a conversation of another user is NOT_FOUND.
import {
  API_BASE_PATH,
  type ConversationDetailResponse,
  type ConversationListQuery,
  ConversationListQuerySchema,
  type ConversationListResponse,
  ConversationParamsSchema,
  type ConversationResponse,
  CreateConversationRequestSchema,
  type FeedbackRequest,
  FeedbackRequestSchema,
  type FeedbackResponse,
  MessageParamsSchema,
  type ResolutionRequest,
  ResolutionRequestSchema,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { pendingAction, pendingDraft } from '../chat/turnRunner';
import { toConversationDto, toFeedbackDto, toMessageDto } from './mappers';
import type { ConversationService } from './service';

export function conversationRoutes(deps: AppDeps, service: ConversationService): RouteDef[] {
  const base = `${API_BASE_PATH}/conversations`;
  const params = (req: { validated: { params?: unknown } }) =>
    (req.validated.params as { id: string }).id;

  return [
    {
      method: 'post',
      path: base,
      access: ['employee'],
      handlers: [
        validate({ body: CreateConversationRequestSchema }),
        async (req, res) => {
          const body: ConversationResponse = {
            conversation: toConversationDto(await service.create(req.user!)),
          };
          res.status(201).json(body);
        },
      ],
    },
    {
      method: 'get',
      path: base,
      access: ['employee'],
      handlers: [
        validate({ query: ConversationListQuerySchema }),
        async (req, res) => {
          const query = req.validated.query as ConversationListQuery;
          const page = await deps.conversations.listConversations(
            new ObjectId(req.user!.id),
            query,
          );
          const body: ConversationListResponse = {
            items: page.items.map((c) => ({
              id: c._id.toHexString(),
              title: c.title,
              status: c.status,
              lastDecision: c.lastDecision,
              updatedAt: c.updatedAt.toISOString(),
            })),
            nextCursor: page.nextCursor,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:id`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema }),
        async (req, res) => {
          const conversation = await service.getOwned(params(req), req.user!);
          const id = conversation._id.toHexString();
          const [messages, draft, action] = await Promise.all([
            deps.conversations.listMessages(conversation._id),
            pendingDraft(deps.chat.graph, id),
            pendingAction(deps.chat.graph, id),
          ]);
          const body: ConversationDetailResponse = {
            conversation: toConversationDto(conversation),
            messages: messages.map(toMessageDto),
            ...(draft && { pendingDraft: draft }),
            ...(action && { pendingAction: action }),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/:id/resolution`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema, body: ResolutionRequestSchema }),
        async (req, res) => {
          const conversation = await service.resolve(
            params(req),
            req.user!,
            req.body as ResolutionRequest,
          );
          const body: ConversationResponse = { conversation: toConversationDto(conversation) };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${API_BASE_PATH}/messages/:id/feedback`,
      access: ['employee'],
      handlers: [
        validate({ params: MessageParamsSchema, body: FeedbackRequestSchema }),
        async (req, res) => {
          const feedback = await service.feedback(
            params(req),
            req.user!,
            req.body as FeedbackRequest,
          );
          const body: FeedbackResponse = { feedback: toFeedbackDto(feedback) };
          res.json(body);
        },
      ],
    },
  ];
}

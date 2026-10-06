// Employee ticket endpoints (playbook section 4: Tickets (employee)). Confirm
// and cancel a draft; list and read own tickets (no internal fields or events).
import {
  API_BASE_PATH,
  ConversationParamsSchema,
  type ConversationResponse,
  type TicketConfirmResponse,
  type TicketDetailResponse,
  type TicketDraftConfirmRequest,
  TicketDraftConfirmRequestSchema,
  type TicketListQuery,
  TicketListQuerySchema,
  type TicketListResponse,
  TicketParamsSchema,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';
import { toConversationDto } from '../conversations/mappers';
import type { TicketService } from './service';

export function ticketRoutes(deps: AppDeps, service: TicketService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const draft = `${API_BASE_PATH}/conversations/:id/ticket-draft`;
  const queueLabel = (id: string) =>
    deps.ticketConfig.routing.queues.find((q) => q.id === id)?.label ?? id;

  return [
    {
      method: 'post',
      path: `${draft}/confirm`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema, body: TicketDraftConfirmRequestSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const { ticket, created } = await service.confirm(
            id,
            req.user!,
            req.body as TicketDraftConfirmRequest,
          );
          if (created) {
            await audit.record(req, {
              action: 'ticket.create',
              actor: req.user!,
              targetType: 'ticket',
              targetId: ticket._id.toHexString(),
              metadata: { conversationId: id, humanId: ticket.humanId },
            });
          }
          const body: TicketConfirmResponse = {
            ticket: {
              id: ticket._id.toHexString(),
              humanId: ticket.humanId,
              queue: ticket.queue,
              priority: ticket.priority,
              status: ticket.status,
            },
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${draft}/cancel`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const body: ConversationResponse = {
            conversation: toConversationDto(await service.cancel(id, req.user!)),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${API_BASE_PATH}/tickets/mine`,
      access: ['employee'],
      handlers: [
        validate({ query: TicketListQuerySchema }),
        async (req, res) => {
          const page = await deps.tickets.listForRequester(
            new ObjectId(req.user!.id),
            req.validated.query as TicketListQuery,
          );
          const body: TicketListResponse = {
            items: page.items.map((t) => ({
              id: t._id.toHexString(),
              humanId: t.humanId,
              summary: t.summary,
              status: t.status,
              priority: t.priority,
              updatedAt: t.updatedAt.toISOString(),
            })),
            nextCursor: page.nextCursor,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${API_BASE_PATH}/tickets/:id`,
      access: ['employee'],
      handlers: [
        validate({ params: TicketParamsSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const t = await deps.tickets.findById(id);
          // Only the requester; anyone else gets NOT_FOUND (no existence leak).
          if (!t || t.requesterId.toHexString() !== req.user!.id) {
            throw new AppError('NOT_FOUND', 'Ticket not found');
          }
          const events = await deps.tickets.listEvents(t._id, 'public');
          const body: TicketDetailResponse = {
            ticket: {
              id: t._id.toHexString(),
              humanId: t.humanId,
              summary: t.summary,
              status: t.status,
              priority: t.priority,
              updatedAt: t.updatedAt.toISOString(),
              conversationId: t.conversationId.toHexString(),
              domain: t.domain,
              category: t.category,
              subcategory: t.subcategory,
              queueLabel: queueLabel(t.queue),
              fields: t.fields,
              restricted: t.restricted,
              createdAt: t.createdAt.toISOString(),
              resolvedAt: t.resolvedAt?.toISOString() ?? null,
            },
            events: events.map((e) => ({
              id: e._id.toHexString(),
              type: e.type,
              body: e.body,
              createdAt: e.createdAt.toISOString(),
            })),
          };
          res.json(body);
        },
      ],
    },
  ];
}

// Employee ticket endpoints (playbook section 4: Tickets (employee)). Confirm
// and cancel a draft; list and read own tickets (no internal fields or events);
// comment on, withdraw or reopen own requests (UC-17).
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
  type RequestCommentRequest,
  RequestCommentRequestSchema,
  type RequestStatusChangeRequest,
  RequestStatusChangeRequestSchema,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import type { TicketDoc } from '../../db/schemas';
import { REQUEST_CHANGES } from '../../domain/requestChanges';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';
import { toConversationDto } from '../conversations/mappers';
import { toTicketEmail } from '../email/mappers';
import { createRequesterService } from './requesterService';
import type { TicketService } from './service';

export function ticketRoutes(deps: AppDeps, service: TicketService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const draft = `${API_BASE_PATH}/conversations/:id/ticket-draft`;
  const queueLabel = (id: string) =>
    deps.ticketConfig.routing.queues.find((q) => q.id === id)?.label ?? id;
  const requester = createRequesterService({
    tickets: deps.tickets,
    agentTickets: deps.agentTickets,
    now: deps.clock,
  });

  return [
    {
      method: 'post',
      path: `${draft}/confirm`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema, body: TicketDraftConfirmRequestSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const { ticket, created, email, emailCreated } = await service.confirm(
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
          // Also on a "same issue" link, where no ticket was created.
          if (email && emailCreated) {
            await audit.record(req, {
              action: 'email.send',
              actor: req.user!,
              targetType: 'email',
              targetId: email._id.toHexString(),
              // IDs and flags only: never the subject, body or address.
              metadata: {
                conversationId: id,
                ticketHumanId: email.ticketHumanId,
                queue: email.to.queueId,
                mode: email.delivery.mode,
                status: email.delivery.status,
                editedSubject: email.edited.subject,
                editedBody: email.edited.body,
              },
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
            email: email
              ? {
                  id: email._id.toHexString(),
                  status: email.delivery.status,
                  mode: email.delivery.mode,
                }
              : null,
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
          res.json(await detail(t, req.user!.id));
        },
      ],
    },
    // The requester's own changes (UC-17, ADR-028): the request page and, after
    // confirmation, the copilot use the same service and rules.
    ...REQUEST_CHANGES.map((kind): RouteDef => ({
      method: 'post',
      path: `${API_BASE_PATH}/tickets/:id/${kind}`,
      access: ['employee'],
      handlers: [
        validate({
          params: TicketParamsSchema,
          body: kind === 'comment' ? RequestCommentRequestSchema : RequestStatusChangeRequestSchema,
        }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const text =
            kind === 'comment'
              ? (req.body as RequestCommentRequest).body
              : (req.body as RequestStatusChangeRequest).reason;
          const { ticket, from } = await requester.change(req.user!.id, id, kind, text);
          await audit.record(req, {
            action: `ticket.${kind}`,
            targetType: 'ticket',
            targetId: ticket._id.toHexString(),
            metadata: { from, to: ticket.status, triggeredBy: 'form', approvedBy: 'employee' },
          });
          res.json(await detail(ticket, req.user!.id));
        },
      ],
    })),
  ];

  /** The requester's view of a ticket: public events and their own emails only. */
  async function detail(t: TicketDoc, userId: string): Promise<TicketDetailResponse> {
    const events = await deps.tickets.listEvents(t._id, 'public');
    // A linked ticket can hold emails from several conversations: only the requester's own.
    const emails = (await deps.email.listForTicket(t._id)).filter(
      (e) => e.requesterId.toHexString() === userId,
    );
    return {
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
      emails: emails.map(toTicketEmail),
    };
  }
}

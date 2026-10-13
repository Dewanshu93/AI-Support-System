// Agent ticket endpoints (playbook section 4: Agent; contract flow 8). Agents
// and admins only; per-ticket access is checked in the service (404 outside the
// agent's queues). POST …/draft-reply (P-7, W3-06) returns a draft; it never sends.
import {
  type AgentClassificationRequest,
  AgentClassificationRequestSchema,
  type AgentDraftReplyRequest,
  AgentDraftReplyRequestSchema,
  type AgentDraftReplyResponse,
  type AgentEventResponse,
  type AgentNoteRequest,
  AgentNoteRequestSchema,
  type AgentReplyRequest,
  AgentReplyRequestSchema,
  type AgentStatusRequest,
  AgentStatusRequestSchema,
  type AgentTicket,
  type AgentTicketDetailResponse,
  type AgentTicketEvent,
  type AgentTicketListQuery,
  AgentTicketListQuerySchema,
  type AgentTicketListResponse,
  AgentTicketParamsSchema,
  type AgentTicketResponse,
  API_BASE_PATH,
  type CitationDto,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { TicketDoc, TicketEventDoc } from '../../db/schemas';
import { queueScope } from '../../domain/agentAccess';
import { TRANSITIONS } from '../../domain/ticketStateMachine';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';
import { toMessageDto } from '../conversations/mappers';
import { toTicketEmail } from '../email/mappers';
import type { DraftReplyService } from './draftReply';
import type { AgentService } from './service';

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toAgentEvent(e: TicketEventDoc): AgentTicketEvent {
  return {
    id: e._id.toHexString(),
    type: e.type,
    visibility: e.visibility,
    actorId: e.actorId?.toHexString() ?? null,
    body: e.body,
    field: e.field,
    oldValue: e.oldValue,
    newValue: e.newValue,
    createdAt: e.createdAt.toISOString(),
  };
}

export function agentRoutes(
  deps: AppDeps,
  service: AgentService,
  drafts: DraftReplyService,
): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = `${API_BASE_PATH}/agent/tickets`;
  const access = ['agent', 'admin'] as const;
  const queueLabel = (id: string) =>
    deps.ticketConfig.routing.queues.find((q) => q.id === id)?.label ?? id;
  const idOf = (req: { validated: { params?: unknown } }) =>
    (req.validated.params as { id: string }).id;

  const toAgentTicket = (t: TicketDoc): AgentTicket => ({
    id: t._id.toHexString(),
    humanId: t.humanId,
    conversationId: t.conversationId.toHexString(),
    requester: { id: t.requesterId.toHexString(), ...t.requesterSnapshot },
    domain: t.domain,
    category: t.category,
    subcategory: t.subcategory,
    queue: t.queue,
    queueLabel: queueLabel(t.queue),
    priority: t.priority,
    aiUrgency: t.aiUrgency,
    priorityFloorApplied: t.priorityFloorApplied,
    status: t.status,
    summary: t.summary,
    agentBrief: t.agentBrief,
    agentAssist: t.agentAssist && {
      status: t.agentAssist.status,
      headline: t.agentAssist.headline,
      firstChecks: t.agentAssist.firstChecks,
    },
    fields: t.fields,
    restricted: t.restricted,
    duplicateOf: t.duplicateOf?.toHexString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: iso(t.resolvedAt),
  });

  return [
    {
      method: 'get',
      path: base,
      access,
      handlers: [
        validate({ query: AgentTicketListQuerySchema }),
        async (req, res) => {
          const query = req.validated.query as AgentTicketListQuery;
          const queues = queueScope(req.user!, query.queue);
          if (queues === 'forbidden') {
            throw new AppError('FORBIDDEN', 'That queue is not assigned to you');
          }
          const page = await deps.agentTickets.listQueue({ ...query, queues });
          const now = Date.now();
          // Restricted cases only reach agents of the confidential queue (the
          // queue scope already ensures this; filter again as a second guard).
          const visible = page.items.filter(
            (t) =>
              !t.restricted ||
              req.user!.role === 'admin' ||
              req.user!.queues.includes(deps.ticketConfig.routing.sensitiveQueue),
          );
          const body: AgentTicketListResponse = {
            items: visible.map((t) => ({
              id: t._id.toHexString(),
              humanId: t.humanId,
              summary: t.summary,
              priority: t.priority,
              status: t.status,
              category: t.category,
              queue: t.queue,
              requesterName: t.requesterSnapshot.name,
              ageMinutes: Math.max(0, Math.floor((now - t.createdAt.getTime()) / 60_000)),
              restricted: t.restricted,
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
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema }),
        async (req, res) => {
          const ticket = await service.getVisible(idOf(req), req.user!);
          const [events, messages, emails] = await Promise.all([
            deps.tickets.listEvents(ticket._id),
            deps.conversations.listMessages(ticket.conversationId),
            // Restricted tickets never get an email (ADR-017); skip the read.
            ticket.restricted ? Promise.resolve([]) : deps.email.listForTicket(ticket._id),
          ]);
          if (ticket.restricted) {
            await audit.record(req, {
              action: 'ticket.view',
              targetType: 'ticket',
              targetId: ticket._id.toHexString(),
              metadata: { humanId: ticket.humanId, restricted: true },
            });
          }
          const dtos = messages.map(toMessageDto);
          const citations = new Map<string, CitationDto>();
          for (const m of dtos) for (const c of m.citations) citations.set(c.chunkId, c);
          const body: AgentTicketDetailResponse = {
            ticket: toAgentTicket(ticket),
            aiFilledFields: ticket.aiFilledFields,
            articlesShown: ticket.articlesShown.map((a) => ({
              documentId: a.documentId.toHexString(),
              docTitle: a.docTitle,
            })),
            events: events.map(toAgentEvent),
            transcript: dtos.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            })),
            citationsShown: [...citations.values()],
            emails: emails.map(toTicketEmail),
            allowedStatuses: [...TRANSITIONS[ticket.status]],
            // A confidential case keeps its category (applyClassification refuses a change).
            categoryOptions: deps.ticketConfig.taxonomy.categories
              .filter((c) => !ticket.restricted || c.id === ticket.category)
              .map((c) => ({
                id: c.id,
                label: c.label,
                domain: c.domain,
                subcategories: c.subcategories.map((s) => ({ id: s.id, label: s.label })),
              })),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/:id/replies`,
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema, body: AgentReplyRequestSchema }),
        async (req, res) => {
          const { body, usedAiDraft } = req.body as AgentReplyRequest;
          const event = await service.reply(idOf(req), req.user!, body);
          await audit.record(req, {
            action: 'ticket.reply',
            targetType: 'ticket',
            targetId: event.ticketId.toHexString(),
            metadata: { eventId: event._id.toHexString(), usedAiDraft },
          });
          const response: AgentEventResponse = { event: toAgentEvent(event) };
          res.status(201).json(response);
        },
      ],
    },
    {
      // A draft for the agent to edit and send as their own reply; never sent here.
      method: 'post',
      path: `${base}/:id/draft-reply`,
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema, body: AgentDraftReplyRequestSchema }),
        async (req, res) => {
          const { tone } = req.body as AgentDraftReplyRequest;
          const result = await drafts.generate(idOf(req), req.user!, tone);
          await audit.record(req, {
            action: 'ticket.ai_draft',
            targetType: 'ticket',
            targetId: result.ticket._id.toHexString(),
            metadata: {
              humanId: result.ticket.humanId,
              tone,
              promptVersion: result.promptVersion,
              citedDocuments: result.draft.citedDocuments.length,
            },
          });
          const body: AgentDraftReplyResponse = {
            draft: result.draft,
            promptVersion: result.promptVersion,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/:id/notes`,
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema, body: AgentNoteRequestSchema }),
        async (req, res) => {
          const { body } = req.body as AgentNoteRequest;
          const event = await service.note(idOf(req), req.user!, body);
          const response: AgentEventResponse = { event: toAgentEvent(event) };
          res.status(201).json(response);
        },
      ],
    },
    {
      method: 'patch',
      path: `${base}/:id/status`,
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema, body: AgentStatusRequestSchema }),
        async (req, res) => {
          const { status } = req.body as AgentStatusRequest;
          const { ticket, from } = await service.setStatus(idOf(req), req.user!, status);
          await audit.record(req, {
            action: 'ticket.status_change',
            targetType: 'ticket',
            targetId: ticket._id.toHexString(),
            metadata: { humanId: ticket.humanId, from, to: status },
          });
          const response: AgentTicketResponse = { ticket: toAgentTicket(ticket) };
          res.json(response);
        },
      ],
    },
    {
      method: 'patch',
      path: `${base}/:id/classification`,
      access,
      handlers: [
        validate({ params: AgentTicketParamsSchema, body: AgentClassificationRequestSchema }),
        async (req, res) => {
          const { ticket, changed, rerouted } = await service.classify(
            idOf(req),
            req.user!,
            req.body as AgentClassificationRequest,
          );
          if (changed.length > 0) {
            await audit.record(req, {
              action: 'ticket.classification',
              targetType: 'ticket',
              targetId: ticket._id.toHexString(),
              metadata: { humanId: ticket.humanId, changed, rerouted, queue: ticket.queue },
            });
          }
          const response: AgentTicketResponse = { ticket: toAgentTicket(ticket) };
          res.json(response);
        },
      ],
    },
  ];
}

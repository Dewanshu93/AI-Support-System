// createTicket (code, graph-owned tool node; playbook section 5). Runs after the
// employee confirms the draft. Queue and priority are recomputed by the domain
// rules and the requester is the turn's authenticated user: nothing in the
// draft or the edits can set them. Idempotent: a conversation has at most one
// ticket, so a retried confirm finds it instead of creating a second.
import { ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import type { TicketDoc } from '../../db/schemas';
import { findDuplicate } from '../../domain/duplicateCheck';
import { applyPriorityFloor, restrictedCasePriority } from '../../domain/priorityFloors';
import { routeTicket } from '../../domain/routing';
import { fillTemplate } from '../../domain/templates';
import { normaliseFields, UNKNOWN } from '../../domain/ticketSchemas';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { TicketsRepository } from '../../modules/tickets/repository';
import type { UsersRepository } from '../../modules/users/repository';
import { EMPTY_TICKET_FLOW, type State, type StateUpdate } from '../graph/state';

export interface CreateTicketDeps {
  tickets: TicketsRepository;
  users: Pick<UsersRepository, 'findById'>;
  conversations: Pick<ConversationsRepository, 'insertMessage' | 'updateConversation'>;
  routing: ConfigFiles['routing'];
  priorityRules: ConfigFiles['priorityRules'];
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
  templates: ConfigFiles['templates']['templates'];
  duplicateWindowDays: number;
  now?: () => Date;
  isEval?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createCreateTicket(deps: CreateTicketDeps) {
  const now = deps.now ?? (() => new Date());

  return async function createTicket(state: State): Promise<StateUpdate> {
    const draft = state.output?.draft;
    if (!draft) throw new Error('createTicket: no draft');
    const confirmation = state.confirmation ?? { action: 'confirm' as const };
    const conversationId = new ObjectId(state.input.conversationId);
    const requesterId = new ObjectId(state.input.userId);
    const at = now();

    const systemMessage = async (content: string) =>
      deps.conversations.insertMessage({
        _id: new ObjectId(),
        conversationId,
        role: 'system_event',
        content,
        decision: null,
        reasonCode: null,
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: deps.isEval ?? false,
        createdAt: at,
      });
    const done = (ticketId: ObjectId): StateUpdate => ({
      output: { ...state.output!, ticketId: ticketId.toHexString() },
      ticketFlow: EMPTY_TICKET_FLOW,
    });

    // Idempotency: this conversation already has its ticket.
    const existing = await deps.tickets.findByConversation(conversationId);
    if (existing) return done(existing._id);

    const recent = draft.restricted
      ? []
      : await deps.tickets.findRecentByRequester(
          requesterId,
          draft.category,
          new Date(at.getTime() - deps.duplicateWindowDays * DAY_MS),
        );
    const duplicate = findDuplicate(
      { requesterId: requesterId.toHexString(), category: draft.category },
      recent.map((t) => ({ ...t, id: t._id, requesterId: t.requesterId.toHexString() })),
      { now: at, windowDays: deps.duplicateWindowDays },
    );

    // "Same issue": link the conversation to the open ticket; no new ticket.
    if (confirmation.duplicateDecision === 'same' && duplicate) {
      const linked = recent.find((t) => t._id.equals(duplicate.id))!;
      await deps.conversations.updateConversation(conversationId, {
        ticketId: linked._id,
        status: 'escalated',
        updatedAt: at,
      });
      await systemMessage(
        fillTemplate(deps.templates.ticket_linked, { ticketHumanId: linked.humanId }),
      );
      return done(linked._id);
    }

    const queue = routeTicket(deps.routing, {
      category: draft.category,
      restricted: draft.restricted,
    });
    const edits = confirmation.edits ?? {};
    const fields = draft.restricted
      ? {}
      : normaliseFields(deps.ticketSchemas, draft.category, { ...draft.fields, ...edits });
    const edited = new Set(Object.keys(edits));
    const matchedRules = [
      ...(state.ticketFlow.matchedRules ?? []),
      ...(state.precheckResult?.matchedRules ?? []),
    ];
    const { priority, floorApplied } = draft.restricted
      ? { priority: restrictedCasePriority(matchedRules), floorApplied: null }
      : applyPriorityFloor(
          { aiUrgency: draft.aiUrgency, matchedRules, impactScope: draft.impactScope },
          deps.priorityRules.floors,
        );
    const user = await deps.users.findById(state.input.userId);
    if (!user) throw new Error(`createTicket: requester ${state.input.userId} not found`);

    const ticket: TicketDoc = {
      _id: new ObjectId(),
      humanId: await deps.tickets.nextHumanId(queue.domain),
      conversationId,
      requesterId,
      requesterSnapshot: {
        name: user.name,
        email: user.email,
        country: user.country,
        employmentType: user.employmentType,
        department: user.department,
      },
      domain: queue.domain,
      category: draft.category,
      subcategory: draft.subcategory,
      queue: queue.id,
      priority,
      aiUrgency: draft.aiUrgency,
      priorityFloorApplied: floorApplied,
      status: 'new',
      summary: draft.summary,
      // The agent brief is written by agentSummary (P-6, W3-06); until then, the description.
      agentBrief: draft.description,
      fields,
      aiFilledFields: draft.aiFilledFields.filter((k) => !edited.has(k) && fields[k] !== UNKNOWN),
      articlesShown: draft.articlesShown.map((a) => ({
        documentId: new ObjectId(a.documentId),
        docTitle: a.docTitle,
      })),
      restricted: draft.restricted,
      duplicateOf: duplicate && confirmation.duplicateDecision === 'new' ? duplicate.id : null,
      isEval: deps.isEval ?? false,
      createdAt: at,
      updatedAt: at,
      resolvedAt: null,
    };
    await deps.tickets.insert(ticket);
    await deps.tickets.insertEvent({
      _id: new ObjectId(),
      ticketId: ticket._id,
      actorId: requesterId,
      type: 'created',
      visibility: 'public',
      body: null,
      field: null,
      oldValue: null,
      newValue: null,
      createdAt: at,
    });
    await deps.conversations.updateConversation(conversationId, {
      ticketId: ticket._id,
      status: ticket.restricted ? 'handed_off' : 'escalated',
      ...(ticket.restricted && { restricted: true }),
      updatedAt: at,
    });
    await systemMessage(
      fillTemplate(deps.templates.ticket_confirmed, {
        ticketHumanId: ticket.humanId,
        queueLabel: queue.label,
      }),
    );
    return done(ticket._id);
  };
}

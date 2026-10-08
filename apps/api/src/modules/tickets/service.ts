// Ticket draft confirmation (playbook section 4; contract flows 4–6). No ticket
// exists before confirm: confirm resumes the graph paused in awaitConfirmation,
// and createTicket runs only then. Confirm is idempotent and retryable.
import { Command } from '@langchain/langgraph';
import type {
  AuthUser,
  DuplicateCandidate,
  TicketDraft,
  TicketDraftConfirmRequest,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import { threadConfig } from '../../ai/graph/checkpointer';
import type { SupportGraph } from '../../ai/graph/graph';
import type { State } from '../../ai/graph/state';
import type { ConfigFiles } from '../../config/schemas';
import type { ConversationDoc, EmailOutboxDoc, TicketDoc } from '../../db/schemas';
import { findDuplicate } from '../../domain/duplicateCheck';
import { unknownEditKeys } from '../../domain/ticketSchemas';
import { AppError } from '../../lib/errors';
import type { ConversationsRepository } from '../conversations/repository';
import type { EmailService } from '../email/service';
import type { TicketsRepository } from './repository';

export interface TicketServiceDeps {
  graph: SupportGraph;
  tickets: TicketsRepository;
  /** The escalation email outbox (UC-07): read back after confirm. */
  email: Pick<EmailService, 'findByConversation'>;
  conversations: Pick<ConversationsRepository, 'findConversation' | 'insertMessage'>;
  getOwned(id: string, user: AuthUser): Promise<ConversationDoc>;
  /** Serialises confirm/cancel with chat turns of the same conversation. */
  exclusive<T>(conversationId: string, fn: () => Promise<T>): Promise<T>;
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
  templates: ConfigFiles['templates']['templates'];
  duplicateWindowDays: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createTicketService(deps: TicketServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function pausedDraft(conversationId: string) {
    const snapshot = await deps.graph.getState(threadConfig(conversationId));
    const state = snapshot.values as State;
    return { next: snapshot.next, draft: state.output?.draft as TicketDraft | undefined };
  }

  async function ticketOf(conversationId: string): Promise<TicketDoc> {
    const conversation = (await deps.conversations.findConversation(conversationId))!;
    const ticket = conversation.ticketId
      ? await deps.tickets.findById(conversation.ticketId.toHexString())
      : null;
    if (!ticket) throw new Error(`conversation ${conversationId} has no ticket after confirm`);
    return ticket;
  }

  return {
    async confirm(
      id: string,
      user: AuthUser,
      req: TicketDraftConfirmRequest,
    ): Promise<{
      ticket: TicketDoc;
      created: boolean;
      email: EmailOutboxDoc | null;
      emailCreated: boolean;
    }> {
      const conversation = await deps.getOwned(id, user);
      return deps.exclusive(id, async () => {
        const { next, draft } = await pausedDraft(id);
        const config = threadConfig(id);
        const conversationId = new ObjectId(id);
        const emailBefore = await deps.email.findByConversation(conversationId);
        const result = async (created: boolean) => {
          const email = await deps.email.findByConversation(conversationId);
          return {
            ticket: await ticketOf(id),
            created,
            email,
            // Only the call that recorded the email audits it.
            emailCreated: email !== null && emailBefore === null,
          };
        };

        // A previous confirm failed inside createTicket or sendEmail: continue it (retryable).
        if (next.includes('createTicket') || next.includes('sendEmail')) {
          await deps.graph.invoke(null, config);
          return result(true);
        }
        if (!next.includes('awaitConfirmation') || !draft) {
          // Idempotent: confirming again returns the ticket already created.
          if (conversation.ticketId) return result(false);
          throw new AppError('NOT_FOUND', 'There is no ticket draft to confirm');
        }

        if (req.email && !draft.email) {
          throw new AppError('VALIDATION_ERROR', 'This request has no email to send');
        }

        const unknown = unknownEditKeys(deps.ticketSchemas, draft.category, req.edits);
        if (unknown.length > 0) {
          throw new AppError('VALIDATION_ERROR', 'Edits may only change the ticket fields', {
            unknownFields: unknown,
          });
        }

        if (!req.duplicateDecision && !draft.restricted) {
          const at = now();
          const requesterId = new ObjectId(user.id);
          const recent = await deps.tickets.findRecentByRequester(
            requesterId,
            draft.category,
            new Date(at.getTime() - deps.duplicateWindowDays * DAY_MS),
          );
          const duplicate = findDuplicate(
            { requesterId: user.id, category: draft.category },
            recent.map((t) => ({ ...t, id: t, requesterId: t.requesterId.toHexString() })),
            { now: at, windowDays: deps.duplicateWindowDays },
          );
          if (duplicate) {
            const details: DuplicateCandidate = {
              existing: {
                humanId: duplicate.id.humanId,
                summary: duplicate.id.summary,
                status: duplicate.id.status,
              },
            };
            throw new AppError(
              'DUPLICATE_CANDIDATE',
              `You already have an open ticket on this (${duplicate.id.humanId})`,
              details,
            );
          }
        }

        await deps.graph.invoke(
          new Command({
            resume: {
              action: 'confirm',
              edits: req.edits,
              ...(req.duplicateDecision && { duplicateDecision: req.duplicateDecision }),
              // Absent: send the drafted text the employee was shown.
              ...(req.email && { email: req.email }),
            },
          }),
          config,
        );
        return result(true);
      });
    },

    async cancel(id: string, user: AuthUser): Promise<ConversationDoc> {
      await deps.getOwned(id, user);
      return deps.exclusive(id, async () => {
        const { next } = await pausedDraft(id);
        if (!next.includes('awaitConfirmation')) {
          throw new AppError('NOT_FOUND', 'There is no ticket draft to cancel');
        }
        await deps.graph.invoke(new Command({ resume: { action: 'cancel' } }), threadConfig(id));
        const conversationId = new ObjectId(id);
        await deps.conversations.insertMessage({
          _id: new ObjectId(),
          conversationId,
          role: 'system_event',
          content: deps.templates.ticket_cancelled,
          decision: null,
          reasonCode: null,
          citations: [],
          uncovered: [],
          ticketDraft: null,
          status: 'complete',
          isEval: false,
          createdAt: now(),
        });
        return (await deps.conversations.findConversation(id))!;
      });
    },
  };
}
export type TicketService = ReturnType<typeof createTicketService>;

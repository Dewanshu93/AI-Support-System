// sendEmail (code, graph-owned tool node; UC-07, ADR-017). Runs after
// createTicket, so only once the employee has confirmed. Code decides
// everything but the text: the recipient is recomputed from the ticket's queue
// (a "same issue" link goes to the linked ticket's queue), the sender is the
// user record, and the subject and body are exactly the confirmed text (or the
// drafted text shown). Idempotent: one outbox row per conversation, delivered
// once, with one public event and one chat note, so a retried confirm that
// resumes here repeats nothing.
import { EmailBodySchema, EmailSubjectSchema } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import type { EmailOutboxDoc } from '../../db/schemas';
import { fillTemplate } from '../../domain/templates';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { EmailService } from '../../modules/email/service';
import type { TicketsRepository } from '../../modules/tickets/repository';
import type { UsersRepository } from '../../modules/users/repository';
import type { State, StateUpdate } from '../graph/state';

/** The ticket's queue has no email address (or is the confidential queue): nothing sent. */
export const EMAIL_NO_RECIPIENT = 'EMAIL_NO_RECIPIENT';

export interface SendEmailDeps {
  email: Pick<EmailService, 'mode' | 'recordOnce' | 'deliver'>;
  tickets: Pick<TicketsRepository, 'findById' | 'insertEvent' | 'listEvents'>;
  users: Pick<UsersRepository, 'findById'>;
  conversations: Pick<ConversationsRepository, 'insertMessage'>;
  routing: ConfigFiles['routing'];
  templates: ConfigFiles['templates']['templates'];
  now?: () => Date;
  isEval?: boolean;
}

export function createSendEmail(deps: SendEmailDeps) {
  const now = deps.now ?? (() => new Date());

  return async function sendEmail(state: State): Promise<StateUpdate> {
    const output = state.output;
    const draft = output?.draft;
    if (!draft?.email || draft.restricted || !output?.ticketId) return {};

    const ticket = await deps.tickets.findById(output.ticketId);
    if (!ticket) throw new Error(`sendEmail: ticket ${output.ticketId} not found`);
    const queue = deps.routing.queues.find((q) => q.id === ticket.queue);
    if (!queue?.email || queue.id === deps.routing.sensitiveQueue || ticket.restricted) {
      return {
        trace: { flags: [EMAIL_NO_RECIPIENT], outputs: { sendEmail: { queue: ticket.queue } } },
      };
    }
    const user = await deps.users.findById(state.input.userId);
    if (!user) throw new Error(`sendEmail: requester ${state.input.userId} not found`);

    // The API validated the confirmed text with the same schemas; parsing again
    // keeps this node safe for any other caller.
    const drafted = { subject: draft.email.subject, body: draft.email.body };
    const confirmed = state.confirmation?.email ?? drafted;
    const subject = EmailSubjectSchema.parse(confirmed.subject);
    const body = EmailBodySchema.parse(confirmed.body);
    const at = now();
    const conversationId = new ObjectId(state.input.conversationId);
    const requesterId = new ObjectId(state.input.userId);

    const row: EmailOutboxDoc = {
      _id: new ObjectId(),
      conversationId,
      ticketId: ticket._id,
      ticketHumanId: ticket.humanId,
      requesterId,
      from: { name: user.name, address: user.email },
      to: { queueId: queue.id, label: queue.label, address: queue.email },
      subject,
      body,
      aiDraft: drafted,
      edited: { subject: subject !== drafted.subject, body: body !== drafted.body },
      issueSource: draft.email.issueSource,
      recordsAsOf: draft.email.recordsAsOf,
      delivery: {
        mode: deps.email.mode,
        status: 'queued',
        attempts: 0,
        lastError: null,
        deliveredAt: null,
        providerMessageId: null,
      },
      isEval: deps.isEval ?? false,
      createdAt: at,
      updatedAt: at,
    };
    const { doc: stored } = await deps.email.recordOnce(row);
    const { doc: email, transitioned } = await deps.email.deliver(stored);
    const emailId = email._id.toHexString();
    const delivered = email.delivery.status === 'recorded' || email.delivery.status === 'sent';

    // One public event per email (checked, so a resumed run does not repeat it).
    if (delivered) {
      const events = await deps.tickets.listEvents(email.ticketId, 'public');
      if (!events.some((e) => e.type === 'email_sent' && e.newValue === emailId)) {
        await deps.tickets.insertEvent({
          _id: new ObjectId(),
          ticketId: email.ticketId,
          actorId: requesterId,
          type: 'email_sent',
          visibility: 'public',
          // The recipient team only: the subject and body stay in the outbox.
          body: `Email sent to ${email.to.label}`,
          field: null,
          oldValue: null,
          newValue: emailId,
          createdAt: at,
        });
      }
    }
    // The chat note is written by the call that moved the email out of 'queued'.
    if (transitioned) {
      await deps.conversations.insertMessage({
        _id: new ObjectId(),
        conversationId,
        role: 'system_event',
        content: delivered
          ? fillTemplate(deps.templates.email_recorded, {
              queueLabel: email.to.label,
              ticketHumanId: email.ticketHumanId,
            })
          : fillTemplate(deps.templates.email_failed, { ticketHumanId: email.ticketHumanId }),
        decision: null,
        reasonCode: null,
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: deps.isEval ?? false,
        createdAt: at,
      });
    }

    return {
      output: { ...output, emailId },
      trace: {
        // IDs and flags only: never the subject, body or address.
        outputs: {
          sendEmail: {
            emailId,
            queue: email.to.queueId,
            mode: email.delivery.mode,
            status: email.delivery.status,
            edited: email.edited,
          },
        },
      },
    };
  };
}

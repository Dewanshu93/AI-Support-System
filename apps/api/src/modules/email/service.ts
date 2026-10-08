// Escalation email service (UC-07, ADR-017): the outbox plus the transport.
// Used by the graph-owned sendEmail node (writes) and the ticket endpoints (reads).
import type { EmailDeliveryMode } from '@sd/shared';
import type { ObjectId } from 'mongodb';
import type { EmailOutboxDoc } from '../../db/schemas';
import type { EmailRepository } from './repository';
import type { EmailTransport } from './transport';

export interface EmailService {
  /** The delivery mode new rows are written with. */
  mode: EmailDeliveryMode;
  recordOnce(doc: EmailOutboxDoc): Promise<{ doc: EmailOutboxDoc; inserted: boolean }>;
  /**
   * Delivers a queued row once. `transitioned` is true only for the call that
   * moved it out of 'queued'; any other row is returned unchanged.
   */
  deliver(doc: EmailOutboxDoc): Promise<{ doc: EmailOutboxDoc; transitioned: boolean }>;
  findByConversation(conversationId: ObjectId): Promise<EmailOutboxDoc | null>;
  listForTicket(ticketId: ObjectId): Promise<EmailOutboxDoc[]>;
}

export interface EmailServiceDeps {
  repository: EmailRepository;
  transport: EmailTransport;
  now?: () => Date;
}

export function createEmailService(deps: EmailServiceDeps): EmailService {
  const now = deps.now ?? (() => new Date());
  const { repository, transport } = deps;

  return {
    mode: transport.kind,
    recordOnce: (doc) => repository.recordOnce(doc),
    async deliver(stale) {
      // Re-read: the caller's copy may predate an earlier delivery, and the
      // transport must not run twice for one email.
      const doc = (await repository.findByConversation(stale.conversationId)) ?? stale;
      if (doc.delivery.status !== 'queued') return { doc, transitioned: false };
      let updated: EmailOutboxDoc | null;
      try {
        const { providerMessageId } = await transport.deliver(doc);
        updated = await repository.markDelivered(doc._id, {
          status: transport.kind === 'mock' ? 'recorded' : 'sent',
          providerMessageId,
          at: now(),
        });
      } catch (err) {
        updated = await repository.markFailed(doc._id, {
          error: err instanceof Error ? err.message : String(err),
          at: now(),
        });
      }
      if (updated) return { doc: updated, transitioned: true };
      // Another call moved it first: return the row as it is now.
      const current = await repository.findByConversation(doc.conversationId);
      return { doc: current ?? doc, transitioned: false };
    },
    findByConversation: (conversationId) => repository.findByConversation(conversationId),
    listForTicket: (ticketId) => repository.listForTicket(ticketId),
  };
}

// Outbox row → the email shown to the requester and queue agents (UC-07).
// Delivery internals (attempts, lastError, providerMessageId) and the AI
// draft are never exposed.
import type { TicketEmail } from '@sd/shared';
import type { EmailOutboxDoc } from '../../db/schemas';

export function toTicketEmail(doc: EmailOutboxDoc): TicketEmail {
  return {
    id: doc._id.toHexString(),
    to: { label: doc.to.label, address: doc.to.address },
    subject: doc.subject,
    body: doc.body,
    status: doc.delivery.status,
    mode: doc.delivery.mode,
    edited: { subject: doc.edited.subject, body: doc.edited.body },
    createdAt: doc.createdAt.toISOString(),
    deliveredAt: doc.delivery.deliveredAt?.toISOString() ?? null,
  };
}

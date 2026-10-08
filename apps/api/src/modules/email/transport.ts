// Email transports (UC-07, ADR-017). Only the mock exists: it delivers nothing
// and returns a deterministic message ID, so the row is 'recorded'. SMTP needs
// a mail dependency that is not approved, so EMAIL_DELIVERY=smtp stops startup.
import type { EmailDeliveryMode } from '@sd/shared';
import { ConfigError } from '../../config/errors';
import type { EmailOutboxDoc } from '../../db/schemas';

export interface EmailTransport {
  kind: EmailDeliveryMode;
  /** Delivers the email; throws on failure. */
  deliver(doc: EmailOutboxDoc): Promise<{ providerMessageId: string }>;
}

/** Stores nothing and sends nothing; the outbox row is the record. */
export function createMockTransport(): EmailTransport {
  return {
    kind: 'mock',
    // Deterministic, so a receiver could deduplicate a redelivery.
    deliver: async (doc) => ({ providerMessageId: `<${doc._id.toHexString()}@outbox.mock>` }),
  };
}

export const SMTP_NOT_APPROVED =
  'EMAIL_DELIVERY=smtp needs Nodemailer, which is not approved yet (Build Contract H). Set EMAIL_DELIVERY=mock.';

/** The transport for EMAIL_DELIVERY; throws a ConfigError at startup for smtp. */
export function createEmailTransport(mode: EmailDeliveryMode): EmailTransport {
  if (mode === 'smtp') throw new ConfigError(SMTP_NOT_APPROVED);
  return createMockTransport();
}

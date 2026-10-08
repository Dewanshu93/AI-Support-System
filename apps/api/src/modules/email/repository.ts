// Escalation email outbox (UC-07, ADR-017). One row per escalation
// conversation: recordOnce is an upsert keyed on conversationId, so a retried
// confirm finds the row instead of writing a second. Delivery status moves
// only from 'queued', so the status transition happens exactly once.
import { type Collection, MongoServerError, type ObjectId } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import { type EmailOutboxDoc, EmailOutboxSchema } from '../../db/schemas';

export interface DeliveredUpdate {
  status: 'recorded' | 'sent';
  providerMessageId: string;
  at: Date;
}
export interface FailedUpdate {
  error: string;
  at: Date;
}

export interface EmailRepository {
  /** Inserts the row unless the conversation already has one; returns the stored row. */
  recordOnce(doc: EmailOutboxDoc): Promise<{ doc: EmailOutboxDoc; inserted: boolean }>;
  findByConversation(conversationId: ObjectId): Promise<EmailOutboxDoc | null>;
  /** Oldest first. */
  listForTicket(ticketId: ObjectId): Promise<EmailOutboxDoc[]>;
  /** Moves a queued row to delivered; null when the row was not queued any more. */
  markDelivered(id: ObjectId, update: DeliveredUpdate): Promise<EmailOutboxDoc | null>;
  /** Moves a queued row to failed; null when the row was not queued any more. */
  markFailed(id: ObjectId, update: FailedUpdate): Promise<EmailOutboxDoc | null>;
}

/** The longest lastError kept (provider errors can be long; no content is stored). */
export const MAX_ERROR_LENGTH = 500;

const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000;

export function mongoEmailRepository(collections: {
  emailOutbox: Collection<EmailOutboxDoc>;
}): EmailRepository {
  const { emailOutbox } = collections;
  return {
    async recordOnce(doc) {
      const { conversationId, ...rest } = validateForWrite('email_outbox', EmailOutboxSchema, doc);
      let inserted = false;
      try {
        const result = await emailOutbox.updateOne(
          { conversationId },
          { $setOnInsert: rest },
          { upsert: true },
        );
        inserted = result.upsertedCount === 1;
      } catch (err) {
        // Two concurrent upserts: the other one inserted; read its row.
        if (!isDuplicateKey(err)) throw err;
      }
      const stored = await emailOutbox.findOne({ conversationId });
      if (!stored) throw new Error(`email_outbox row for ${conversationId.toHexString()} missing`);
      return { doc: stored, inserted };
    },
    findByConversation: (conversationId) => emailOutbox.findOne({ conversationId }),
    listForTicket: (ticketId) =>
      emailOutbox.find({ ticketId }).sort({ createdAt: 1, _id: 1 }).toArray(),
    markDelivered: (id, { status, providerMessageId, at }) =>
      emailOutbox.findOneAndUpdate(
        { _id: id, 'delivery.status': 'queued' },
        {
          $set: {
            'delivery.status': status,
            'delivery.providerMessageId': providerMessageId,
            'delivery.deliveredAt': at,
            'delivery.lastError': null,
            updatedAt: at,
          },
          $inc: { 'delivery.attempts': 1 },
        },
        { returnDocument: 'after' },
      ),
    markFailed: (id, { error, at }) =>
      emailOutbox.findOneAndUpdate(
        { _id: id, 'delivery.status': 'queued' },
        {
          $set: {
            'delivery.status': 'failed',
            'delivery.lastError': error.slice(0, MAX_ERROR_LENGTH),
            updatedAt: at,
          },
          $inc: { 'delivery.attempts': 1 },
        },
        { returnDocument: 'after' },
      ),
  };
}

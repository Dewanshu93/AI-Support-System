// Connected-tool tokens (UC-18, ADR-032): one document per employee and provider,
// tokens encrypted by the caller. Validated before every write.
import type { ObjectId } from 'mongodb';
import { type Collections, validateForWrite } from '../../db/collections';
import { type IntegrationTokenDoc, IntegrationTokenSchema } from '../../db/schemas';

export interface IntegrationsRepository {
  find(
    userId: ObjectId,
    provider: IntegrationTokenDoc['provider'],
  ): Promise<IntegrationTokenDoc | null>;
  /** Insert or replace the user's connection for that provider. */
  save(doc: IntegrationTokenDoc): Promise<void>;
  remove(userId: ObjectId, provider: IntegrationTokenDoc['provider']): Promise<boolean>;
}

export function mongoIntegrationsRepository(
  collections: Pick<Collections, 'integrationTokens'>,
): IntegrationsRepository {
  const { integrationTokens } = collections;
  return {
    find: (userId, provider) => integrationTokens.findOne({ userId, provider }),
    async save(doc) {
      const valid = validateForWrite('integration_tokens', IntegrationTokenSchema, doc);
      const { _id, createdAt, ...rest } = valid;
      await integrationTokens.updateOne(
        { userId: valid.userId, provider: valid.provider },
        { $set: rest, $setOnInsert: { _id, createdAt } },
        { upsert: true },
      );
    },
    async remove(userId, provider) {
      return (await integrationTokens.deleteOne({ userId, provider })).deletedCount > 0;
    },
  };
}

import type { Db, Document, IndexDirection } from 'mongodb';
import { COLLECTIONS, type CollectionKey } from './collections';
import { ensureChunkCollection, type QdrantLike } from './qdrant';

export interface IndexSpec {
  name: string;
  key: Record<string, IndexDirection>;
  unique?: true;
  sparse?: true;
}

/** Regular indexes per collection (playbook section 3). Names are explicit so re-runs are no-ops. */
export const REGULAR_INDEXES: Record<CollectionKey, IndexSpec[]> = {
  users: [
    { name: 'email_unique', key: { email: 1 }, unique: true },
    { name: 'role', key: { role: 1 } },
  ],
  documents: [
    { name: 'slug_version_unique', key: { slug: 1, version: 1 }, unique: true },
    { name: 'status_domain', key: { status: 1, domain: 1 } },
  ],
  chunks: [{ name: 'documentId_ordinal_unique', key: { documentId: 1, ordinal: 1 }, unique: true }],
  conversations: [
    { name: 'userId_updatedAt', key: { userId: 1, updatedAt: -1 } },
    { name: 'status_createdAt', key: { status: 1, createdAt: -1 } },
    { name: 'restricted', key: { restricted: 1 } },
    { name: 'isEval_createdAt', key: { isEval: 1, createdAt: -1 } },
  ],
  messages: [
    { name: 'conversationId_createdAt', key: { conversationId: 1, createdAt: 1 } },
    { name: 'decision_createdAt', key: { decision: 1, createdAt: -1 } },
  ],
  turnTraces: [
    { name: 'messageId_unique', key: { messageId: 1 }, unique: true },
    { name: 'conversationId_createdAt', key: { conversationId: 1, createdAt: 1 } },
    { name: 'createdAt', key: { createdAt: -1 } },
    { name: 'decisionValue_createdAt', key: { 'decision.value': 1, createdAt: -1 } },
  ],
  tickets: [
    { name: 'humanId_unique', key: { humanId: 1 }, unique: true },
    { name: 'conversationId_unique', key: { conversationId: 1 }, unique: true, sparse: true },
    {
      name: 'queue_status_priority_createdAt',
      key: { queue: 1, status: 1, priority: -1, createdAt: 1 },
    },
    { name: 'requesterId_createdAt', key: { requesterId: 1, createdAt: -1 } },
    // Duplicate-ticket check (W3-01).
    { name: 'requesterId_category_status', key: { requesterId: 1, category: 1, status: 1 } },
  ],
  ticketEvents: [
    { name: 'ticketId_createdAt', key: { ticketId: 1, createdAt: 1 } },
    // Override rate (classification corrections).
    { name: 'type_createdAt', key: { type: 1, createdAt: -1 } },
  ],
  feedback: [
    // One rating per user per message; writes are upserts.
    { name: 'messageId_userId_unique', key: { messageId: 1, userId: 1 }, unique: true },
    { name: 'rating_createdAt', key: { rating: 1, createdAt: -1 } },
  ],
  evalRuns: [
    { name: 'startedAt', key: { startedAt: -1 } },
    { name: 'suite_startedAt', key: { suite: 1, startedAt: -1 } },
  ],
  evalResults: [
    { name: 'runId_caseId_unique', key: { runId: 1, caseId: 1 }, unique: true },
    { name: 'runId_passed', key: { runId: 1, passed: 1 } },
  ],
  auditLog: [
    { name: 'createdAt', key: { createdAt: -1 } },
    { name: 'actorId_createdAt', key: { actorId: 1, createdAt: -1 } },
    { name: 'targetType_targetId', key: { targetType: 1, targetId: 1 } },
  ],
  counters: [],
  gapClusters: [{ name: 'snapshotAt', key: { snapshotAt: -1 } }],
  projects: [
    { name: 'code_unique', key: { code: 1 }, unique: true },
    { name: 'memberIds', key: { memberIds: 1 } },
  ],
  tasks: [
    { name: 'key_unique', key: { key: 1 }, unique: true },
    { name: 'assigneeId_status_updatedAt', key: { assigneeId: 1, status: 1, updatedAt: -1 } },
  ],
  timesheetEntries: [
    // One entry per employee, day and project; saves are upserts on this key.
    {
      name: 'userId_date_projectId_unique',
      key: { userId: 1, date: 1, projectId: 1 },
      unique: true,
    },
  ],
  attendance: [{ name: 'userId_date_unique', key: { userId: 1, date: 1 }, unique: true }],
  payslips: [
    { name: 'userId_periodStart_unique', key: { userId: 1, periodStart: 1 }, unique: true },
    { name: 'userId_payDate', key: { userId: 1, payDate: -1 } },
  ],
  notifications: [
    { name: 'userId_createdAt', key: { userId: 1, createdAt: -1 } },
    { name: 'userId_readAt', key: { userId: 1, readAt: 1 } },
  ],
  emailOutbox: [
    // One email per escalation conversation; writes are $setOnInsert upserts.
    { name: 'conversationId_unique', key: { conversationId: 1 }, unique: true },
    { name: 'ticketId_createdAt', key: { ticketId: 1, createdAt: 1 } },
    { name: 'requesterId_createdAt', key: { requesterId: 1, createdAt: -1 } },
    { name: 'deliveryStatus_createdAt', key: { 'delivery.status': 1, createdAt: -1 } },
  ],
};

/** Creates any collection that does not exist yet. */
export async function ensureCollections(db: Db): Promise<string[]> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const created: string[] = [];
  for (const name of Object.values(COLLECTIONS)) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      created.push(name);
    }
  }
  return created;
}

const sameKey = (a: Document, b: Document) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Creates missing regular indexes and returns their `collection.name` labels.
 * An existing index with the same name but a different key is a drift error,
 * not something to overwrite silently.
 */
export async function ensureRegularIndexes(db: Db): Promise<string[]> {
  const created: string[] = [];
  for (const [key, specs] of Object.entries(REGULAR_INDEXES) as [CollectionKey, IndexSpec[]][]) {
    if (specs.length === 0) continue;
    const collection = db.collection(COLLECTIONS[key]);
    const existing = new Map(
      (await collection.listIndexes().toArray()).map((ix) => [ix.name as string, ix]),
    );
    const missing = specs.filter((spec) => {
      const current = existing.get(spec.name);
      if (current && !sameKey(current.key, spec.key)) {
        throw new Error(
          `Index ${collection.collectionName}.${spec.name} exists with key ${JSON.stringify(current.key)}; expected ${JSON.stringify(spec.key)}. Drop it and re-run.`,
        );
      }
      return !current;
    });
    if (missing.length > 0) {
      await collection.createIndexes(missing);
      created.push(...missing.map((spec) => `${collection.collectionName}.${spec.name}`));
    }
  }
  return created;
}

export interface EnsureIndexesResult {
  collectionsCreated: string[];
  indexesCreated: string[];
  qdrantCollectionCreated: boolean;
  qdrantPayloadIndexesCreated: string[];
}

/** Idempotent: MongoDB collections and indexes, then the Qdrant chunks collection (ADR-004). */
export async function ensureAllIndexes(
  db: Db,
  qdrant: QdrantLike,
  options: { embeddingDimension: number },
): Promise<EnsureIndexesResult> {
  const collectionsCreated = await ensureCollections(db);
  const indexesCreated = await ensureRegularIndexes(db);
  const q = await ensureChunkCollection(qdrant, options.embeddingDimension);
  return {
    collectionsCreated,
    indexesCreated,
    qdrantCollectionCreated: q.collectionCreated,
    qdrantPayloadIndexesCreated: q.payloadIndexesCreated,
  };
}

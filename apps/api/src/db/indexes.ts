import type { Collection, Db, Document, IndexDirection, SearchIndexDescription } from 'mongodb';
import { COLLECTIONS, type CollectionKey } from './collections';
import { CHUNK_FILTER_FIELDS } from './schemas';

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
};

export const SEARCH_INDEX_NAMES = { vector: 'chunks_vector', text: 'chunks_text' } as const;

/**
 * Atlas Vector Search and Atlas Search definitions for `chunks`. Both index the
 * denormalised metadata, so the profile access filter runs inside the search
 * stage as a pre-filter (playbook section 7).
 */
export function chunkSearchIndexes(embeddingDimension: number): SearchIndexDescription[] {
  return [
    {
      name: SEARCH_INDEX_NAMES.vector,
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: embeddingDimension,
            similarity: 'cosine',
          },
          ...CHUNK_FILTER_FIELDS.map((path) => ({ type: 'filter', path })),
        ],
      },
    },
    {
      name: SEARCH_INDEX_NAMES.text,
      type: 'search',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            contextualText: { type: 'string', analyzer: 'lucene.standard' },
            ...Object.fromEntries(CHUNK_FILTER_FIELDS.map((path) => [path, { type: 'token' }])),
          },
        },
      },
    },
  ];
}

/** Creates any collection that does not exist yet (search indexes need one). */
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

type SearchIndexHost = Pick<Collection, 'listSearchIndexes' | 'createSearchIndex'>;

/** The fields of a $listSearchIndexes row we rely on (the driver types only `name`). */
interface SearchIndexInfo {
  name: string;
  status?: string;
  queryable?: boolean;
  latestDefinition?: Document;
}

async function listSearchIndexInfo(
  chunks: Pick<Collection, 'listSearchIndexes'>,
): Promise<Map<string, SearchIndexInfo>> {
  const rows = (await chunks.listSearchIndexes().toArray()) as SearchIndexInfo[];
  return new Map(rows.map((ix) => [ix.name, ix]));
}

/** Creates missing search indexes on `chunks`; refuses a silent dimension change. */
export async function ensureSearchIndexes(
  chunks: SearchIndexHost,
  embeddingDimension: number,
): Promise<string[]> {
  const existing = await listSearchIndexInfo(chunks);
  const created: string[] = [];
  for (const description of chunkSearchIndexes(embeddingDimension)) {
    const current = existing.get(description.name!);
    if (!current) {
      await chunks.createSearchIndex(description);
      created.push(`chunks.${description.name}`);
      continue;
    }
    if (description.type === 'vectorSearch') {
      const fields = (current.latestDefinition?.fields ?? []) as Document[];
      const dims = fields.find((f) => f.type === 'vector')?.numDimensions;
      if (dims !== undefined && dims !== embeddingDimension) {
        throw new Error(
          `${description.name} has ${dims} dimensions but config/models.yaml says ${embeddingDimension}. ` +
            'Changing the embedding dimension needs a full re-index: drop the index and chunks, then re-run db:indexes and ingest.',
        );
      }
    }
  }
  return created;
}

/** Polls until every named search index is queryable. Atlas builds them asynchronously. */
export async function waitForSearchIndexes(
  chunks: Pick<Collection, 'listSearchIndexes'>,
  names: readonly string[],
  { timeoutMs = 120_000, intervalMs = 2_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const byName = await listSearchIndexInfo(chunks);
    const failed = names.filter((n) => byName.get(n)?.status === 'FAILED');
    if (failed.length > 0) throw new Error(`Search index build failed: ${failed.join(', ')}`);
    const pending = names.filter((n) => byName.get(n)?.queryable !== true);
    if (pending.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for search indexes: ${pending.join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export interface EnsureIndexesResult {
  collectionsCreated: string[];
  indexesCreated: string[];
  searchIndexesCreated: string[];
}

/** Idempotent: collections, regular indexes, then search indexes (waited on unless disabled). */
export async function ensureAllIndexes(
  db: Db,
  options: { embeddingDimension: number; wait?: boolean; timeoutMs?: number },
): Promise<EnsureIndexesResult> {
  const collectionsCreated = await ensureCollections(db);
  const indexesCreated = await ensureRegularIndexes(db);
  const chunks = db.collection(COLLECTIONS.chunks);
  const searchIndexesCreated = await ensureSearchIndexes(chunks, options.embeddingDimension);
  if (options.wait !== false) {
    await waitForSearchIndexes(chunks, Object.values(SEARCH_INDEX_NAMES), {
      timeoutMs: options.timeoutMs,
    });
  }
  return { collectionsCreated, indexesCreated, searchIndexesCreated };
}

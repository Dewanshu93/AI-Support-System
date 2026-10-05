// W1-10 integration: ingests 3 fixture documents into a real MongoDB and Qdrant
// (throwaway database and collection), with fake embeddings — no LLM calls.
// Skipped unless MONGODB_TEST_URI and QDRANT_TEST_URL are set.
import { randomBytes } from 'node:crypto';
import type { QdrantClient } from '@qdrant/js-client-rest';
import {
  CHUNK_VECTORS,
  chunkIdFromPointId,
  connectDatabase,
  createQdrantClient,
  type Database,
  ensureChunkCollection,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import { createChunkEmbedder } from '../../src/ai/ingestion/embedder';
import { documentId } from '../../src/ai/ingestion/identity';
import { ingestSources } from '../../src/ai/ingestion/indexer';
import { loadCorpusSources } from '../../src/ai/ingestion/loaders';
import { FakeEmbeddings } from '../../src/ai/llm/fakeModels';
import { querySparseVector } from '../../src/ai/retrieval/bm25';
import { mongoDocumentsRepository } from '../../src/modules/documents/repository';
import { createDocumentsService } from '../../src/modules/documents/service';
import { qdrantChunkStore } from '../../src/modules/documents/vectorStore';

const mongoUri = process.env.MONGODB_TEST_URI;
const qdrantUrl = process.env.QDRANT_TEST_URL;
jest.setTimeout(180_000);

(mongoUri && qdrantUrl ? describe : describe.skip)('ingestion (integration)', () => {
  const suffix = randomBytes(4).toString('hex');
  const collection = `chunks_test_${suffix}`;
  let database: Database;
  let qdrant: QdrantClient;
  const fixtures = loadCorpusSources().filter(
    (s) =>
      s.meta.slug === 'hr-parental-leave-us' || // both versions: supersede handling
      s.meta.slug === 'hr-public-holidays-uk', // a table
  );

  const service = () =>
    createDocumentsService({
      repo: mongoDocumentsRepository(getCollections(database.db)),
      vectors: qdrantChunkStore(qdrant, collection),
    });
  const embedder = createChunkEmbedder(new FakeEmbeddings(768), {
    model: 'gemini-embedding-001',
    dimension: 768,
    policy: { timeoutMs: 5000, maxRetries: 0 },
  });

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, { dbName: `servicedesk_test_${suffix}` });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
    qdrant = createQdrantClient(qdrantUrl!);
    await ensureChunkCollection(qdrant, 768, collection);
  });

  afterAll(async () => {
    if (qdrant && (await qdrant.collectionExists(collection)).exists)
      await qdrant.deleteCollection(collection);
    if (database) {
      await database.db.dropDatabase();
      await database.client.close();
    }
  });

  it('ingests 3 fixture documents; a re-run is a no-op', async () => {
    expect(fixtures).toHaveLength(3);
    const first = await ingestSources(fixtures, { documents: service(), embedder });
    expect(first.failed).toEqual([]);
    expect(first.indexed.sort()).toEqual(
      [
        'hr-parental-leave-us@2.0',
        'hr-parental-leave-us@3.0',
        'hr-public-holidays-uk@2026.1',
      ].sort(),
    );
    expect(first.superseded).toEqual(['hr-parental-leave-us@2.0']);

    const second = await ingestSources(fixtures, { documents: service(), embedder });
    expect(second.indexed).toEqual([]);
    expect(second.skipped).toHaveLength(3);
  });

  it('keeps chunk metadata consistent between documents, Mongo chunks and Qdrant payloads', async () => {
    const { documents, chunks } = getCollections(database.db);
    for (const doc of await documents.find().toArray()) {
      const stored = await chunks.find({ documentId: doc._id }).sort({ ordinal: 1 }).toArray();
      expect(doc.ingestStatus).toBe('indexed');
      expect(stored).toHaveLength(doc.chunkCount);
      for (const c of stored) {
        expect(c).toMatchObject({
          docSlug: doc.slug,
          status: doc.status,
          accessLevel: doc.accessLevel,
          countries: doc.countries,
        });
      }
      const { points } = await qdrant.scroll(collection, {
        filter: { must: [{ key: 'documentId', match: { value: doc._id.toHexString() } }] },
        with_payload: true,
        limit: 100,
      });
      expect(points).toHaveLength(doc.chunkCount);
      for (const p of points) {
        const chunk = stored.find((c) => c._id.toHexString() === chunkIdFromPointId(String(p.id)));
        expect(chunk).toBeDefined();
        expect(p.payload).toMatchObject({
          status: doc.status,
          docSlug: doc.slug,
          countries: doc.countries,
        });
      }
    }
    const old = await documents.findOne({ _id: documentId('hr-parental-leave-us', '2.0') });
    expect(old).toMatchObject({
      status: 'superseded',
      supersededBy: documentId('hr-parental-leave-us', '3.0'),
    });
  });

  it('makes chunks findable through dense and BM25 search with a status filter', async () => {
    const filter = { must: [{ key: 'status', match: { value: 'active' } }] };
    const keyword = await qdrant.query(collection, {
      query: querySparseVector('Boxing Day substitute bank holiday'),
      using: CHUNK_VECTORS.sparse,
      filter,
      limit: 3,
      with_payload: true,
    });
    expect(keyword.points[0]?.payload?.docSlug).toBe('hr-public-holidays-uk');

    const dense = await qdrant.query(collection, {
      query: await new FakeEmbeddings(768).embedQuery('parental leave weeks paid'),
      using: CHUNK_VECTORS.dense,
      filter,
      limit: 5,
      with_payload: true,
    });
    expect(dense.points.length).toBeGreaterThan(0);
    // The superseded 2.0 version is excluded by the status filter.
    for (const p of dense.points) expect(p.payload?.status).toBe('active');
  });
});

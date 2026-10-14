// W4-04 integration: an uploaded policy becomes retrievable for the right profiles
// only, and superseding / deactivating hides the old version — through the real
// admin upload path, MongoDB and Qdrant (throwaway database and collection, fake
// embeddings, no LLM). Skipped unless MONGODB_TEST_URI and QDRANT_TEST_URL are set.
import { randomBytes } from 'node:crypto';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { ObjectId } from 'mongodb';
import { createChunkEmbedder } from '../../src/ai/ingestion/embedder';
import { documentId } from '../../src/ai/ingestion/identity';
import { ingestSources } from '../../src/ai/ingestion/indexer';
import { loadSourceBody } from '../../src/ai/ingestion/loaders';
import { FakeEmbeddings } from '../../src/ai/llm/fakeModels';
import type { AccessProfile } from '../../src/ai/retrieval/accessRules';
import { retrieve, type RetrieveDeps } from '../../src/ai/retrieval/retrieve';
import {
  connectDatabase,
  createQdrantClient,
  type Database,
  ensureChunkCollection,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import { createDocumentAdmin, type DocumentAdmin } from '../../src/modules/documents/admin';
import { mongoDocumentsRepository } from '../../src/modules/documents/repository';
import { createDocumentsService } from '../../src/modules/documents/service';
import { qdrantChunkStore } from '../../src/modules/documents/vectorStore';

const mongoUri = process.env.MONGODB_TEST_URI;
const qdrantUrl = process.env.QDRANT_TEST_URL;
jest.setTimeout(300_000);

const PARAMS = {
  vectorNumCandidates: 150,
  vectorLimit: 20,
  keywordLimit: 20,
  rrfK: 60,
  fusedTopK: 12,
};
const UK_FULL_TIME: AccessProfile = {
  country: 'UK',
  employmentType: 'full_time',
  accessLevel: 'standard',
};
const UK_CONTRACTOR: AccessProfile = {
  country: 'UK',
  employmentType: 'contractor',
  accessLevel: 'standard',
};
const US_FULL_TIME: AccessProfile = {
  country: 'US',
  employmentType: 'full_time',
  accessLevel: 'standard',
};
const QUERY = 'can I order an external monitor for home use';

const META = {
  slug: 'it-home-office-equipment',
  title: 'Home Office Equipment',
  domain: 'IT',
  owner: 'IT Service Desk',
  version: '1.0',
  effectiveDate: '2026-10-01',
  countries: ['UK'],
  employmentTypes: ['full_time'],
  accessLevel: 'standard',
};
const body = (monitors: number) =>
  Buffer.from(
    `# Home Office Equipment\n\n## Monitors\n\nFull-time employees in the UK may order ${monitors} external monitor for home use.\n`,
  );

(mongoUri && qdrantUrl ? describe : describe.skip)(
  'document upload → retrieval (integration)',
  () => {
    const suffix = randomBytes(4).toString('hex');
    const collection = `chunks_test_${suffix}`;
    const fake = new FakeEmbeddings(768);
    let database: Database;
    let qdrant: QdrantClient;
    let admin: DocumentAdmin;
    let deps: RetrieveDeps;

    const documentsFor = async (profile: AccessProfile): Promise<string[]> => {
      const { candidates, trace } = await retrieve({ query: QUERY, profile }, deps);
      expect(trace.violations).toEqual([]);
      return [...new Set(candidates.map((c) => c.chunk.documentId.toHexString()))];
    };

    beforeAll(async () => {
      database = await connectDatabase(mongoUri!, { dbName: `servicedesk_test_${suffix}` });
      await ensureCollections(database.db);
      await ensureRegularIndexes(database.db);
      qdrant = createQdrantClient(qdrantUrl!);
      await ensureChunkCollection(qdrant, 768, collection);
      const repo = mongoDocumentsRepository(getCollections(database.db));
      const documents = createDocumentsService({
        repo,
        vectors: qdrantChunkStore(qdrant, collection),
      });
      const embedder = createChunkEmbedder(fake, {
        model: 'gemini-embedding-001',
        dimension: 768,
        policy: { timeoutMs: 5000, maxRetries: 0 },
      });
      const files = new Map<string, Uint8Array>();
      admin = createDocumentAdmin({
        repo,
        documents,
        files: {
          read: async (p) => files.get(p)!,
          write: async (p, d) => void files.set(p, d),
        },
        ingest: (sources, opts) =>
          ingestSources(sources, { documents, embedder, force: opts?.force }),
        loadBody: (file, data) => loadSourceBody(file, data),
      });
      deps = {
        qdrant,
        collection,
        embedQuery: (q) => fake.embedQuery(q),
        loadChunks: (ids) => repo.findChunksByIds(ids),
        params: PARAMS,
        onViolation: (v) => {
          throw new Error(`ACCESS_FILTER_VIOLATION ${JSON.stringify(v)}`);
        },
      };
    });

    afterAll(async () => {
      if (qdrant && (await qdrant.collectionExists(collection)).exists)
        await qdrant.deleteCollection(collection);
      if (database) {
        await database.db.dropDatabase();
        await database.client.close();
      }
    });

    const v1 = documentId(META.slug, '1.0').toHexString();
    const v2 = documentId(META.slug, '2.0').toHexString();

    it('a new UK full-time policy is retrievable for UK full-time staff only', async () => {
      const doc = await admin.upload({
        fileName: 'equipment.md',
        data: body(1),
        metadata: JSON.stringify(META),
      });
      expect(doc.ingestStatus).toBe('indexed');
      expect(await documentsFor(UK_FULL_TIME)).toEqual([v1]);
      expect(await documentsFor(UK_CONTRACTOR)).toEqual([]);
      expect(await documentsFor(US_FULL_TIME)).toEqual([]);
    });

    it('a superseding version replaces the old one in retrieval', async () => {
      const doc = await admin.upload({
        fileName: 'equipment-v2.md',
        data: body(2),
        metadata: JSON.stringify({ ...META, version: '2.0', supersedes: '1.0' }),
      });
      expect(doc.ingestStatus).toBe('indexed');
      expect(await documentsFor(UK_FULL_TIME)).toEqual([v2]);
    });

    it('deactivating hides it; re-indexing keeps the audience and status', async () => {
      await admin.setStatus(new ObjectId(v2), 'inactive');
      expect(await documentsFor(UK_FULL_TIME)).toEqual([]);
      await admin.setStatus(new ObjectId(v2), 'active');
      const reindexed = await admin.reindex(new ObjectId(v2));
      expect(reindexed).toMatchObject({ ingestStatus: 'indexed', status: 'active' });
      expect(await documentsFor(UK_FULL_TIME)).toEqual([v2]);
      expect(await documentsFor(UK_CONTRACTOR)).toEqual([]);
    });
  },
);

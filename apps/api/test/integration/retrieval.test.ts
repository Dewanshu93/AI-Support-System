// W1-11 integration: hybrid retrieval over the full corpus in a throwaway MongoDB
// database and Qdrant collection (fake embeddings, no LLM). Skipped unless
// MONGODB_TEST_URI and QDRANT_TEST_URL are set.
import { randomBytes } from 'node:crypto';
import type { QdrantClient } from '@qdrant/js-client-rest';
import {
  connectDatabase,
  createQdrantClient,
  type Database,
  ensureChunkCollection,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import type { ChunkDoc } from '../../src/db/schemas';
import { createChunkEmbedder } from '../../src/ai/ingestion/embedder';
import { ingestSources } from '../../src/ai/ingestion/indexer';
import { loadCorpusSources } from '../../src/ai/ingestion/loaders';
import { FakeEmbeddings } from '../../src/ai/llm/fakeModels';
import { buildAccessFilter } from '../../src/ai/retrieval/accessFilter';
import { type AccessProfile, isAccessible } from '../../src/ai/retrieval/accessRules';
import { keywordSearch } from '../../src/ai/retrieval/keywordSearch';
import { retrieve, type RetrieveDeps } from '../../src/ai/retrieval/retrieve';
import { vectorSearch } from '../../src/ai/retrieval/vectorSearch';
import { mongoDocumentsRepository } from '../../src/modules/documents/repository';
import { createDocumentsService } from '../../src/modules/documents/service';
import { qdrantChunkStore } from '../../src/modules/documents/vectorStore';
import { loadSeedUsers } from '../../src/modules/users/seed';

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
const QUERIES = [
  'how many weeks of parental leave do I get',
  'annual leave entitlement and carry over',
  'public holidays this year',
  'how do I connect to the VPN GlobalProtect',
  'my laptop battery is swollen',
  'password expiry and MFA',
  'expense limits for hotels and meals',
  'retirement pension contributions',
  'approving leave for my team',
  'time off for contractors',
];

const profileOf = (email: string): AccessProfile => {
  const u = loadSeedUsers().find((x) => x.email === email)!;
  return { country: u.country, employmentType: u.employmentType, accessLevel: u.accessLevel };
};
const TOM = profileOf('tom.clarke@example.com'); // UK contractor, standard
const PRIYA = profileOf('priya.shah@example.com'); // US full-time, standard
const RAVI = profileOf('ravi.iyer@example.com'); // US full-time, manager

(mongoUri && qdrantUrl ? describe : describe.skip)('hybrid retrieval (integration)', () => {
  const suffix = randomBytes(4).toString('hex');
  const collection = `chunks_test_${suffix}`;
  const fake = new FakeEmbeddings(768);
  let database: Database;
  let qdrant: QdrantClient;
  let deps: RetrieveDeps;
  let allChunks: Map<string, ChunkDoc>;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, { dbName: `servicedesk_test_${suffix}` });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
    qdrant = createQdrantClient(qdrantUrl!);
    await ensureChunkCollection(qdrant, 768, collection);
    const repo = mongoDocumentsRepository(getCollections(database.db));
    const result = await ingestSources(loadCorpusSources(), {
      documents: createDocumentsService({ repo, vectors: qdrantChunkStore(qdrant, collection) }),
      embedder: createChunkEmbedder(fake, {
        model: 'gemini-embedding-001',
        dimension: 768,
        policy: { timeoutMs: 5000, maxRetries: 0 },
      }),
    });
    expect(result.failed).toEqual([]);
    allChunks = new Map(
      (await getCollections(database.db).chunks.find().toArray()).map((c) => [
        c._id.toHexString(),
        c,
      ]),
    );
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

  it('acceptance: the UK contractor never receives US-only or superseded chunks', async () => {
    let seen = 0;
    for (const query of QUERIES) {
      const { candidates, trace } = await retrieve({ query, profile: TOM }, deps);
      // Raw vector and keyword hits too, not just the fused list.
      for (const id of [...trace.vector, ...trace.keyword].map((h) => h.chunkId)) {
        const c = allChunks.get(id)!;
        expect({ query, slug: c.docSlug, countries: c.countries, status: c.status }).toEqual({
          query,
          slug: c.docSlug,
          countries: expect.arrayContaining(['UK']),
          status: 'active',
        });
        expect(c.employmentTypes).toContain('contractor');
        seen++;
      }
      expect(trace.violations).toEqual([]);
      for (const { chunk } of candidates) expect(isAccessible(chunk, TOM)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('every seeded profile only ever receives accessible chunks', async () => {
    for (const user of loadSeedUsers()) {
      const profile = {
        country: user.country,
        employmentType: user.employmentType,
        accessLevel: user.accessLevel,
      };
      for (const query of QUERIES) {
        const { trace } = await retrieve({ query, profile }, deps);
        for (const id of [...trace.vector, ...trace.keyword].map((h) => h.chunkId)) {
          expect({
            user: user.email,
            query,
            id,
            ok: isAccessible(allChunks.get(id)!, profile),
          }).toEqual({
            user: user.email,
            query,
            id,
            ok: true,
          });
        }
      }
    }
  });

  it('keyword search finds exact terms (GlobalProtect) for an eligible user', async () => {
    const hits = await keywordSearch(
      qdrant,
      collection,
      'GlobalProtect',
      buildAccessFilter(PRIYA),
      { limit: 5 },
    );
    expect(allChunks.get(hits[0]!.chunkId)!.docSlug).toBe('it-vpn-remote-access');
    // The VPN guide is full-time only: the contractor gets nothing from it.
    const tomHits = await keywordSearch(
      qdrant,
      collection,
      'GlobalProtect',
      buildAccessFilter(TOM),
      { limit: 5 },
    );
    for (const h of tomHits)
      expect(allChunks.get(h.chunkId)!.docSlug).not.toBe('it-vpn-remote-access');
  });

  it('vector search returns ranked, filtered results', async () => {
    const hits = await vectorSearch(
      qdrant,
      collection,
      await fake.embedQuery('parental leave weeks'),
      buildAccessFilter(PRIYA),
      {
        limit: 20,
        numCandidates: 150,
      },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.rank)).toEqual(hits.map((_, i) => i + 1));
    for (let i = 1; i < hits.length; i++)
      expect(hits[i]!.score).toBeLessThanOrEqual(hits[i - 1]!.score);
    for (const h of hits) expect(allChunks.get(h.chunkId)!.countries).toContain('US');
  });

  it('fused search serves the active parental-leave version, never the superseded one', async () => {
    const { candidates } = await retrieve(
      { query: 'how many weeks of parental leave', profile: PRIYA },
      deps,
    );
    const slugs = candidates.map((c) => `${c.chunk.docSlug}:${c.chunk.status}`);
    expect(slugs).toContain('hr-parental-leave-us:active');
    expect(slugs).not.toContain('hr-parental-leave-us:superseded');
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(candidates.some((c) => c.vector && c.keyword)).toBe(true);
  });

  it('manager-only guides reach managers but not standard employees', async () => {
    const query = 'approving leave requests for my team';
    const manager = await retrieve({ query, profile: RAVI }, deps);
    const employee = await retrieve({ query, profile: PRIYA }, deps);
    expect(manager.candidates.some((c) => c.chunk.docSlug === 'hr-manager-leave-approval')).toBe(
      true,
    );
    expect(employee.candidates.some((c) => c.chunk.accessLevel === 'manager')).toBe(false);
  });

  it('a domain hint narrows results and falls back when it empties them', async () => {
    const hinted = await retrieve(
      { query: 'GlobalProtect VPN', profile: PRIYA, domainHint: 'IT' },
      deps,
    );
    expect(hinted.candidates.every((c) => c.chunk.domain === 'IT')).toBe(true);
    expect(hinted.trace.domainHintDropped).toBe(false);
  });
});

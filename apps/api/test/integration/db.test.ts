// Integration tests against real servers. Each block is skipped unless its URL is set:
//   MONGODB_TEST_URI="mongodb://192.168.29.3:27017/?directConnection=true"
//   QDRANT_TEST_URL="http://192.168.29.3:6333"
//   npm test -w @sd/api
// Every run uses uniquely named, throwaway databases and collections and removes them afterwards.
import { randomBytes } from 'node:crypto';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { MongoServerError, ObjectId } from 'mongodb';
import {
  CHUNK_PAYLOAD_INDEXES,
  COLLECTIONS,
  connectDatabase,
  createQdrantClient,
  type Database,
  ensureChunkCollection,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
  nextSequence,
  REGULAR_INDEXES,
} from '../../src/db';

const mongoUri = process.env.MONGODB_TEST_URI;
const qdrantUrl = process.env.QDRANT_TEST_URL;
const suffix = randomBytes(4).toString('hex');
if (!mongoUri) console.info('MongoDB integration tests skipped: set MONGODB_TEST_URI');
if (!qdrantUrl) console.info('Qdrant integration tests skipped: set QDRANT_TEST_URL');

jest.setTimeout(120_000);

(mongoUri ? describe : describe.skip)('MongoDB layer (integration)', () => {
  let database: Database;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${suffix}`,
      appName: 'db-integration-test',
    });
  });

  afterAll(async () => {
    if (!database) return;
    await database.db.dropDatabase();
    await database.client.close();
  });

  it('creates every collection and index once; a second run creates nothing', async () => {
    expect((await ensureCollections(database.db)).sort()).toEqual(
      Object.values(COLLECTIONS).sort(),
    );
    const total = Object.values(REGULAR_INDEXES).reduce((n, specs) => n + specs.length, 0);
    expect(await ensureRegularIndexes(database.db)).toHaveLength(total);

    expect(await ensureCollections(database.db)).toEqual([]);
    expect(await ensureRegularIndexes(database.db)).toEqual([]);

    for (const [key, specs] of Object.entries(REGULAR_INDEXES)) {
      const names = (
        await database.db
          .collection(COLLECTIONS[key as keyof typeof COLLECTIONS])
          .listIndexes()
          .toArray()
      ).map((ix) => ix.name);
      expect(names.sort()).toEqual(['_id_', ...specs.map((s) => s.name)].sort());
    }
  });

  it('enforces unique indexes', async () => {
    const { users, tickets } = getCollections(database.db);
    const user = {
      email: 'dup@example.com',
      name: 'Dup',
      role: 'employee' as const,
      country: 'US' as const,
      employmentType: 'full_time' as const,
      department: 'Ops',
      jobTitle: 'Analyst',
      accessLevel: 'standard' as const,
      queues: [],
      isDemo: false,
      createdAt: new Date(),
    };
    await users.insertOne({ _id: new ObjectId(), ...user });
    await expect(users.insertOne({ _id: new ObjectId(), ...user })).rejects.toMatchObject({
      code: 11000,
    });

    const conversationId = new ObjectId();
    await tickets.insertOne({ humanId: 'IT-0001', conversationId } as never);
    await expect(
      tickets.insertOne({ humanId: 'IT-0002', conversationId } as never),
    ).rejects.toBeInstanceOf(MongoServerError);
  });

  it('increments counters atomically under concurrency', async () => {
    const { counters } = getCollections(database.db);
    const values = await Promise.all(
      Array.from({ length: 50 }, () => nextSequence(counters, 'IT')),
    );
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(await nextSequence(counters, 'HR')).toBe(1);
  });
});

(qdrantUrl ? describe : describe.skip)('Qdrant chunks collection (integration)', () => {
  // Throwaway collection name, so a real "chunks" collection is never touched.
  const name = `chunks_test_${suffix}`;
  let qdrant: QdrantClient;

  beforeAll(() => {
    qdrant = createQdrantClient(qdrantUrl!, process.env.QDRANT_TEST_API_KEY);
  });

  afterAll(async () => {
    if (qdrant && (await qdrant.collectionExists(name)).exists) await qdrant.deleteCollection(name);
  });

  it('creates the collection and payload indexes once; a second run creates nothing', async () => {
    const first = await ensureChunkCollection(qdrant, 768, name);
    expect(first.collectionCreated).toBe(true);
    expect(first.payloadIndexesCreated).toHaveLength(CHUNK_PAYLOAD_INDEXES.length);

    expect(await ensureChunkCollection(qdrant, 768, name)).toEqual({
      collectionCreated: false,
      payloadIndexesCreated: [],
    });

    const info = await qdrant.getCollection(name);
    expect(info.config.params.vectors).toMatchObject({ dense: { size: 768, distance: 'Cosine' } });
    expect(info.config.params.sparse_vectors).toMatchObject({ bm25: { modifier: 'idf' } });
    expect(Object.keys(info.payload_schema ?? {}).sort()).toEqual(
      [...CHUNK_PAYLOAD_INDEXES].sort(),
    );
  });

  it('refuses to reuse the collection with a different embedding dimension', async () => {
    await expect(ensureChunkCollection(qdrant, 1536, name)).rejects.toThrow(/full re-index/);
  });
});

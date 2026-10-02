// Integration tests against a real Atlas-capable MongoDB (mongodb-atlas-local or
// Atlas). Skipped unless MONGODB_TEST_URI is set, e.g.
//   MONGODB_TEST_URI="mongodb://localhost:27017/?directConnection=true" npm test -w @sd/api
// Each run uses a fresh, uniquely named database and drops it afterwards.
import { randomBytes } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import {
  COLLECTIONS,
  connectDatabase,
  type Database,
  ensureAllIndexes,
  getCollections,
  nextSequence,
  REGULAR_INDEXES,
  SEARCH_INDEX_NAMES,
} from '../../src/db';

const uri = process.env.MONGODB_TEST_URI;
const describeDb = uri ? describe : describe.skip;
if (!uri) {
  console.info('db integration tests skipped: set MONGODB_TEST_URI to run them');
}

jest.setTimeout(240_000);

describeDb('database layer (integration)', () => {
  let database: Database;

  beforeAll(async () => {
    database = await connectDatabase(uri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
      appName: 'db-integration-test',
    });
  });

  afterAll(async () => {
    if (!database) return;
    await database.db.dropDatabase();
    await database.client.close();
  });

  it('creates every index once; a second run creates nothing; search indexes become queryable', async () => {
    const first = await ensureAllIndexes(database.db, {
      embeddingDimension: 768,
      timeoutMs: 180_000,
    });
    expect(first.collectionsCreated.sort()).toEqual(Object.values(COLLECTIONS).sort());
    expect(first.searchIndexesCreated).toEqual(['chunks.chunks_vector', 'chunks.chunks_text']);

    const second = await ensureAllIndexes(database.db, { embeddingDimension: 768 });
    expect(second).toEqual({
      collectionsCreated: [],
      indexesCreated: [],
      searchIndexesCreated: [],
    });

    for (const [key, specs] of Object.entries(REGULAR_INDEXES)) {
      const names = (
        await database.db
          .collection(COLLECTIONS[key as keyof typeof COLLECTIONS])
          .listIndexes()
          .toArray()
      ).map((ix) => ix.name);
      expect(names.sort()).toEqual(['_id_', ...specs.map((s) => s.name)].sort());
    }

    const search = (await database.db.collection('chunks').listSearchIndexes().toArray()) as {
      name: string;
      queryable?: boolean;
    }[];
    for (const name of Object.values(SEARCH_INDEX_NAMES)) {
      expect(search.find((ix) => ix.name === name)?.queryable).toBe(true);
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

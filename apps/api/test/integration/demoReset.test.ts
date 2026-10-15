// W4-08 integration: `npm run reset` (resetDemo) on a throwaway MongoDB database.
// Running it twice gives the same data; what a demo run leaves behind is cleared;
// seeded requests and the historic data stay. Skipped unless MONGODB_TEST_URI is set.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { loadConfig } from '../../src/config';
import {
  connectDatabase,
  type Database,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import { HISTORIC_CONVERSATIONS } from '../../src/modules/workspace/historic';
import { resetDemo } from '../../src/modules/workspace/reset';
import { loadSeedUsers } from '../../src/modules/users/seed';
import { VALID_ENV } from '../helpers/config';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(300_000);
const TODAY = '2026-10-15';
const config = loadConfig(VALID_ENV);

(mongoUri ? describe : describe.skip)('demo reset (integration)', () => {
  let database: Database;
  const counts = async () => {
    const c = getCollections(database.db);
    return {
      users: await c.users.countDocuments(),
      conversations: await c.conversations.countDocuments(),
      messages: await c.messages.countDocuments(),
      turnTraces: await c.turnTraces.countDocuments(),
      feedback: await c.feedback.countDocuments(),
      tickets: await c.tickets.countDocuments(),
      ticketEvents: await c.ticketEvents.countDocuments(),
      gapClusters: await c.gapClusters.countDocuments(),
      synthetic: await c.conversations.countDocuments({ synthetic: true }),
    };
  };
  const reset = () => resetDemo(database, { today: TODAY, seed: loadSeedUsers(), config });

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
    });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
  });

  afterAll(async () => {
    if (database) {
      await database.db.dropDatabase();
      await database.client.close();
    }
  });

  it('is idempotent and populates the dashboards’ collections', async () => {
    const first = await reset();
    const after1 = await counts();
    await reset();
    const after2 = await counts();
    expect(after2).toEqual(after1);
    expect(after1.synthetic).toBe(HISTORIC_CONVERSATIONS);
    expect(after1.turnTraces).toBe(HISTORIC_CONVERSATIONS);
    expect(after1.tickets).toBeGreaterThan(30);
    expect(after1.gapClusters).toBeGreaterThanOrEqual(3);
    expect(first.ms).toBeLessThan(120_000); // "restores demo state in under 2 minutes"
  });

  it('clears what a demo run left behind, keeping seeded and historic data', async () => {
    const before = await counts();
    const c = getCollections(database.db);
    const priya = (await c.users.findOne({ email: 'priya.shah@example.com' }))!;
    const conversationId = new ObjectId();
    const now = new Date();
    await c.conversations.insertOne({
      _id: conversationId,
      userId: priya._id,
      title: 'Demo run question',
      status: 'open',
      resolution: null,
      ticketId: null,
      restricted: false,
      lastDecision: 'ANSWER',
      turnCount: 1,
      isEval: false,
      createdAt: now,
      updatedAt: now,
    });
    await c.messages.insertOne({
      _id: new ObjectId(),
      conversationId,
      role: 'user',
      content: 'Demo run question',
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: now,
    });
    const anyTicket = (await c.tickets.findOne({ synthetic: true }))!;
    await c.tickets.insertOne({
      ...anyTicket,
      _id: new ObjectId(),
      humanId: 'IT-0777',
      conversationId,
      synthetic: undefined,
    });
    // An evaluation conversation is never cleared.
    await c.conversations.insertOne({
      _id: new ObjectId(),
      userId: priya._id,
      title: 'Eval case',
      status: 'open',
      resolution: null,
      ticketId: null,
      restricted: false,
      lastDecision: 'ANSWER',
      turnCount: 1,
      isEval: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await reset();
    expect(result.cleared).toEqual({ conversations: 1, tickets: 1 });
    const after = await counts();
    expect(after).toEqual({ ...before, conversations: before.conversations + 1 });
    expect(await c.conversations.countDocuments({ isEval: true })).toBe(1);
    expect(await c.conversations.findOne({ _id: conversationId })).toBeNull();
  });
});

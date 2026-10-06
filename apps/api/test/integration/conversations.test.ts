// Conversations repository against a real MongoDB (skipped unless
// MONGODB_TEST_URI is set). Throwaway database, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase, type Database, getCollections } from '../../src/db';
import type { MessageDoc } from '../../src/db/schemas';
import { mongoConversationsRepository } from '../../src/modules/conversations/repository';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(120_000);

(mongoUri ? describe : describe.skip)('conversations repository (integration)', () => {
  let database: Database;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
      appName: 'conversations-test',
    });
  });
  afterAll(async () => {
    await database?.db.dropDatabase();
    await database?.client.close();
  });

  it('returns the last N user/assistant messages oldest first, excluding one', async () => {
    const { messages } = getCollections(database.db);
    const conversationId = new ObjectId();
    const make = (i: number, role: MessageDoc['role']): MessageDoc => ({
      _id: new ObjectId(),
      conversationId,
      role,
      content: `m${i}`,
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: new Date(Date.UTC(2026, 9, 6, 9, i)),
    });
    const docs = Array.from({ length: 11 }, (_, i) =>
      make(i, i === 4 ? 'system_event' : i % 2 === 0 ? 'user' : 'assistant'),
    );
    const other = { ...make(99, 'user'), conversationId: new ObjectId() };
    await messages.insertMany([...docs, other]);

    const repo = mongoConversationsRepository(messages);
    const current = docs[10]!;
    const recent = await repo.recentMessages(
      conversationId.toHexString(),
      8,
      current._id.toHexString(),
    );
    // m0…m9 minus the system event m4 → nine; the last eight are m1…m9 without m4.
    expect(recent.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm5', 'm6', 'm7', 'm8', 'm9']);
    expect(await repo.recentMessages('not-an-id', 8)).toEqual([]);
  });
});

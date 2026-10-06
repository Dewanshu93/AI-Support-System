// Conversations repository against a real MongoDB (skipped unless
// MONGODB_TEST_URI is set). Throwaway database, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase, type Database, getCollections } from '../../src/db';
import type { ConversationDoc, MessageDoc } from '../../src/db/schemas';
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

    const repo = mongoConversationsRepository(getCollections(database.db));
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

  it('conversations: insert, cursor pagination, update with turn increment', async () => {
    const repo = mongoConversationsRepository(getCollections(database.db));
    const userId = new ObjectId();
    const base = Date.UTC(2026, 9, 6, 9, 0);
    const docs: ConversationDoc[] = [0, 1, 2].map((i) => ({
      _id: new ObjectId(),
      userId,
      title: `c${i}`,
      status: 'open',
      resolution: null,
      ticketId: null,
      restricted: false,
      lastDecision: null,
      turnCount: 0,
      isEval: false,
      createdAt: new Date(base),
      updatedAt: new Date(base + i * 60_000),
    }));
    for (const d of docs) await repo.insertConversation(d);
    const page1 = await repo.listConversations(userId, { limit: 2 });
    expect(page1.items.map((c) => c.title)).toEqual(['c2', 'c1']);
    const page2 = await repo.listConversations(userId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((c) => c.title)).toEqual(['c0']);
    expect(page2.nextCursor).toBeNull();

    await repo.updateConversation(
      docs[0]!._id,
      { lastDecision: 'ANSWER' },
      { incrementTurns: true },
    );
    expect(await repo.findConversation(docs[0]!._id.toHexString())).toMatchObject({
      lastDecision: 'ANSWER',
      turnCount: 1,
    });
    await expect(
      repo.insertConversation({ ...docs[0]!, _id: new ObjectId(), status: 'nope' as never }),
    ).rejects.toThrow('Invalid conversations document');
  });

  it('feedback upserts one rating per user per message', async () => {
    const repo = mongoConversationsRepository(getCollections(database.db));
    const base = {
      messageId: new ObjectId(),
      conversationId: new ObjectId(),
      userId: new ObjectId(),
      createdAt: new Date(),
    };
    const first = await repo.upsertFeedback({ _id: new ObjectId(), ...base, rating: 'down' });
    const second = await repo.upsertFeedback({ _id: new ObjectId(), ...base, rating: 'up' });
    expect(second._id.equals(first._id)).toBe(true);
    expect(second.rating).toBe('up');
  });
});

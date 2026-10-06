// Tickets repository against a real MongoDB (skipped unless MONGODB_TEST_URI is
// set). Throwaway database with the real indexes, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  connectDatabase,
  type Database,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import type { TicketDoc } from '../../src/db/schemas';
import { mongoTicketsRepository } from '../../src/modules/tickets/repository';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(120_000);

const ticket = (over: Partial<TicketDoc> = {}): TicketDoc => ({
  _id: new ObjectId(),
  humanId: 'HR-0001',
  conversationId: new ObjectId(),
  requesterId: new ObjectId(),
  requesterSnapshot: {
    name: 'Priya Shah',
    email: 'priya.shah@example.com',
    country: 'US',
    employmentType: 'full_time',
    department: 'Engineering',
  },
  domain: 'HR',
  category: 'leave',
  subcategory: null,
  queue: 'hr_general',
  priority: 'low',
  aiUrgency: 'low',
  priorityFloorApplied: null,
  status: 'new',
  summary: 'Question about leave',
  agentBrief: 'brief',
  fields: { leave_type: 'annual' },
  aiFilledFields: ['leave_type'],
  articlesShown: [],
  restricted: false,
  duplicateOf: null,
  isEval: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  resolvedAt: null,
  ...over,
});

(mongoUri ? describe : describe.skip)('tickets repository (integration)', () => {
  let database: Database;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
      appName: 'tickets-test',
    });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
  });
  afterAll(async () => {
    await database?.db.dropDatabase();
    await database?.client.close();
  });

  it('issues human IDs per domain atomically', async () => {
    const repo = mongoTicketsRepository(getCollections(database.db));
    const ids = await Promise.all([1, 2, 3].map(() => repo.nextHumanId('IT')));
    expect(ids.sort()).toEqual(['IT-0001', 'IT-0002', 'IT-0003']);
    expect(await repo.nextHumanId('HR')).toBe('HR-0001');
  });

  it('one ticket per conversation (unique index), schema validated, duplicate lookup', async () => {
    const repo = mongoTicketsRepository(getCollections(database.db));
    const first = ticket();
    await repo.insert(first);
    await expect(
      repo.insert(ticket({ humanId: 'HR-0002', conversationId: first.conversationId })),
    ).rejects.toThrow(/duplicate key/i);
    await expect(repo.insert(ticket({ humanId: 'HR-0003', restricted: true }))).rejects.toThrow(
      'restricted tickets must be in hr_case',
    );

    expect((await repo.findByConversation(first.conversationId))?._id.equals(first._id)).toBe(true);
    const recent = await repo.findRecentByRequester(
      first.requesterId,
      'leave',
      new Date(Date.now() - 60_000),
    );
    expect(recent.map((t) => t.humanId)).toEqual(['HR-0001']);
    expect(await repo.findRecentByRequester(first.requesterId, 'payroll', new Date(0))).toEqual([]);
  });
});

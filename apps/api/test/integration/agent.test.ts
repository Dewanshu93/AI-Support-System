// Agent ticket queries against a real MongoDB (skipped unless MONGODB_TEST_URI is
// set): severity sort with cursor paging, the stale-update guard and the
// override rate on fixtures (W3-05 DoD). Throwaway database, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  connectDatabase,
  type Database,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import type { TicketDoc, TicketEventDoc } from '../../src/db/schemas';
import { mongoAgentTicketsRepository } from '../../src/modules/agent/repository';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(120_000);

const T0 = new Date('2026-10-01T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const ticket = (n: number, over: Partial<TicketDoc> = {}): TicketDoc => ({
  _id: new ObjectId(),
  humanId: `IT-${String(n).padStart(4, '0')}`,
  conversationId: new ObjectId(),
  requesterId: new ObjectId(),
  requesterSnapshot: {
    name: 'Priya Shah',
    email: 'priya.shah@example.com',
    country: 'US',
    employmentType: 'full_time',
    department: 'Engineering',
  },
  domain: 'IT',
  category: 'hardware',
  subcategory: null,
  queue: 'it_hardware',
  priority: 'medium',
  aiUrgency: 'medium',
  priorityFloorApplied: null,
  status: 'new',
  summary: `Ticket ${n}`,
  agentBrief: '',
  agentAssist: null,
  fields: {},
  aiFilledFields: [],
  articlesShown: [],
  restricted: false,
  duplicateOf: null,
  isEval: false,
  createdAt: at(n),
  updatedAt: at(n),
  resolvedAt: null,
  ...over,
});

const correction = (t: TicketDoc, field: 'category' | 'priority'): TicketEventDoc => ({
  _id: new ObjectId(),
  ticketId: t._id,
  actorId: new ObjectId(),
  type: 'classification_correction',
  visibility: 'internal',
  body: null,
  field,
  oldValue: 'a',
  newValue: 'b',
  createdAt: at(100),
});

(mongoUri ? describe : describe.skip)('agent tickets repository (integration)', () => {
  let database: Database;
  const t1 = ticket(1, { priority: 'low' });
  const t2 = ticket(2, { priority: 'critical' });
  const t3 = ticket(3, { priority: 'high' });
  const t4 = ticket(4, { priority: 'high', queue: 'it_access', category: 'access' });
  const t5 = ticket(5, { priority: 'medium' });
  const evalTicket = ticket(6, { priority: 'critical', isEval: true });

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
      appName: 'agent-test',
    });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
    const { tickets, ticketEvents } = getCollections(database.db);
    await tickets.insertMany([t1, t2, t3, t4, t5, evalTicket]);
    // t3 corrected twice (counts once), t5 once, the eval ticket once (excluded).
    await ticketEvents.insertMany([
      correction(t3, 'category'),
      correction(t3, 'priority'),
      correction(t5, 'priority'),
      correction(evalTicket, 'priority'),
      { ...correction(t1, 'priority'), type: 'status_change', field: null },
    ]);
  });
  afterAll(async () => {
    await database?.db.dropDatabase();
    await database?.client.close();
  });

  it('sorts by severity (not alphabetically), then oldest first, with cursor paging', async () => {
    const repo = mongoAgentTicketsRepository(getCollections(database.db));
    const ids = (page: { items: TicketDoc[] }) => page.items.map((t) => t.humanId);
    const all = await repo.listQueue({ queues: null, limit: 10 });
    expect(ids(all)).toEqual(['IT-0002', 'IT-0003', 'IT-0004', 'IT-0005', 'IT-0001']);
    expect(all.nextCursor).toBeNull();

    const pages: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repo.listQueue({ queues: null, limit: 2, cursor });
      pages.push(...ids(page));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(pages).toEqual(ids(all));

    expect(
      ids(await repo.listQueue({ queues: ['it_hardware'], priority: 'high', limit: 10 })),
    ).toEqual(['IT-0003']);
  });

  it('refuses a stale update', async () => {
    const repo = mongoAgentTicketsRepository(getCollections(database.db));
    const next = { ...t1, status: 'in_progress' as const, updatedAt: at(200) };
    expect(await repo.update(next, at(999))).toBe(false);
    expect(await repo.update(next, t1.updatedAt)).toBe(true);
    expect(await repo.update(next, t1.updatedAt)).toBe(false);
  });

  it('override rate on fixtures: 2 of 5 created tickets were corrected', async () => {
    const repo = mongoAgentTicketsRepository(getCollections(database.db));
    expect(await repo.overrideRate()).toEqual({ created: 5, overridden: 2, rate: 0.4 });
    // Tickets created from minute 4 on: t4 (none) and t5 (corrected).
    expect(await repo.overrideRate({ from: at(4) })).toEqual({
      created: 2,
      overridden: 1,
      rate: 0.5,
    });
    expect(await repo.overrideRate({ from: at(50) })).toEqual({
      created: 0,
      overridden: 0,
      rate: 0,
    });
  });
});

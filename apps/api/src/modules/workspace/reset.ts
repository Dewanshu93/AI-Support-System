// Demo reset (W4-08, `npm run reset`): restores the demo state in one pass —
// demo users, the mock HR data and seeded requests (as `npm run seed`), clears
// what demo runs left behind, and writes the historic data (seed/historic) that
// fills the admin dashboards. Idempotent: running it twice gives the same result.
import type { IsoDate } from '@sd/shared';
import type { ObjectId } from 'mongodb';
import { CHECKPOINT_COLLECTIONS } from '../../ai/graph/checkpointer';
import type { ConfigFiles } from '../../config/schemas';
import { type Collections, getCollections } from '../../db/collections';
import type { Database } from '../../db';
import type { SeedUser } from '../users/seed';
import { seedUsers } from '../users/seed';
import {
  applyHistoric,
  buildHistoric,
  clearDemoRuns,
  type HistoricCatalog,
  loadHistoricCatalog,
} from './historic';
import { buildMockHrData, buildMockRequests, seedMockHr } from './seed';

export interface ResetResult {
  cleared: { conversations: number; tickets: number };
  historic: Record<string, number>;
  mockHr: Record<string, number>;
  ms: number;
}

export async function resetDemo(
  database: Database,
  options: {
    today: IsoDate;
    seed: SeedUser[];
    config: Pick<ConfigFiles, 'routing' | 'workday'>;
    catalog?: HistoricCatalog;
  },
): Promise<ResetResult> {
  const started = Date.now();
  const c: Collections = getCollections(database.db);
  await seedUsers(c.users, options.seed);

  const stored = await c.users.find({ isDemo: true }).toArray();
  const byEmail = (email: string) => {
    const u = stored.find((x) => x.email === email);
    if (!u) throw new Error(`seed user ${email} is missing`);
    return u;
  };
  const data = buildMockHrData({
    users: stored,
    today: options.today,
    workday: options.config.workday,
  });
  const requests = buildMockRequests({
    users: stored,
    today: options.today,
    routing: options.config.routing,
  });
  const employeeIds = stored.filter((u) => u.role === 'employee').map((u) => u._id);

  // Real chunk ids per document, so historic traces resolve in the trace viewer.
  const chunksBySlug = new Map<string, ObjectId[]>();
  for (const ch of await c.chunks
    .find({ status: 'active' }, { projection: { _id: 1, docSlug: 1, ordinal: 1 } })
    .sort({ docSlug: 1, ordinal: 1 })
    .toArray()) {
    chunksBySlug.set(ch.docSlug, [...(chunksBySlug.get(ch.docSlug) ?? []), ch._id]);
  }
  const historic = buildHistoric({
    catalog: options.catalog ?? loadHistoricCatalog(),
    today: options.today,
    routing: options.config.routing,
    agents: { it: byEmail('sam.patel@example.com'), hr: byEmail('hana.kim@example.com') },
    chunksBySlug,
  });

  const cleared = await clearDemoRuns(
    {
      ...c,
      checkpoints: database.db.collection(CHECKPOINT_COLLECTIONS.checkpoints),
      checkpointWrites: database.db.collection(CHECKPOINT_COLLECTIONS.writes),
    },
    {
      conversationIds: [...requests.conversations, ...historic.conversations].map((x) => x._id),
      ticketIds: [...requests.tickets, ...historic.tickets].map((x) => x._id),
      ticketEventIds: [...requests.ticketEvents, ...historic.ticketEvents].map((x) => x._id),
    },
  );
  const mockHr = await seedMockHr(c, data, requests, employeeIds);
  const written = await applyHistoric(c, historic);
  return { cleared, historic: written, mockHr, ms: Date.now() - started };
}

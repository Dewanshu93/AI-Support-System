// npm run seed — upserts the demo users from seed/users.json, then restores the
// mock HR data (projects, tasks, timesheets, attendance, payslips,
// notifications, demo requests; UC-01). Idempotent.
//
//   npm run seed                      # "today" = DEMO_TODAY or the system date
//   npm run seed -- --today 2026-10-07
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase, getCollections } from '../apps/api/src/db';
import { isoDate } from '../apps/api/src/domain/workday';
import { findSeedProblems, loadSeedUsers, seedUsers } from '../apps/api/src/modules/users/seed';
import {
  buildMockHrData,
  buildMockRequests,
  seedMockHr,
} from '../apps/api/src/modules/workspace/seed';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  loadDotEnv();
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error:\n${err.message}`);
      return 1;
    }
    throw err;
  }

  const today = argValue('--today') ?? config.env.DEMO_TODAY ?? isoDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    console.error(`--today must be YYYY-MM-DD, got "${today}"`);
    return 1;
  }

  const users = loadSeedUsers();
  const problems = findSeedProblems(users, config.routing);
  if (problems.length > 0) {
    console.error(
      `seed/users.json is inconsistent:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    return 1;
  }

  let database;
  try {
    database = await connectDatabase(config.env.MONGODB_URI, { appName: 'seed' });
  } catch (err) {
    console.error(
      `Cannot connect to MongoDB (check MONGODB_URI and that the database is running): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
  try {
    const collections = getCollections(database.db);
    const result = await seedUsers(collections.users, users);
    console.log(
      `Users on "${database.db.databaseName}": ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged.`,
    );

    const stored = await collections.users.find({ isDemo: true }).toArray();
    const data = buildMockHrData({ users: stored, today, workday: config.workday });
    const requests = buildMockRequests({ users: stored, today, routing: config.routing });
    const employeeIds = stored.filter((u) => u.role === 'employee').map((u) => u._id);
    const counts = await seedMockHr(collections, data, requests, employeeIds);
    console.log(
      `Mock HR data for ${today}: ${Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}.`,
    );
    const s = data.scenario;
    console.log(
      `Demo scenario: ${s.lopUser} has Loss of Pay $${s.lopAmount.toFixed(2)} for ${s.lopDay}` +
        (s.missingThisWeek ? `; timesheet missing on ${s.missingThisWeek}.` : '.'),
    );
    return 0;
  } finally {
    await database.client.close();
  }
}

// exitCode, not process.exit(): see scripts/create-indexes.ts.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);

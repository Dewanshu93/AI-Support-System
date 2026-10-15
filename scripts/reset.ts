// npm run reset — restores the demo state (W4-08): demo users, mock HR data and
// seeded requests, clears what demo runs left behind (conversations, tickets,
// traces, feedback), and writes ~120 synthetic historic conversations with tickets,
// traces, feedback and a knowledge-gap snapshot so the admin pages look alive.
// Idempotent. Evaluation runs and the audit log are kept.
//
//   npm run reset                     # "today" = DEMO_TODAY or the system date
//   npm run reset -- --today 2026-10-15
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase } from '../apps/api/src/db';
import { isoDate } from '../apps/api/src/domain/workday';
import { findSeedProblems, loadSeedUsers } from '../apps/api/src/modules/users/seed';
import { resetDemo } from '../apps/api/src/modules/workspace/reset';

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
  const seed = loadSeedUsers();
  const problems = findSeedProblems(seed, config.routing);
  if (problems.length > 0) {
    console.error(
      `seed/users.json is inconsistent:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    return 1;
  }

  let database;
  try {
    database = await connectDatabase(config.env.MONGODB_URI, { appName: 'reset' });
  } catch (err) {
    console.error(
      `Cannot connect to MongoDB (check MONGODB_URI and that the database is running): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
  try {
    const r = await resetDemo(database, { today, seed, config });
    const list = (counts: Record<string, number>) =>
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
    console.log(`Demo reset on "${database.db.databaseName}" for ${today}:`);
    console.log(
      `  cleared demo runs: ${r.cleared.conversations} conversations, ${r.cleared.tickets} tickets`,
    );
    console.log(`  mock HR data: ${list(r.mockHr)}`);
    console.log(`  historic (synthetic): ${list(r.historic)}`);
    console.log(`Done in ${(r.ms / 1000).toFixed(1)} s.`);
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

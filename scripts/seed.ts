// npm run seed — upserts the demo users from seed/users.json (idempotent).
// Historic conversations, tickets and traces are added in W4-08.
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase, getCollections } from '../apps/api/src/db';
import { findSeedProblems, loadSeedUsers, seedUsers } from '../apps/api/src/modules/users/seed';

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
    const result = await seedUsers(getCollections(database.db).users, users);
    console.log(
      `Users on "${database.db.databaseName}": ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged.`,
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

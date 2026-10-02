// npm run db:indexes — creates every collection, regular index and Atlas
// search index (playbook section 3), then waits until the search indexes are
// queryable. Safe to run repeatedly.
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase, ensureAllIndexes } from '../apps/api/src/db';

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

  let database;
  try {
    database = await connectDatabase(config.env.MONGODB_URI, { appName: 'db-indexes' });
  } catch (err) {
    console.error(
      `Cannot connect to MongoDB (check MONGODB_URI and that the database is running): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
  const { client, db } = database;
  try {
    console.log(`Ensuring indexes on database "${db.databaseName}"…`);
    const result = await ensureAllIndexes(db, {
      embeddingDimension: config.models.embeddings.dimension,
    });
    const report = (label: string, items: string[]) =>
      console.log(`${label}: ${items.length === 0 ? 'none (already present)' : items.join(', ')}`);
    report('Collections created', result.collectionsCreated);
    report('Indexes created', result.indexesCreated);
    report('Search indexes created', result.searchIndexesCreated);
    console.log('Search indexes are queryable. Done.');
    return 0;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);

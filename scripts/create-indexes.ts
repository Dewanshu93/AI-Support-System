// npm run db:indexes — creates every MongoDB collection and index (playbook
// section 3) and the Qdrant chunks collection with its payload indexes
// (ADR-004). Safe to run repeatedly.
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import { connectDatabase, createQdrantClient, ensureAllIndexes } from '../apps/api/src/db';

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
    const qdrant = createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY);
    const result = await ensureAllIndexes(db, qdrant, {
      embeddingDimension: config.models.embeddings.dimension,
    });
    const report = (label: string, items: string[]) =>
      console.log(`${label}: ${items.length === 0 ? 'none (already present)' : items.join(', ')}`);
    report('Collections created', result.collectionsCreated);
    report('Indexes created', result.indexesCreated);
    report('Qdrant collection created', result.qdrantCollectionCreated ? ['chunks'] : []);
    report('Qdrant payload indexes created', result.qdrantPayloadIndexesCreated);
    console.log('Done.');
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

// npm run ingest — indexes corpus/ into MongoDB (chunks) and Qdrant (vectors).
// Re-running skips unchanged documents. Run `npm run db:indexes` first.
import { ConfigError, loadConfig, loadDotEnv } from '../apps/api/src/config';
import {
  connectDatabase,
  createQdrantClient,
  ensureChunkCollection,
  getCollections,
} from '../apps/api/src/db';
import { createChunkEmbedder } from '../apps/api/src/ai/ingestion/embedder';
import { ingestSources } from '../apps/api/src/ai/ingestion/indexer';
import { loadCorpusSources } from '../apps/api/src/ai/ingestion/loaders';
import { createEmbeddings } from '../apps/api/src/ai/llm';
import { mongoDocumentsRepository } from '../apps/api/src/modules/documents/repository';
import { createDocumentsService } from '../apps/api/src/modules/documents/service';
import { qdrantChunkStore } from '../apps/api/src/modules/documents/vectorStore';

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

  const sources = loadCorpusSources();
  const { model, dimension } = config.models.embeddings;
  const embedder = createChunkEmbedder(createEmbeddings(config.models, config.env, 'document'), {
    model,
    dimension,
    // Bulk job: more retries than interactive calls, so free-tier rate limits are waited out.
    policy: { ...config.models.call, maxRetries: 5 },
  });

  const { client, db } = await connectDatabase(config.env.MONGODB_URI, { appName: 'ingest' });
  try {
    const qdrant = createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY);
    await ensureChunkCollection(qdrant, dimension);
    const documents = createDocumentsService({
      repo: mongoDocumentsRepository(getCollections(db)),
      vectors: qdrantChunkStore(qdrant),
    });

    const started = Date.now();
    console.log(
      `Ingesting ${sources.length} documents into "${db.databaseName}" (${model}, ${dimension} dims)…`,
    );
    const result = await ingestSources(sources, {
      documents,
      embedder,
      log: (l) => console.log(`  ${l}`),
    });
    const s = result.stats;
    console.log(
      [
        '',
        `Indexed ${result.indexed.length}, unchanged ${result.skipped.length}, failed ${result.failed.length}; superseded versions synced: ${result.superseded.join(', ') || 'none'}`,
        `Chunks: ${s.chunks} across ${s.documents} documents; tokens per chunk mean ${s.meanTokens} (min ${s.minTokens}, max ${s.maxTokens})`,
        `Took ${((Date.now() - started) / 1000).toFixed(1)} s`,
      ].join('\n'),
    );
    for (const f of result.failed) console.error(`  ✗ ${f.document}: ${f.error}`);
    return result.failed.length === 0 ? 0 : 1;
  } finally {
    await client.close();
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

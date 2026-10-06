import { APP_NAME } from '@sd/shared';
import { createApp } from './app';
import { type AppConfig, ConfigError, initConfig, loadDotEnv } from './config';
import {
  connectDatabase,
  createQdrantClient,
  getCollections,
  pingDatabase,
  pingQdrant,
} from './db';
import { createMongoCheckpointer } from './ai/graph/checkpointer';
import { buildTurnGraph } from './ai/graph/runtime';
import { createChatModel, createEmbeddings, embedQuery } from './ai/llm';
import { llmConfigured } from './ai/llm/keys';
import { retrieve } from './ai/retrieval/retrieve';
import { mongoConversationsRepository } from './modules/conversations/repository';
import { mongoDocumentsRepository, mongoSourcesReader } from './modules/documents/repository';
import { loadPromptRegistry, PromptError, type PromptRegistry } from './ai/prompts/registry';
import { logger } from './lib/logger';
import { mongoAuditRepository } from './modules/audit/repository';
import { mongoUsersRepository } from './modules/users/repository';

function startupConfig(): { config: AppConfig; prompts: PromptRegistry } {
  loadDotEnv();
  try {
    const config = initConfig();
    return { config, prompts: loadPromptRegistry(config.prompts.active) };
  } catch (err) {
    if (err instanceof ConfigError || err instanceof PromptError) {
      // Plain stderr, not JSON: this message is read by a person fixing their setup.
      console.error(`\nStartup aborted: configuration error\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const { config, prompts } = startupConfig();
  logger.level = config.env.LOG_LEVEL;
  logger.info({ prompts: Object.values(prompts.active()).map((p) => p.ref) }, 'prompts loaded');

  let database;
  try {
    database = await connectDatabase(config.env.MONGODB_URI);
  } catch (err) {
    logger.fatal(
      { err },
      'cannot connect to MongoDB; check MONGODB_URI and that the database is running',
    );
    process.exit(1);
  }
  const { client, db } = database;
  logger.info({ db: db.databaseName }, 'connected to MongoDB');

  // Qdrant is not required to boot: retrieval fails per request and health reports it.
  const qdrant = createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY);
  if (!(await pingQdrant(qdrant))) {
    logger.warn(
      { url: config.env.QDRANT_URL },
      'Qdrant is not reachable; vector search unavailable',
    );
  }

  const collections = getCollections(db);
  const users = mongoUsersRepository(collections.users);
  const conversations = mongoConversationsRepository(collections);
  const documents = mongoDocumentsRepository(collections);

  // Graph checkpoints (ADR-007): thread_id = conversation ID.
  const checkpointer = createMongoCheckpointer(client, db.databaseName);
  const indexErrors = await checkpointer.setup();
  if (indexErrors.length > 0) logger.warn({ errors: indexErrors }, 'checkpoint index setup failed');

  // Created on first use, so the API boots without a Gemini key (turns then fail with an error event).
  let queryEmbeddings: ReturnType<typeof createEmbeddings> | undefined;
  const graph = buildTurnGraph({
    config,
    prompts,
    chatFor: (tier, options) =>
      createChatModel(config.models, config.env, tier, undefined, options),
    users,
    conversations,
    checkpointer,
    retrieve: (input) =>
      retrieve(input, {
        qdrant,
        embedQuery: (text) => {
          queryEmbeddings ??= createEmbeddings(config.models, config.env, 'query');
          return embedQuery(queryEmbeddings, text, {
            policy: config.models.call,
            dimension: config.models.embeddings.dimension,
          });
        },
        loadChunks: (ids) => documents.findChunksByIds(ids),
        params: config.thresholds.retrieval,
        onViolation: (v) => logger.error({ violation: v }, 'ACCESS_FILTER_VIOLATION'),
      }),
  });

  const app = createApp({
    users,
    audit: mongoAuditRepository(collections.auditLog),
    conversations,
    sources: mongoSourcesReader(collections),
    chat: { graph },
    templates: config.templates.templates,
    auth: {
      jwtSecret: config.env.JWT_SECRET,
      demoPassword: config.env.DEMO_PASSWORD,
      secureCookies: config.env.NODE_ENV === 'production',
    },
    llmConfigured: llmConfigured(config.models, config.env),
    pingDb: () => pingDatabase(db),
    pingVectorStore: () => pingQdrant(qdrant),
  });
  const server = app.listen(config.env.API_PORT, () => {
    logger.info(
      { port: config.env.API_PORT, nodeEnv: config.env.NODE_ENV },
      `${APP_NAME} api listening`,
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => void client.close().finally(() => process.exit(0)));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

void main();

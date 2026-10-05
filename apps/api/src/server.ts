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
import { llmConfigured } from './ai/llm/keys';
import { logger } from './lib/logger';
import { mongoAuditRepository } from './modules/audit/repository';
import { mongoUsersRepository } from './modules/users/repository';

function startupConfig(): AppConfig {
  loadDotEnv();
  try {
    return initConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // Plain stderr, not JSON: this message is read by a person fixing their setup.
      console.error(`\nStartup aborted: configuration error\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const config = startupConfig();
  logger.level = config.env.LOG_LEVEL;

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
  const app = createApp({
    users: mongoUsersRepository(collections.users),
    audit: mongoAuditRepository(collections.auditLog),
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

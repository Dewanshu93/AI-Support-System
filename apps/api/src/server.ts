import path from 'node:path';
import { APP_NAME } from '@sd/shared';
import { createApp } from './app';
import { type AppConfig, ConfigError, initConfig, loadDotEnv, REPO_ROOT } from './config';
import {
  connectDatabase,
  createQdrantClient,
  getCollections,
  pingDatabase,
  pingQdrant,
} from './db';
import { createMongoCheckpointer } from './ai/graph/checkpointer';
import { buildTurnGraph, type TurnGraphDeps } from './ai/graph/runtime';
import {
  createChatModel,
  createEmbeddings,
  createFallbackChatModel,
  createLocalChatModel,
  currentModelMode,
  embedQuery,
  fallbackChain,
  ProviderHealth,
  resolveChatModel,
} from './ai/llm';
import { guardUnhandledRejections } from './ai/llm/orphanedStream';
import { createDraftReply } from './ai/nodes/draftReply';
import { LlmRecordings, recordedChatHandle, recordedEmbedQuery } from './ai/llm/recording';
import { llmConfigured } from './ai/llm/keys';
import { retrieve } from './ai/retrieval/retrieve';
import { mongoConversationsRepository } from './modules/conversations/repository';
import { mongoDocumentsRepository, mongoSourcesReader } from './modules/documents/repository';
import { mongoEmailRepository } from './modules/email/repository';
import { createEmailService } from './modules/email/service';
import { createEmailTransport, type EmailTransport } from './modules/email/transport';
import { mongoAgentTicketsRepository } from './modules/agent/repository';
import { mongoMetricsRepository } from './modules/metrics/repository';
import { mongoTicketsRepository } from './modules/tickets/repository';
import { loadPromptRegistry, PromptError, type PromptRegistry } from './ai/prompts/registry';
import { logger } from './lib/logger';
import { mongoAuditRepository } from './modules/audit/repository';
import { mongoUsersRepository } from './modules/users/repository';
import { createWorkspaceRecords } from './modules/workspace/records';
import { mongoWorkspaceRepository } from './modules/workspace/repository';
import { createWorkspaceService } from './modules/workspace/service';

/**
 * DEMO_TODAY (YYYY-MM-DD) pins "today" for timesheets and the dashboard, so a
 * rehearsed demo shows the same week; the time of day still advances.
 */
function demoClock(demoToday: string | undefined): (() => Date) | undefined {
  if (!demoToday) return undefined;
  return () => new Date(`${demoToday}T${new Date().toISOString().slice(11)}`);
}

function startupConfig(): {
  config: AppConfig;
  prompts: PromptRegistry;
  emailTransport: EmailTransport;
} {
  loadDotEnv();
  try {
    const config = initConfig();
    return {
      config,
      prompts: loadPromptRegistry(config.prompts.active),
      // EMAIL_DELIVERY=smtp stops here until a mail dependency is approved (ADR-017).
      emailTransport: createEmailTransport(config.env.EMAIL_DELIVERY),
    };
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
  const { config, prompts, emailTransport } = startupConfig();
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
  const tickets = mongoTicketsRepository(collections);
  const workspace = mongoWorkspaceRepository(collections);
  const email = createEmailService({
    repository: mongoEmailRepository(collections),
    transport: emailTransport,
  });
  const clock = demoClock(config.env.DEMO_TODAY);
  // The copilot agents read the same records as the workspace endpoints.
  const records = createWorkspaceRecords({
    service: createWorkspaceService({
      workspace,
      tickets,
      workday: config.workday,
      routing: config.routing,
      clock: clock ?? (() => new Date()),
    }),
    tickets,
    routing: config.routing,
  });

  // Graph checkpoints (ADR-007): thread_id = conversation ID.
  const checkpointer = createMongoCheckpointer(client, db.databaseName);
  const indexErrors = await checkpointer.setup();
  if (indexErrors.length > 0) logger.warn({ errors: indexErrors }, 'checkpoint index setup failed');

  // Created on first use, so the API boots without a Gemini key (turns then fail with an error event).
  let queryEmbeddings: ReturnType<typeof createEmbeddings> | undefined;
  const liveEmbedQuery = (text: string) => {
    queryEmbeddings ??= createEmbeddings(config.models, config.env, 'query');
    return embedQuery(queryEmbeddings, text, {
      policy: config.models.call,
      dimension: config.models.embeddings.dimension,
    });
  };
  // Per-user model mode (ADR-020): Pro off → the local Ollama model only; Pro on →
  // the paid chain with provider fallback (ADR-018). E2E recording uses one model per
  // mode, so fixtures never hold a fallback's reply.
  const health = new ProviderHealth();
  const liveChat: TurnGraphDeps['chatFor'] = (tier, options) =>
    currentModelMode() === 'local'
      ? createLocalChatModel(config.models, config.env, tier, options)
      : config.env.LLM_MODE === 'record'
        ? createChatModel(config.models, config.env, tier, undefined, options)
        : createFallbackChatModel(config.models, config.env, tier, health, {
            ...options,
            onFallback: ({ from, reason, cooldownMs, next }) =>
              logger.warn(
                { from, reason, cooldownS: Math.round(cooldownMs / 1000), next: next ?? null },
                next ? 'LLM model set aside; using the next one' : 'LLM model set aside; none left',
              ),
          });
  logger.info(
    {
      fast: fallbackChain(config.models, config.env, 'fast').map((r) => r.modelId),
      quality: fallbackChain(config.models, config.env, 'quality').map((r) => r.modelId),
    },
    'LLM fallback chains',
  );

  // End-to-end tests (record/replay) and development (cache): saved LLM replies.
  const mode = config.env.LLM_MODE;
  const recordings =
    mode === 'live'
      ? null
      : new LlmRecordings(
          config.env.LLM_RECORDINGS_FILE ??
            (mode === 'cache'
              ? path.join(REPO_ROOT, '.llm-cache', 'replies.json')
              : path.join(REPO_ROOT, 'e2e', 'fixtures', 'llm-recordings.json')),
        );
  if (recordings)
    logger.warn(
      { mode, recordings: recordings.size },
      mode === 'cache' ? 'LLM_MODE=cache (development only)' : 'LLM_MODE is not live (tests only)',
    );

  // One model factory for the turn graph and the agent draft reply (P-7).
  const chatFor: TurnGraphDeps['chatFor'] =
    mode === 'live'
      ? liveChat
      : (tier, options) =>
          recordedChatHandle(
            mode,
            recordings!,
            () => liveChat(tier, options),
            resolveChatModel(config.models, tier),
          );
  const graph = buildTurnGraph({
    config,
    prompts,
    chatFor,
    // Replay serves recordings made with Pro on (paid models), so it follows the Pro
    // path whatever the user's setting: the same prompts, hence the same recordings.
    localMode: () => mode !== 'replay' && currentModelMode() === 'local',
    users,
    conversations,
    tickets,
    records,
    email,
    checkpointer,
    retrieve: (input) =>
      retrieve(input, {
        qdrant,
        embedQuery:
          mode === 'live' ? liveEmbedQuery : recordedEmbedQuery(mode, recordings!, liveEmbedQuery),
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
    tickets,
    email,
    agentTickets: mongoAgentTicketsRepository(collections),
    agentDraft: createDraftReply({
      prompts,
      chatFor,
      policy: config.models.call,
      costs: config.models.costs,
    }),
    ticketConfig: {
      routing: config.routing,
      taxonomy: config.taxonomy,
      ticketSchemas: config.ticketSchemas.schemas,
      duplicateWindowDays: config.thresholds.ticket.duplicateWindowDays,
    },
    workspace,
    metrics: mongoMetricsRepository(collections),
    workday: config.workday,
    clock,
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

// One broken LLM stream must not stop the API for everyone (see orphanedStream.ts).
guardUnhandledRejections(logger);
void main();

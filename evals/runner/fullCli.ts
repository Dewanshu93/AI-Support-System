// npm run eval -- --suite full [--case …] [--tag …] [--prompt name=N]: wiring for
// the full-graph suite (W2-10, UC-09). Builds the runtime graph with the configured
// providers, real retrieval and storage, the employees' records (read-only: the
// eval never confirms, and a timesheet save is refused), an in-memory checkpointer
// and isEval persistence.
import fs from 'node:fs';
import path from 'node:path';
import { MemorySaver } from '@langchain/langgraph';
import { ObjectId } from 'mongodb';
import { buildTurnGraph } from '../../apps/api/src/ai/graph/runtime';
import { createChatModel, createEmbeddings, embedQuery } from '../../apps/api/src/ai/llm';
import { loadPromptRegistry } from '../../apps/api/src/ai/prompts/registry';
import { retrieve } from '../../apps/api/src/ai/retrieval/retrieve';
import { type AppConfig, REPO_ROOT } from '../../apps/api/src/config';
import { connectDatabase, createQdrantClient, getCollections } from '../../apps/api/src/db';
import type { EvalResultDoc } from '../../apps/api/src/db/schemas';
import { mongoConversationsRepository } from '../../apps/api/src/modules/conversations/repository';
import { mongoDocumentsRepository } from '../../apps/api/src/modules/documents/repository';
import { mongoTicketsRepository } from '../../apps/api/src/modules/tickets/repository';
import { mongoUsersRepository } from '../../apps/api/src/modules/users/repository';
import { createWorkspaceRecords } from '../../apps/api/src/modules/workspace/records';
import { mongoWorkspaceRepository } from '../../apps/api/src/modules/workspace/repository';
import { createWorkspaceService } from '../../apps/api/src/modules/workspace/service';
import { fullReport } from './fullReport';
import { fullSummary, scoreFullCase } from './fullScorers';
import { runFullSuite } from './fullSuite';
import type { GoldenCase } from './schema';
import { DATASET_VERSION } from './schema';
import type { RefMatcher } from './scorers';
import { evalStore } from './store';

/** Thrown by the eval's records if anything tries to save a timesheet. */
export const EVAL_WRITE_REFUSED = 'eval runs never save timesheets';

/** Same "today" as the API (DEMO_TODAY), so relative dates resolve as in the demo. */
const clockFor = (demoToday: string | undefined) =>
  demoToday ? () => new Date(`${demoToday}T${new Date().toISOString().slice(11)}`) : undefined;

export async function runFullCli(
  config: AppConfig,
  cases: GoldenCase[],
  options: {
    refMatcher: RefMatcher;
    gitCommit: string;
    reportsDir: string;
    /** Prompt versions to evaluate instead of the active ones (e.g. turn_analysis 2). */
    promptOverrides?: Record<string, number>;
  },
): Promise<number> {
  const { client, db } = await connectDatabase(config.env.MONGODB_URI, { appName: 'eval-full' });
  const collections = getCollections(db);
  const store = evalStore(collections);
  const conversations = mongoConversationsRepository(collections);
  const documents = mongoDocumentsRepository(collections);
  const tickets = mongoTicketsRepository(collections);
  const users = await collections.users.find({}).toArray();
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const qdrant = createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY);
  const embeddings = createEmbeddings(config.models, config.env, 'query');
  const provider = config.models.chat.provider;
  const chatModels = `${provider}: ${Object.values(config.models.chat.models[provider]).join(', ')}`;
  const promptVersions = { ...config.prompts.active, ...options.promptOverrides };

  const records = createWorkspaceRecords({
    service: createWorkspaceService({
      workspace: mongoWorkspaceRepository(collections),
      tickets,
      workday: config.workday,
      routing: config.routing,
      clock: clockFor(config.env.DEMO_TODAY) ?? (() => new Date()),
    }),
    tickets,
    routing: config.routing,
  });

  const graph = buildTurnGraph({
    config,
    prompts: loadPromptRegistry(promptVersions),
    chatFor: (tier, o) => createChatModel(config.models, config.env, tier, undefined, o),
    users: mongoUsersRepository(collections.users),
    conversations,
    tickets,
    records: {
      ...records,
      saveTimesheet: () => Promise.reject(new Error(EVAL_WRITE_REFUSED)),
    },
    checkpointer: new MemorySaver(),
    isEval: true,
    retrieve: (input) =>
      retrieve(input, {
        qdrant,
        embedQuery: (text) =>
          embedQuery(embeddings, text, {
            policy: { ...config.models.call, maxRetries: 5 },
            dimension: config.models.embeddings.dimension,
          }),
        loadChunks: (ids) => documents.findChunksByIds(ids),
        params: config.thresholds.retrieval,
        onViolation: (v) => console.error(`  ACCESS_FILTER_VIOLATION ${JSON.stringify(v)}`),
      }),
  });

  const startedAt = new Date();
  const run = await store.createRun({
    suite: 'full',
    datasetVersion: DATASET_VERSION,
    configSnapshot: {
      thresholds: config.thresholds as unknown as Record<string, unknown>,
      promptVersions: promptVersions as Record<string, number>,
      models: config.models as unknown as Record<string, unknown>,
      gitCommit: options.gitCommit,
    },
    caseCount: cases.length,
    metrics: {},
    perCategory: {},
    targets: {},
    costUsd: 0,
    triggeredBy: 'cli',
    startedAt,
  });

  try {
    console.log(`Full eval ${run._id.toHexString()}: ${cases.length} cases, ${chatModels}…`);
    const outcomes = await runFullSuite(cases, {
      graph,
      conversations,
      userFor: (email) => byEmail.get(email),
      concurrency: 4,
      log: (line) => console.log(`  ${line}`),
    });
    const scores = outcomes.map((o) => scoreFullCase(o, options.refMatcher));
    const summary = fullSummary(outcomes, scores);
    const durationMs = Date.now() - startedAt.getTime();

    const results: EvalResultDoc[] = outcomes.map((o, i) => {
      const s = scores[i]!;
      return {
        _id: new ObjectId(),
        runId: run._id,
        caseId: o.caseId,
        category: o.category,
        tags: o.tags,
        expected: o.expected as unknown as Record<string, unknown>,
        actual: {
          decision: o.decision,
          retrievedDocSlugs: o.contextDocs.map((d) => d.slug),
          citedDocSlugs: o.citedDocs.map((d) => d.slug),
          category: null,
          priority: null,
          fields: {},
          answerText: o.answerText,
        },
        scores: {
          decisionCorrect: s.decisionCorrect,
          ...(s.recall !== null && { recall: s.recall }),
          leaked: s.leaked.length,
          keyFactsPresent: s.keyFacts.present.length,
          keyFactsMissing: s.keyFacts.missing.length,
        },
        passed: s.passed,
        failureReasons: s.failureReasons,
        traceRef: {
          reasonCode: o.reasonCode,
          flags: o.flags,
          ttftMs: o.ttftMs,
          workspaceIntent: o.workspaceIntent,
          awaiting: o.awaiting,
          writeNodes: o.writeNodes,
          ...(o.error && { error: o.error }),
        },
        latencyMs: o.latencyMs,
        costUsd: o.costUsd,
      };
    });
    await store.saveResults(results);
    await store.finishRun(run._id, {
      metrics: summary.metrics,
      perCategory: summary.perCategory,
      targets: summary.targets,
      passed: summary.passed,
      costUsd: summary.metrics.costUsd,
      durationMs,
    });

    const reportFile = path.join(
      options.reportsDir,
      `${startedAt.toISOString().slice(0, 10)}-full-${run._id.toHexString().slice(-8)}.md`,
    );
    fs.mkdirSync(options.reportsDir, { recursive: true });
    fs.writeFileSync(
      reportFile,
      fullReport({
        runId: run._id.toHexString(),
        startedAt,
        durationMs,
        datasetVersion: DATASET_VERSION,
        gitCommit: options.gitCommit,
        chatModels,
        summary,
        scores,
        outcomes,
      }),
    );
    const m = summary.metrics;
    console.log(
      `\n  decision ${(m.decisionAccuracy * 100).toFixed(1)}%, intent ${(m.intentAccuracy * 100).toFixed(1)}%, sensitive ${(m.sensitivePassRate * 100).toFixed(1)}%, citation validity ${(m.citationValidity * 100).toFixed(1)}%, leakage ${m.leakageCases}, injection ${(m.injectionPassRate * 100).toFixed(1)}%, unconfirmed writes ${m.unconfirmedWriteCases}, cost $${m.costUsd.toFixed(4)}`,
    );
    console.log(
      `\n${summary.passed ? 'PASS' : 'FAIL'} — report: ${path.relative(REPO_ROOT, reportFile)}`,
    );
    return summary.passed ? 0 : 1;
  } catch (err) {
    await store.failRun(
      run._id,
      err instanceof Error ? err.message : String(err),
      Date.now() - startedAt.getTime(),
    );
    throw err;
  } finally {
    await client.close();
  }
}

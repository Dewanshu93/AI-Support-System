// npm run eval -- --suite retrieval|full [--case HR-ANS-007]… [--tag table]…
// Runs the golden set against the real index, stores eval_runs/eval_results,
// writes a Markdown report to evals/reports/, and exits 1 if the run fails.
import { execSync } from 'node:child_process';
import { ObjectId } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, loadConfig, loadDotEnv, REPO_ROOT } from '../../apps/api/src/config';
import { connectDatabase, createQdrantClient, getCollections } from '../../apps/api/src/db';
import type { EvalResultDoc } from '../../apps/api/src/db/schemas';
import { documentId } from '../../apps/api/src/ai/ingestion/identity';
import { createChatModel, createEmbeddings, embedQuery } from '../../apps/api/src/ai/llm';
import { assessCandidates } from '../../apps/api/src/ai/nodes/rerankAssess';
import { toSourceChunk } from '../../apps/api/src/ai/nodes/retrieve';
import { loadPromptRegistry } from '../../apps/api/src/ai/prompts/registry';
import { retrieve } from '../../apps/api/src/ai/retrieval/retrieve';
import { mongoDocumentsRepository } from '../../apps/api/src/modules/documents/repository';
import { loadSeedUsers } from '../../apps/api/src/modules/users/seed';
import { runFullCli } from './fullCli';
import { validateGolden } from './golden';
import { retrievalReport } from './report';
import { retrievalCases, runRetrievalSuite } from './retrievalSuite';
import { DATASET_VERSION } from './schema';
import { type RefMatcher, RETRIEVAL_MODES, retrievalSummary, scoreCase } from './scorers';
import { evalStore } from './store';

export const REPORTS_DIR = path.join(REPO_ROOT, 'evals', 'reports');

export interface CliArgs {
  suite?: string;
  caseIds: string[];
  tags: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { caseIds: [], tags: [] };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--suite') args.suite = value;
    else if (argv[i] === '--case' && value) args.caseIds.push(value);
    else if (argv[i] === '--tag' && value) args.tags.push(value);
    else continue;
    i++;
  }
  return args;
}

/** `slug` matches any version of that document; `slug@version` matches exactly that version. */
export const refMatcher: RefMatcher = (ref, doc) => {
  const [slug, version] = ref.split('@');
  return version ? doc.documentId === documentId(slug!, version).toHexString() : doc.slug === slug;
};

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.suite !== 'retrieval' && args.suite !== 'full') {
    console.error(
      args.suite
        ? `Suite "${args.suite}" is not available yet (judge: W4-05). Use --suite retrieval or full.`
        : 'Usage: npm run eval -- --suite retrieval|full [--case <id>]… [--tag <tag>]…',
    );
    return 1;
  }

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

  const golden = validateGolden();
  if (golden.problems.length > 0) {
    console.error(
      `Golden set is invalid; run npm run golden:validate (${golden.problems.length} problems)`,
    );
    return 1;
  }
  let cases = args.suite === 'full' ? golden.cases : retrievalCases(golden.cases);
  if (args.caseIds.length > 0) cases = cases.filter((c) => args.caseIds.includes(c.id));
  if (args.tags.length > 0)
    cases = cases.filter((c) => args.tags.some((t) => c.tags.includes(t as never)));
  if (cases.length === 0) {
    console.error('No golden cases match the filters.');
    return 1;
  }

  if (args.suite === 'full') {
    return runFullCli(config, cases, {
      refMatcher,
      gitCommit: gitCommit(),
      reportsDir: REPORTS_DIR,
    });
  }

  const users = new Map(loadSeedUsers().map((u) => [u.email, u]));
  const prompts = loadPromptRegistry(config.prompts.active);
  const rerankDeps = {
    prompts,
    chatFor: (tier: 'fast' | 'quality') => createChatModel(config.models, config.env, tier),
    policy: config.models.call,
    costs: config.models.costs,
    retrieval: config.thresholds.retrieval,
  };
  const rerankModel = rerankDeps.chatFor(prompts.get('rerank_assess').modelTier).modelId;
  const embeddings = createEmbeddings(config.models, config.env, 'query');
  const { client, db } = await connectDatabase(config.env.MONGODB_URI, { appName: 'eval' });
  const collections = getCollections(db);
  const repo = mongoDocumentsRepository(collections);
  const store = evalStore(collections);
  const qdrant = createQdrantClient(config.env.QDRANT_URL, config.env.QDRANT_API_KEY);
  const startedAt = new Date();
  const run = await store.createRun({
    suite: 'retrieval',
    datasetVersion: DATASET_VERSION,
    configSnapshot: {
      thresholds: config.thresholds as unknown as Record<string, unknown>,
      promptVersions: config.prompts.active as Record<string, number>,
      models: config.models as unknown as Record<string, unknown>,
      gitCommit: gitCommit(),
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
    console.log(`Retrieval eval ${run._id.toHexString()}: ${cases.length} cases…`);
    const results = await runRetrievalSuite(cases, {
      profileFor: (email) => {
        const u = users.get(email);
        return (
          u && { country: u.country, employmentType: u.employmentType, accessLevel: u.accessLevel }
        );
      },
      retrieve: (query, profile) =>
        retrieve(
          { query, profile },
          {
            qdrant,
            embedQuery: (text) =>
              embedQuery(embeddings, text, {
                policy: { ...config.models.call, maxRetries: 5 },
                dimension: config.models.embeddings.dimension,
              }),
            loadChunks: (ids) => repo.findChunksByIds(ids),
            params: config.thresholds.retrieval,
            onViolation: (v) => console.error(`  ACCESS_FILTER_VIOLATION ${JSON.stringify(v)}`),
          },
        ),
      loadChunks: (ids) => repo.findChunksByIds(ids),
      rerank: async (query, userEmail, candidates) => {
        const u = users.get(userEmail)!;
        const result = await assessCandidates(rerankDeps, {
          question: query,
          profile: {
            country: u.country,
            employmentType: u.employmentType,
            accessLevel: u.accessLevel,
            department: u.department,
            jobTitle: u.jobTitle,
          },
          candidates: candidates.map(toSourceChunk),
        });
        return {
          chunkIds: result.reranked.map((r) => r.chunkId),
          coverage: result.coverage,
          fallback: result.fallback,
          costUsd: result.llmCalls.reduce((sum, c) => sum + c.costUsd, 0),
        };
      },
      log: (line) => console.log(`  ${line}`),
    });

    const scores = results.map((r) => {
      const s = scoreCase(r.retrieval, refMatcher);
      if (r.error) return { ...s, passed: false, failureReasons: [...s.failureReasons, 'ERROR'] };
      return s;
    });
    const summary = retrievalSummary(scores);
    const errors = results
      .filter((r) => r.error)
      .map((r) => ({ caseId: r.goldenCase.id, error: r.error! }));
    const passed = summary.passed && errors.length === 0;

    const resultDocs: EvalResultDoc[] = results.map((r, i) => {
      const s = scores[i]!;
      const scoreFields: Record<string, number | boolean> = {};
      for (const m of RETRIEVAL_MODES) {
        if (s.modes[m].recall !== null) scoreFields[`${m}.recallAt5`] = s.modes[m].recall!;
        if (s.modes[m].firstHitRank !== null)
          scoreFields[`${m}.firstHitRank`] = s.modes[m].firstHitRank!;
        scoreFields[`${m}.leaked`] = s.modes[m].leaked.length;
      }
      return {
        _id: new ObjectId(),
        runId: run._id,
        caseId: r.goldenCase.id,
        category: r.goldenCase.category,
        tags: r.goldenCase.tags,
        expected: r.goldenCase.expected as unknown as Record<string, unknown>,
        actual: {
          decision: null,
          retrievedDocSlugs: r.retrieval.results.fused.map((d) => d.slug),
          citedDocSlugs: [],
          category: null,
          priority: null,
          fields: {},
          answerText: '',
        },
        scores: scoreFields,
        passed: s.passed,
        failureReasons: s.failureReasons,
        traceRef: {
          vector: r.retrieval.results.vector.map((d) => d.slug),
          keyword: r.retrieval.results.keyword.map((d) => d.slug),
          reranked: r.retrieval.results.reranked.map((d) => d.slug),
          ...(r.rerank && { coverage: r.rerank.coverage, rerankFallback: r.rerank.fallback }),
          ...(r.error && { error: r.error }),
        },
        latencyMs: r.latencyMs,
        costUsd: r.rerank?.costUsd ?? 0,
      };
    });
    await store.saveResults(resultDocs);

    const metrics: Record<string, number> = {};
    for (const m of RETRIEVAL_MODES) {
      for (const [k, v] of Object.entries(summary.byMode[m])) metrics[`${m}.${k}`] = v;
    }
    const perCategory = Object.fromEntries(
      Object.entries(summary.byCategory).map(([cat, modes]) => [
        cat,
        Object.fromEntries(
          RETRIEVAL_MODES.flatMap((m) => [
            [`${m}.recallAt5`, modes[m].recallAt5],
            [`${m}.leakageCases`, modes[m].leakageCases],
          ]),
        ),
      ]),
    );
    const durationMs = Date.now() - startedAt.getTime();
    const costUsd = results.reduce((sum, r) => sum + (r.rerank?.costUsd ?? 0), 0);
    const coverage: Record<string, number> = {};
    for (const r of results)
      if (r.rerank) coverage[r.rerank.coverage] = (coverage[r.rerank.coverage] ?? 0) + 1;
    await store.finishRun(run._id, {
      metrics,
      perCategory,
      targets: summary.targets,
      passed,
      costUsd,
      durationMs,
    });

    const report = retrievalReport({
      runId: run._id.toHexString(),
      startedAt,
      durationMs,
      datasetVersion: DATASET_VERSION,
      gitCommit: run.configSnapshot.gitCommit,
      embeddingModel: config.models.embeddings.model,
      params: config.thresholds.retrieval,
      caseCount: cases.length,
      summary,
      scores,
      errors,
      rerankedSlugs: Object.fromEntries(
        results.map((r) => [r.goldenCase.id, r.retrieval.results.reranked.map((d) => d.slug)]),
      ),
      rerank: {
        model: rerankModel,
        fallbacks: results.filter((r) => r.rerank?.fallback).length,
        coverage,
        costUsd,
      },
      fusedSlugs: Object.fromEntries(
        results.map((r) => [r.goldenCase.id, r.retrieval.results.fused.map((d) => d.slug)]),
      ),
      expected: Object.fromEntries(
        results.map((r) => [
          r.goldenCase.id,
          {
            docs: r.goldenCase.expected.docSlugs,
            forbidden: r.goldenCase.expected.forbiddenDocSlugs,
          },
        ]),
      ),
    });
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const reportFile = path.join(
      REPORTS_DIR,
      `${startedAt.toISOString().slice(0, 10)}-retrieval-${run._id.toHexString().slice(-8)}.md`,
    );
    fs.writeFileSync(reportFile, report);

    console.log('');
    for (const m of RETRIEVAL_MODES) {
      const x = summary.byMode[m];
      console.log(
        `  ${m.padEnd(9)} recall@5 ${(x.recallAt5 * 100).toFixed(1).padStart(5)}% (${x.recallHits}/${x.recallCases}), MRR ${x.mrr.toFixed(3)}, leakage ${x.leakageCases}`,
      );
    }
    console.log(
      `\n${passed ? 'PASS' : 'FAIL'} — report: ${path.relative(REPO_ROOT, reportFile)}${errors.length ? `; ${errors.length} case errors` : ''}`,
    );
    return passed ? 0 : 1;
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

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    },
  );
}

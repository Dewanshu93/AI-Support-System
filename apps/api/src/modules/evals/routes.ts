// Evaluation (W4-05, playbook section 4): admin only.
// POST /api/admin/evals/runs              { suite, tags?, caseIds? } → 202 { runId } (409 if one runs)
// GET  /api/admin/evals/runs              ?suite&limit&cursor
// GET  /api/admin/evals/runs/:id          metrics, per category, targets, config snapshot
// GET  /api/admin/evals/runs/:id/results  ?passed&category&limit&cursor
// UI runs follow the admin's Pro switch (pro = configured models, local = Ollama).
import {
  API_BASE_PATH,
  type EvalResultsQuery,
  EvalResultsQuerySchema,
  type EvalResultsResponse,
  type EvalRunDetailResponse,
  type EvalRunListQuery,
  EvalRunListQuerySchema,
  type EvalRunListResponse,
  EvalRunParamsSchema,
  type EvalRunStartRequest,
  EvalRunStartRequestSchema,
  type EvalRunStartResponse,
  type EvalRunSummary,
} from '@sd/shared';
import type { z } from 'zod';
import type { EvalRunDoc } from '../../db/schemas';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';

type Params = z.infer<typeof EvalRunParamsSchema>;

export function evalsRoutes(deps: Pick<AppDeps, 'evals' | 'users' | 'audit'>): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = `${API_BASE_PATH}/admin/evals/runs`;

  const names = new Map<string, string>();
  const triggeredByName = async (run: EvalRunDoc): Promise<string> => {
    if (run.triggeredBy === 'cli') return 'cli';
    const id = run.triggeredBy.toHexString();
    if (!names.has(id)) names.set(id, (await deps.users.findById(id))?.name ?? 'Unknown user');
    return names.get(id)!;
  };
  const toSummary = async (r: EvalRunDoc): Promise<EvalRunSummary> => ({
    id: r._id.toHexString(),
    suite: r.suite,
    status: r.status,
    passed: r.passed,
    metrics: r.metrics,
    caseCount: r.caseCount,
    completedCases: r.completedCases ?? (r.status === 'completed' ? r.caseCount : 0),
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    costUsd: r.costUsd,
    triggeredBy: await triggeredByName(r),
    modelMode: r.modelMode ?? null,
    filter: r.filter ?? null,
  });
  const mustFind = async (id: string) => {
    const run = await deps.evals.repository.findRun(id);
    if (!run) throw new AppError('NOT_FOUND', 'Eval run not found');
    return run;
  };

  return [
    {
      method: 'post',
      path: base,
      access: ['admin'],
      handlers: [
        validate({ body: EvalRunStartRequestSchema }),
        async (req, res) => {
          const body = req.validated.body as EvalRunStartRequest;
          const run = await deps.evals.service.start(body, {
            id: req.user!.id,
            modelMode: req.user!.proModels ? 'pro' : 'local',
          });
          await audit.record(req, {
            action: 'eval.run',
            targetType: 'eval_run',
            targetId: run._id.toHexString(),
            metadata: { suite: run.suite, modelMode: run.modelMode, ...run.filter },
          });
          const response: EvalRunStartResponse = { runId: run._id.toHexString() };
          res.status(202).json(response);
        },
      ],
    },
    {
      method: 'get',
      path: base,
      access: ['admin'],
      handlers: [
        validate({ query: EvalRunListQuerySchema }),
        async (req, res) => {
          const q = req.validated.query as EvalRunListQuery;
          const page = await deps.evals.repository.listRuns(
            { suite: q.suite },
            { limit: q.limit, cursor: q.cursor },
          );
          const body: EvalRunListResponse = {
            items: await Promise.all(page.items.map(toSummary)),
            nextCursor: page.nextCursor,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:id`,
      access: ['admin'],
      handlers: [
        validate({ params: EvalRunParamsSchema }),
        async (req, res) => {
          const run = await mustFind((req.validated.params as Params).id);
          const body: EvalRunDetailResponse = {
            run: {
              ...(await toSummary(run)),
              datasetVersion: run.datasetVersion,
              perCategory: run.perCategory,
              targets: run.targets,
              configSnapshot: {
                promptVersions: run.configSnapshot.promptVersions,
                gitCommit: run.configSnapshot.gitCommit,
              },
              error: run.error,
            },
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:id/results`,
      access: ['admin'],
      handlers: [
        validate({ params: EvalRunParamsSchema, query: EvalResultsQuerySchema }),
        async (req, res) => {
          const run = await mustFind((req.validated.params as Params).id);
          const q = req.validated.query as EvalResultsQuery;
          const page = await deps.evals.repository.listResults(
            run._id,
            {
              passed: q.passed === undefined ? undefined : q.passed === 'true',
              category: q.category,
            },
            { limit: q.limit, cursor: q.cursor },
          );
          const body: EvalResultsResponse = {
            items: page.items.map((r) => ({
              id: r._id.toHexString(),
              caseId: r.caseId,
              category: r.category,
              tags: r.tags,
              passed: r.passed,
              failureReasons: r.failureReasons,
              expected: r.expected,
              actual: r.actual,
              scores: r.scores,
              traceRef: r.traceRef,
              latencyMs: r.latencyMs,
              costUsd: r.costUsd,
            })),
            nextCursor: page.nextCursor,
          };
          res.json(body);
        },
      ],
    },
  ];
}

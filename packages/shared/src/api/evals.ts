// Evaluation runs (W4-05, playbook sections 4 and 10): an admin starts a golden-set
// run from the UI, watches its progress and inspects failed cases. The same
// runner backs `npm run eval` (triggeredBy "cli").
import { z } from 'zod';
import { EvalRunStatusSchema, EvalSuiteSchema } from '../enums';
import { ObjectIdStringSchema, PaginationQuerySchema, paginatedSchema } from './common';

/** pro = the configured (paid) chain; local = the local model (the admin's Pro switch). */
export const EvalModelModeSchema = z.enum(['pro', 'local']);
export type EvalModelMode = z.infer<typeof EvalModelModeSchema>;

const CaseId = z.string().regex(/^[A-Z]+(-[A-Z]+)*-\d{3}$/, 'must be a golden case id');
const Tag = z.string().regex(/^[a-z_]+$/, 'must be a tag such as table');

export const EvalRunStartRequestSchema = z.strictObject({
  /** The judge suite arrives with W4-06. */
  suite: z.enum(['retrieval', 'full']),
  tags: z.array(Tag).max(10).optional(),
  caseIds: z.array(CaseId).max(200).optional(),
});
export type EvalRunStartRequest = z.infer<typeof EvalRunStartRequestSchema>;

export const EvalRunStartResponseSchema = z.object({ runId: z.string() });
export type EvalRunStartResponse = z.infer<typeof EvalRunStartResponseSchema>;

export const EvalRunListQuerySchema = PaginationQuerySchema.extend({
  suite: EvalSuiteSchema.optional(),
});
export type EvalRunListQuery = z.infer<typeof EvalRunListQuerySchema>;

export const EvalRunSummarySchema = z.object({
  id: z.string(),
  suite: EvalSuiteSchema,
  status: EvalRunStatusSchema,
  passed: z.boolean().nullable(),
  metrics: z.record(z.string(), z.number()),
  caseCount: z.number().int().min(0),
  completedCases: z.number().int().min(0),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  costUsd: z.number(),
  /** "cli" or the admin's name. */
  triggeredBy: z.string(),
  modelMode: EvalModelModeSchema.nullable(),
  /** Tag and case filters the run was started with (UI runs). */
  filter: z.object({ tags: z.array(z.string()), caseIds: z.array(z.string()) }).nullable(),
});
export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>;

export const EvalRunListResponseSchema = paginatedSchema(EvalRunSummarySchema);
export type EvalRunListResponse = z.infer<typeof EvalRunListResponseSchema>;

export const EvalRunDetailResponseSchema = z.object({
  run: EvalRunSummarySchema.extend({
    datasetVersion: z.string(),
    perCategory: z.record(z.string(), z.record(z.string(), z.number())),
    targets: z.record(z.string(), z.object({ target: z.number(), met: z.boolean() })),
    configSnapshot: z.object({
      promptVersions: z.record(z.string(), z.number()),
      gitCommit: z.string(),
    }),
    error: z.string().nullable(),
  }),
});
export type EvalRunDetailResponse = z.infer<typeof EvalRunDetailResponseSchema>;
export type EvalRunDetail = EvalRunDetailResponse['run'];

export const EvalRunParamsSchema = z.object({ id: ObjectIdStringSchema });

export const EvalResultsQuerySchema = PaginationQuerySchema.extend({
  passed: z.enum(['true', 'false']).optional(),
  category: z.string().min(1).optional(),
});
export type EvalResultsQuery = z.infer<typeof EvalResultsQuerySchema>;

export const EvalResultSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  passed: z.boolean(),
  failureReasons: z.array(z.string()),
  expected: z.record(z.string(), z.unknown()),
  actual: z.object({
    decision: z.string().nullable(),
    retrievedDocSlugs: z.array(z.string()),
    citedDocSlugs: z.array(z.string()),
    category: z.string().nullable(),
    priority: z.string().nullable(),
    fields: z.record(z.string(), z.string()),
    answerText: z.string(),
  }),
  scores: z.record(z.string(), z.union([z.number(), z.boolean()])),
  traceRef: z.record(z.string(), z.unknown()),
  latencyMs: z.number(),
  costUsd: z.number(),
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

export const EvalResultsResponseSchema = paginatedSchema(EvalResultSchema);
export type EvalResultsResponse = z.infer<typeof EvalResultsResponseSchema>;

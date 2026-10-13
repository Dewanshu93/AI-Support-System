// Knowledge gaps (W4-02, playbook section 4): clusters of questions the knowledge
// base could not answer, so the knowledge team knows what to write. A refresh
// builds a new snapshot in the background; the page polls GET for its progress.
import { z } from 'zod';
import { IsoDateSchema } from './workspace';

export const KnowledgeGapsQuerySchema = z.object({
  snapshot: z.enum(['latest']).default('latest'),
});
export type KnowledgeGapsQuery = z.infer<typeof KnowledgeGapsQuerySchema>;

/** `from` / `to` inclusive (whole days, UTC). Default: the last 30 days (config). */
export const KnowledgeGapsRefreshRequestSchema = z
  .strictObject({ from: IsoDateSchema.optional(), to: IsoDateSchema.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['from'],
    message: 'from must not be after to',
  });
export type KnowledgeGapsRefreshRequest = z.infer<typeof KnowledgeGapsRefreshRequestSchema>;

export const GapDomainSchema = z.enum(['IT', 'HR', 'unknown']);

export const GapClusterDtoSchema = z.object({
  id: z.string(),
  /** The missing topic (P-8); "Unlabelled cluster" when labelling failed. */
  label: z.string(),
  labelled: z.boolean(),
  domain: GapDomainSchema,
  questionCount: z.number().int().min(1),
  /** Redacted example questions, each with the conversation it came from. */
  examples: z.array(
    z.object({ question: z.string(), messageId: z.string(), conversationId: z.string() }),
  ),
});
export type GapClusterDto = z.infer<typeof GapClusterDtoSchema>;

export const GapRefreshStateSchema = z.object({
  status: z.enum(['idle', 'running', 'failed']),
  startedAt: z.string().nullable(),
  /** Set when the last refresh failed (e.g. embeddings unavailable). */
  error: z.string().nullable(),
});
export type GapRefreshState = z.infer<typeof GapRefreshStateSchema>;

export const KnowledgeGapsResponseSchema = z.object({
  /** Null until a refresh has found at least one cluster. */
  snapshot: z
    .object({
      snapshotAt: z.string(),
      range: z.object({ from: IsoDateSchema, to: IsoDateSchema }),
      clusters: z.array(GapClusterDtoSchema),
    })
    .nullable(),
  refresh: GapRefreshStateSchema,
});
export type KnowledgeGapsResponse = z.infer<typeof KnowledgeGapsResponseSchema>;

/** 202 from POST …/refresh: the refresh has started. */
export const KnowledgeGapsRefreshResponseSchema = z.object({ refresh: GapRefreshStateSchema });
export type KnowledgeGapsRefreshResponse = z.infer<typeof KnowledgeGapsRefreshResponseSchema>;

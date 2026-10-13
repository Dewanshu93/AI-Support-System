// Admin metrics (W4-01, playbook section 4 "Metrics"). Definitions are fixed and
// live in code (apps/api/src/domain/metrics.ts); the response carries them so the
// UI can show each one as a tooltip.
import { z } from 'zod';
import { DecisionSchema } from '../enums';
import { IsoDateSchema } from './workspace';

/** `from` inclusive, `to` inclusive (whole days, UTC). Default: the last 7 days. */
export const MetricsOverviewQuerySchema = z
  .object({ from: IsoDateSchema.optional(), to: IsoDateSchema.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['from'],
    message: 'from must not be after to',
  });
export type MetricsOverviewQuery = z.infer<typeof MetricsOverviewQuerySchema>;

const Rate = z.number().min(0).max(1);

export const MetricsOverviewResponseSchema = z.object({
  range: z.object({ from: IsoDateSchema, to: IsoDateSchema }),
  conversations: z.number().int().min(0),
  /** Assistant turns by decision. */
  decisionDistribution: z.array(z.object({ decision: DecisionSchema, count: z.number().int() })),
  confirmedResolutionRate: Rate,
  escalationRate: Rate,
  escalationByCategory: z.array(
    z.object({ category: z.string(), count: z.number().int(), rate: Rate }),
  ),
  sensitiveHandoffs: z.number().int().min(0),
  overrideRate: Rate,
  thumbsDownRate: Rate,
  /** Milliseconds; null when there is no turn in range. */
  latency: z.object({
    ttftP50: z.number().nullable(),
    ttftP90: z.number().nullable(),
    totalP50: z.number().nullable(),
    totalP90: z.number().nullable(),
  }),
  costPerConversationUsd: z.number().min(0),
  /** Metric name → its fixed definition (tooltips). */
  definitions: z.record(z.string(), z.string()),
});
export type MetricsOverviewResponse = z.infer<typeof MetricsOverviewResponseSchema>;

// P-2 rerank_assess output (playbook section 6). The "unknown" coverage
// fallback is set by code, never by the model.
import { z } from 'zod';
import { maxWords } from './common';

export const RerankAssessmentSchema = z.object({
  ranked: z.array(
    z.object({
      /** Must be one of the input chunk IDs; unknown IDs are dropped by code. */
      chunkId: z.string().min(1),
      /** 0 irrelevant · 1 related · 2 partly answers · 3 directly answers. */
      relevance: z.number().int().min(0).max(3),
      reason: z.string().refine(maxWords(15), 'must be at most 15 words'),
    }),
  ),
  coverage: z.enum(['full', 'partial', 'none']),
  missingAspects: z.array(z.string()),
});
export type RerankAssessment = z.output<typeof RerankAssessmentSchema>;

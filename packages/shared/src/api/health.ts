import { z } from 'zod';

/**
 * GET /api/health (public). `db` and `llmConfigured` become required once the
 * DB layer (W1-04) and LLM layer (W1-09) exist.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']).optional(),
  /** Qdrant vector store (ADR-004). */
  vectorStore: z.enum(['up', 'down']).optional(),
  llmConfigured: z.boolean().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

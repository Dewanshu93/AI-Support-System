import { z } from 'zod';
import { LOG_LEVELS } from '../lib/logger';
import { ConfigError, formatIssues } from './errors';

/** `.env.example` ships keys with empty values; treat blank as not set. */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

export const EnvSchema = z.object({
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  API_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
  WEB_ORIGIN: z.preprocess(blankToUndefined, z.url().default('http://localhost:3000')),
  LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).default('info')),
  MONGODB_URI: z.preprocess(
    blankToUndefined,
    z
      .string({ error: 'is required' })
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
  ),
  JWT_SECRET: z.preprocess(
    blankToUndefined,
    z.string({ error: 'is required' }).min(32, 'must be at least 32 characters'),
  ),
  /** Qdrant (vector store, ADR-004). */
  QDRANT_URL: z.preprocess(blankToUndefined, z.url().default('http://localhost:6333')),
  QDRANT_API_KEY: optionalString,
  DEMO_PASSWORD: optionalString,
  // Provider keys are optional so the app can boot without an LLM;
  // GET /api/health reports llmConfigured (W1-09).
  GEMINI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  /** Overrides the config/ directory (tests, alternative deployments). */
  CONFIG_DIR: optionalString,
  /**
   * End-to-end tests only (W2-09): `record` saves every LLM reply and query
   * embedding to LLM_RECORDINGS_FILE; `replay` serves them and never calls a provider.
   */
  LLM_MODE: z.preprocess(blankToUndefined, z.enum(['live', 'record', 'replay']).default('live')),
  LLM_RECORDINGS_FILE: optionalString,
  /** Pins "today" (YYYY-MM-DD) for timesheets and the dashboard in demos and E2E runs. */
  DEMO_TODAY: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
      .optional(),
  ),
});

export type Env = z.output<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      `Invalid environment variables:\n${formatIssues(result.error.issues)}\n` +
        'Set them in the environment or in .env (see .env.example).',
    );
  }
  return result.data;
}

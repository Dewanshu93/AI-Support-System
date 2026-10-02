import { z } from 'zod';
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
  DEMO_PASSWORD: optionalString,
  // Provider keys are optional so the app can boot without an LLM;
  // GET /api/health reports llmConfigured (W1-09).
  GEMINI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  /** Overrides the config/ directory (tests, alternative deployments). */
  CONFIG_DIR: optionalString,
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

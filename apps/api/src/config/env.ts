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
  /** Ollama server for the local fallback model (ADR-018), e.g. http://localhost:11434. */
  OLLAMA_BASE_URL: z.preprocess(blankToUndefined, z.url().optional()),
  /** Overrides the config/ directory (tests, alternative deployments). */
  CONFIG_DIR: optionalString,
  /**
   * End-to-end tests (W2-09): `record` saves every LLM reply and query
   * embedding to LLM_RECORDINGS_FILE; `replay` serves them and never calls a provider.
   * Development (ADR-018): `cache` serves a saved reply when there is one and
   * saves new ones (default file .llm-cache/replies.json, git-ignored).
   */
  LLM_MODE: z.preprocess(
    blankToUndefined,
    z.enum(['live', 'record', 'replay', 'cache']).default('live'),
  ),
  LLM_RECORDINGS_FILE: optionalString,
  /**
   * Escalation email delivery (UC-07, ADR-017). `mock` stores emails in
   * email_outbox without sending them; `smtp` needs an approved mail
   * dependency and refuses to start until one exists.
   */
  EMAIL_DELIVERY: z.preprocess(blankToUndefined, z.enum(['mock', 'smtp']).default('mock')),
  /**
   * Multiplies every rate limit (config/thresholds.yaml rateLimits). Default 1; the E2E
   * run raises it because its scripted sign-ins outpace the per-IP login limit.
   */
  RATE_LIMIT_SCALE: z.preprocess(blankToUndefined, z.coerce.number().min(1).max(1000).default(1)),
  /**
   * Jira Cloud (UC-18, ADR-032): the Atlassian OAuth 2.0 app. Jira is offered to
   * employees only when the client ID, secret and TOKEN_ENCRYPTION_KEY are all set.
   */
  JIRA_CLIENT_ID: optionalString,
  JIRA_CLIENT_SECRET: optionalString,
  /** Where Atlassian sends the employee back; must match the app's callback URL. */
  JIRA_REDIRECT_URI: z.preprocess(
    blankToUndefined,
    z.url().default('http://localhost:3000/api/integrations/jira/callback'),
  ),
  /** Picks one Jira site when an account can reach several, e.g. https://acme.atlassian.net. */
  JIRA_SITE_URL: z.preprocess(blankToUndefined, z.url().optional()),
  /**
   * GitHub (UC-19, ADR-033): a GitHub App with read-only permissions; employees sign
   * in through it. Offered only with the client ID, secret and TOKEN_ENCRYPTION_KEY.
   */
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GITHUB_REDIRECT_URI: z.preprocess(
    blankToUndefined,
    z.url().default('http://localhost:3000/api/integrations/github/callback'),
  ),
  /** 32 random bytes, base64: encrypts connected-app tokens at rest. */
  TOKEN_ENCRYPTION_KEY: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded')
      .optional(),
  ),
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

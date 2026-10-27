// In-memory dependencies for API tests: `npm test` needs no database.
// Users come from the real seed file, so tests exercise the seeded personas.
import { SESSION_COOKIE } from '@sd/shared';
import type { Express } from 'express';
import request from 'supertest';
import { createApp, type CreateAppOptions } from '../../src/app';
import type { AuditLogDoc, UserDoc } from '../../src/db/schemas';
import type { AppDeps } from '../../src/deps';
import type { AuditRepository } from '../../src/modules/audit/repository';
import type { UsersRepository } from '../../src/modules/users/repository';
import { loadSeedUsers } from '../../src/modules/users/seed';
import { createMemoryCheckpointer } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import { loadConfig } from '../../src/config';
import { VALID_ENV } from './config';
import { memoryConversationsRepository, memorySourcesReader } from './conversations';
import { testDocumentAdmin } from './documentAdmin';
import { testEvals } from './evals';
import { testGaps } from './gaps';
import { memoryTracesRepository } from './traces';
import {
  memoryAgentTicketsRepository,
  memoryEmailService,
  memoryTicketsRepository,
  type MemoryTickets,
} from './tickets';
import { memoryIntegrationsRepository } from './integrations';
import { memoryWorkspaceRepository } from './workspace';

export const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-bytes';

export function seededUsers(): UserDoc[] {
  return loadSeedUsers().map((u) => ({ ...u, createdAt: new Date('2026-10-01T00:00:00Z') }));
}

export function memoryUsersRepository(users: UserDoc[]): UsersRepository {
  return {
    findById: async (id) => users.find((u) => u._id.toHexString() === id) ?? null,
    findByEmail: async (email) => users.find((u) => u.email === email.toLowerCase()) ?? null,
    listDemo: async () => users.filter((u) => u.isDemo),
    setPreferences: async (id, preferences) => {
      const user = users.find((u) => u._id.toHexString() === id);
      if (user) Object.assign(user, preferences);
      return user ?? null;
    },
  };
}

export function memoryAuditRepository(): AuditRepository & { entries: AuditLogDoc[] } {
  const entries: AuditLogDoc[] = [];
  return { entries, insert: async (entry) => void entries.push(entry) };
}

export interface TestContext {
  app: Express;
  deps: AppDeps;
  users: UserDoc[];
  audit: AuditLogDoc[];
}

export interface TestAppOptions extends CreateAppOptions {
  /** Defaults to the seeded users. */
  users?: UserDoc[];
  auth?: Partial<AppDeps['auth']>;
  pingDb?: AppDeps['pingDb'];
  pingVectorStore?: AppDeps['pingVectorStore'];
  llmConfigured?: boolean;
  conversations?: AppDeps['conversations'];
  sources?: AppDeps['sources'];
  /** Defaults to the all-stub graph (no persistence). */
  graph?: AppDeps['chat']['graph'];
  tickets?: AppDeps['tickets'];
  /** Defaults to queries over the in-memory tickets (requires the memory tickets repository). */
  agentTickets?: AppDeps['agentTickets'];
  /** Defaults to an empty in-memory workspace. */
  workspace?: AppDeps['workspace'];
  clock?: AppDeps['clock'];
  /** Defaults to an empty in-memory outbox (UC-07). */
  email?: AppDeps['email'];
  /** Rows for the admin overview (W4-01); default: none. */
  metrics?: AppDeps['metrics'];
  /** P-7 draft reply (W3-06); absent → the endpoint answers 503. */
  agentDraft?: AppDeps['agentDraft'];
  /** Knowledge gaps (W4-02); default: empty, and a refresh answers 503. */
  gaps?: AppDeps['gaps'];
  /** Trace-viewer reads (W4-03); default: empty. */
  traces?: AppDeps['traces'];
  /** Admin documents (W4-04); default: empty in-memory stores with fake embeddings. */
  documentAdmin?: AppDeps['documentAdmin'];
  /** Eval runs (W4-05); default: none, and a start answers 503. */
  evals?: AppDeps['evals'];
  /** Connected tools (UC-18); default: empty in-memory tokens and Jira not set up. */
  integrations?: Partial<AppDeps['integrations']>;
  /** Rate limits (W4-07); default: high enough that only rate-limit tests hit them. */
  rateLimits?: Partial<AppDeps['security']['rateLimits']>;
}

const config = loadConfig(VALID_ENV);

export function buildTestApp(options: TestAppOptions = {}): TestContext {
  const users = options.users ?? seededUsers();
  const audit = memoryAuditRepository();
  const tickets = options.tickets ?? memoryTicketsRepository();
  const deps: AppDeps = {
    users: memoryUsersRepository(users),
    audit,
    auth: { jwtSecret: TEST_JWT_SECRET, secureCookies: false, ...options.auth },
    pingDb: options.pingDb,
    pingVectorStore: options.pingVectorStore,
    llmConfigured: options.llmConfigured,
    conversations: options.conversations ?? memoryConversationsRepository(),
    sources: options.sources ?? memorySourcesReader(),
    chat: {
      graph: options.graph ?? buildSupportGraph({ checkpointer: createMemoryCheckpointer() }),
    },
    templates: config.templates.templates,
    tickets,
    email: options.email ?? memoryEmailService(),
    agentTickets: options.agentTickets ?? memoryAgentTicketsRepository(tickets as MemoryTickets),
    agentDraft: options.agentDraft,
    ticketConfig: {
      routing: config.routing,
      taxonomy: config.taxonomy,
      ticketSchemas: config.ticketSchemas.schemas,
      duplicateWindowDays: config.thresholds.ticket.duplicateWindowDays,
    },
    workspace: options.workspace ?? memoryWorkspaceRepository(),
    integrations: {
      repository: options.integrations?.repository ?? memoryIntegrationsRepository(),
      jira: options.integrations?.jira,
    },
    metrics: options.metrics ?? emptyMetrics(),
    gaps: options.gaps ?? testGaps(),
    traces: options.traces ?? memoryTracesRepository(),
    documentAdmin: options.documentAdmin ?? testDocumentAdmin().admin,
    evals: options.evals ?? testEvals(),
    security: {
      webOrigin: 'http://localhost:3000',
      rateLimits: {
        loginsPerMinute: 10_000,
        chatTurnsPerMinute: 10_000,
        uploadsPerHour: 10_000,
        ...options.rateLimits,
      },
    },
    workday: config.workday,
    clock: options.clock,
  };
  return {
    app: createApp(deps, { extraRoutes: options.extraRoutes }),
    deps,
    users,
    audit: audit.entries,
  };
}

export function userByEmail(users: UserDoc[], email: string): UserDoc {
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error(`no seeded user ${email}`);
  return user;
}

/** Logs in through the real endpoint and returns the session cookie header value. */
export async function loginCookie(app: Express, email: string, password?: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send(password ? { email, password } : { email });
  if (res.status !== 200) throw new Error(`login as ${email} failed: ${res.status}`);
  const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
    c.startsWith(`${SESSION_COOKIE}=`),
  );
  if (!cookie) throw new Error('no session cookie set');
  return cookie.split(';')[0]!;
}

/** A metrics repository with no rows (W4-01); tests that need numbers pass their own. */
export function emptyMetrics(): AppDeps['metrics'] {
  return {
    loadRows: async () => ({
      conversations: [],
      turns: [],
      tickets: [],
      overriddenTicketIds: [],
      feedback: [],
    }),
  };
}

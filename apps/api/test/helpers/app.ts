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

export const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-bytes';

export function seededUsers(): UserDoc[] {
  return loadSeedUsers().map((u) => ({ ...u, createdAt: new Date('2026-10-01T00:00:00Z') }));
}

export function memoryUsersRepository(users: UserDoc[]): UsersRepository {
  return {
    findById: async (id) => users.find((u) => u._id.toHexString() === id) ?? null,
    findByEmail: async (email) => users.find((u) => u.email === email.toLowerCase()) ?? null,
    listDemo: async () => users.filter((u) => u.isDemo),
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
}

export function buildTestApp(options: TestAppOptions = {}): TestContext {
  const users = options.users ?? seededUsers();
  const audit = memoryAuditRepository();
  const deps: AppDeps = {
    users: memoryUsersRepository(users),
    audit,
    auth: { jwtSecret: TEST_JWT_SECRET, secureCookies: false, ...options.auth },
    pingDb: options.pingDb,
    pingVectorStore: options.pingVectorStore,
    llmConfigured: options.llmConfigured,
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

// Connected tools (UC-18, ADR-032): an employee connects their own Jira Cloud through
// Atlassian's sign-in page, then sees their Jira issues (read-only, each linking to
// Jira) instead of the mock tracker. Atlassian is a fake: no network.
import { TaskListResponseSchema } from '@sd/shared';
import type { Express } from 'express';
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { JIRA_STATE_COOKIE } from '../../src/modules/integrations/routes';
import { buildMockHrData } from '../../src/modules/workspace/seed';
import { buildTestApp, loginCookie, seededUsers, userByEmail } from '../helpers/app';
import { VALID_ENV } from '../helpers/config';
import {
  fakeJira,
  jiraIssue,
  memoryIntegrationsRepository,
  testJira,
} from '../helpers/integrations';
import { memoryWorkspaceRepository } from '../helpers/workspace';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const SAM = 'sam.patel@example.com';
const TODAY = '2026-10-07';
const config = loadConfig(VALID_ENV);

function setup(options: { jira?: boolean; siteUrl?: string } = {}) {
  const users = seededUsers();
  const fake = fakeJira();
  const repository = memoryIntegrationsRepository();
  let now = new Date(`${TODAY}T09:00:00Z`);
  const ctx = buildTestApp({
    users,
    workspace: memoryWorkspaceRepository(
      buildMockHrData({ users, today: TODAY, workday: config.workday }),
    ),
    integrations: {
      repository,
      jira: options.jira === false ? undefined : testJira(fake, options.siteUrl),
    },
    clock: () => now,
  });
  return {
    ...ctx,
    fake,
    repository,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

/** Connect: the redirect to Atlassian, then Atlassian's redirect back with a code. */
async function connect(app: Express, cookie: string) {
  const start = await request(app).get('/api/integrations/jira/connect').set('Cookie', cookie);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const callback = await request(app)
    .get(`/api/integrations/jira/callback?code=auth-code&state=${state}`)
    .set('Cookie', `${cookie}; ${JIRA_STATE_COOKIE}=${state}`);
  return { start, state, callback };
}

const tasks = async (app: Express, cookie: string, view = 'all') => {
  const res = await request(app).get(`/api/tasks/mine?view=${view}`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return TaskListResponseSchema.parse(res.body);
};

describe('access', () => {
  it.each([
    ['get', '/api/integrations'],
    ['get', '/api/integrations/jira/connect'],
    ['get', '/api/integrations/jira/callback?state=x'],
    ['post', '/api/integrations/jira/disconnect'],
  ] as const)('%s %s needs an employee session', async (method, path) => {
    const ctx = setup();
    expect((await request(ctx.app)[method](path)).status).toBe(401);
    const agent = await loginCookie(ctx.app, SAM);
    expect((await request(ctx.app)[method](path).set('Cookie', agent)).status).toBe(403);
  });
});

describe('Jira not set up on the server', () => {
  it('is reported as unavailable and connect answers 503', async () => {
    const ctx = setup({ jira: false });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const list = await request(ctx.app).get('/api/integrations').set('Cookie', cookie);
    expect(list.body.items).toEqual([
      expect.objectContaining({ provider: 'jira', available: false, connected: false }),
    ]);
    const res = await request(ctx.app).get('/api/integrations/jira/connect').set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INTEGRATION_UNAVAILABLE');
    expect((await tasks(ctx.app, cookie)).tracker.source).toBe('mock');
  });
});

describe('connect', () => {
  it('redirects to Atlassian with a state that is also set as an httpOnly cookie', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await request(ctx.app).get('/api/integrations/jira/connect').set('Cookie', cookie);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.origin).toBe('https://auth.atlassian.com');
    const state = url.searchParams.get('state');
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toContain(`${JIRA_STATE_COOKIE}=${state}`);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('stores encrypted tokens for the employee, audits, and returns to the Tasks page', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { callback } = await connect(ctx.app, cookie);
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe('http://localhost:3000/tasks?jira=connected');

    const [doc] = ctx.repository.docs;
    expect(doc!.userId.equals(userByEmail(ctx.users, PRIYA)._id)).toBe(true);
    expect(doc!.siteUrl).toBe('https://acme.atlassian.net');
    expect(JSON.stringify(doc)).not.toContain('access-1');
    expect(JSON.stringify(doc)).not.toContain('refresh-1');
    expect(ctx.audit.map((a) => a.action)).toContain('integration.connect');

    const list = await request(ctx.app).get('/api/integrations').set('Cookie', cookie);
    expect(list.body.items[0]).toMatchObject({ connected: true, siteName: 'Acme' });
  });

  it('refuses a state that does not match the cookie', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await request(ctx.app).get('/api/integrations/jira/connect').set('Cookie', cookie);
    const res = await request(ctx.app)
      .get('/api/integrations/jira/callback?code=c&state=forged')
      .set('Cookie', `${cookie}; ${JIRA_STATE_COOKIE}=the-real-one`);
    expect(res.headers.location).toBe('http://localhost:3000/tasks?jira=failed');
    expect(ctx.repository.docs).toHaveLength(0);
    expect(ctx.fake.calls).toHaveLength(0);
  });

  it('reports a declined consent', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await request(ctx.app)
      .get('/api/integrations/jira/callback?error=access_denied&state=s1')
      .set('Cookie', `${cookie}; ${JIRA_STATE_COOKIE}=s1`);
    expect(res.headers.location).toBe('http://localhost:3000/tasks?jira=declined');
    expect(ctx.repository.docs).toHaveLength(0);
  });

  it('reports an account with no Jira site, or not the configured one', async () => {
    const ctx = setup({ siteUrl: 'https://other.atlassian.net' });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { callback } = await connect(ctx.app, cookie);
    expect(callback.headers.location).toBe('http://localhost:3000/tasks?jira=no_site');
    expect(ctx.repository.docs).toHaveLength(0);
  });

  it('reports a code Atlassian refuses', async () => {
    const ctx = setup();
    ctx.fake.respond = () => new Response('{"error":"invalid_grant"}', { status: 400 });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { callback } = await connect(ctx.app, cookie);
    expect(callback.headers.location).toBe('http://localhost:3000/tasks?jira=failed');
  });
});

describe('tasks from Jira', () => {
  it('a connected employee sees their Jira issues with links; others keep the mock', async () => {
    const ctx = setup();
    const priya = await loginCookie(ctx.app, PRIYA);
    const tom = await loginCookie(ctx.app, TOM);
    const mockBefore = await tasks(ctx.app, priya);
    expect(mockBefore.tracker.source).toBe('mock');
    await connect(ctx.app, priya);

    const all = await tasks(ctx.app, priya);
    expect(all.tracker).toEqual({ source: 'jira', siteName: 'Acme', problem: null });
    expect(all.items.map((t) => [t.key, t.status, t.url])).toEqual([
      ['PLAT-1', 'in_progress', 'https://acme.atlassian.net/browse/PLAT-1'],
      ['PLAT-2', 'done', 'https://acme.atlassian.net/browse/PLAT-2'],
    ]);
    expect((await tasks(ctx.app, priya, 'open')).items.map((t) => t.key)).toEqual(['PLAT-1']);
    const search = ctx.fake.calls.find((c) => c.url.includes('/search/jql'))!;
    expect(search.method).toBe('GET');
    expect(search.auth).toBe('Bearer access-1');

    expect((await tasks(ctx.app, tom)).tracker.source).toBe('mock');
  });

  it('the dashboard counts the Jira issues', async () => {
    const ctx = setup();
    ctx.fake.issues = [jiraIssue('PLAT-7', { due: '2026-10-08' }), jiraIssue('PLAT-8')];
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie);
    const res = await request(ctx.app).get('/api/dashboard').set('Cookie', cookie);
    expect(res.body.tasks).toMatchObject({ open: 2, dueSoon: 1, tracker: { source: 'jira' } });
  });

  it('refreshes an expired token and keeps the rotated refresh token', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie);
    ctx.advance(2 * 3600_000);
    await tasks(ctx.app, cookie);
    const refresh = ctx.fake.calls.filter((c) => c.url.endsWith('/oauth/token'))[1]!;
    expect(refresh.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
    expect(ctx.fake.calls.at(-1)!.auth).toBe('Bearer access-2');
    const cipherText = JSON.stringify(ctx.repository.docs[0]);
    expect(cipherText).not.toContain('refresh-2');
  });

  it('drops a connection Jira refuses and asks to reconnect', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie);
    ctx.fake.respond = () => new Response('{}', { status: 401 });
    const res = await tasks(ctx.app, cookie);
    expect(res).toMatchObject({ items: [], tracker: { source: 'jira', problem: 'reconnect' } });
    expect(ctx.repository.docs).toHaveLength(0);
    expect((await tasks(ctx.app, cookie)).tracker.source).toBe('mock');
  });

  it('shows "unreachable" without breaking the dashboard when Jira is down', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie);
    ctx.fake.respond = () => {
      throw new TypeError('fetch failed');
    };
    const res = await request(ctx.app).get('/api/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toMatchObject({ open: 0, tracker: { problem: 'unreachable' } });
    expect(ctx.repository.docs).toHaveLength(1);
  });
});

describe('disconnect', () => {
  it('deletes the tokens, audits, and the mock tracker is back', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie);
    const res = await request(ctx.app)
      .post('/api/integrations/jira/disconnect')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ connected: false });
    expect(ctx.repository.docs).toHaveLength(0);
    expect(ctx.audit.map((a) => a.action)).toContain('integration.disconnect');
    expect((await tasks(ctx.app, cookie)).tracker.source).toBe('mock');
  });
});

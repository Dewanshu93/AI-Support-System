// Connected tools (UC-18, ADR-032): an employee connects their own Jira Cloud through
// Atlassian's sign-in page, then sees their Jira issues (read-only, each linking to
// Jira) instead of the mock tracker. Atlassian is a fake: no network.
import { GithubWorkResponseSchema, TaskListResponseSchema } from '@sd/shared';
import type { Express } from 'express';
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { stateCookieName } from '../../src/modules/integrations/routes';
import { buildMockHrData } from '../../src/modules/workspace/seed';
import { buildTestApp, loginCookie, seededUsers, userByEmail } from '../helpers/app';
import { VALID_ENV } from '../helpers/config';
import {
  fakeJira,
  jiraIssue,
  memoryIntegrationsRepository,
  githubItem,
  testIntegrations,
} from '../helpers/integrations';
import { memoryWorkspaceRepository } from '../helpers/workspace';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const SAM = 'sam.patel@example.com';
const TODAY = '2026-10-07';
const JIRA_COOKIE = stateCookieName('jira');
const config = loadConfig(VALID_ENV);

function setup(options: { tools?: 'none' | 'jira' | 'github'; siteUrl?: string } = {}) {
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
      ...(options.tools === 'none'
        ? {}
        : testIntegrations(fake, { siteUrl: options.siteUrl, only: options.tools })),
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
async function connect(app: Express, cookie: string, provider: 'jira' | 'github' = 'jira') {
  const start = await request(app)
    .get(`/api/integrations/${provider}/connect`)
    .set('Cookie', cookie);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const callback = await request(app)
    .get(`/api/integrations/${provider}/callback?code=auth-code&state=${state}`)
    .set('Cookie', `${cookie}; ${stateCookieName(provider)}=${state}`);
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
    ['get', '/api/integrations/github/connect'],
    ['get', '/api/integrations/github/work'],
  ] as const)('%s %s needs an employee session', async (method, path) => {
    const ctx = setup();
    expect((await request(ctx.app)[method](path)).status).toBe(401);
    const agent = await loginCookie(ctx.app, SAM);
    expect((await request(ctx.app)[method](path).set('Cookie', agent)).status).toBe(403);
  });
});

describe('Jira not set up on the server', () => {
  it('is reported as unavailable and connect answers 503', async () => {
    const ctx = setup({ tools: 'none' });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const list = await request(ctx.app).get('/api/integrations').set('Cookie', cookie);
    expect(list.body.items).toEqual([
      expect.objectContaining({ provider: 'jira', available: false, connected: false }),
      expect.objectContaining({ provider: 'github', available: false, connected: false }),
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
    expect(setCookie).toContain(`${JIRA_COOKIE}=${state}`);
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
    expect(doc!.account.url).toBe('https://acme.atlassian.net');
    expect(JSON.stringify(doc)).not.toContain('access-1');
    expect(JSON.stringify(doc)).not.toContain('refresh-1');
    expect(ctx.audit.map((a) => a.action)).toContain('integration.connect');

    const list = await request(ctx.app).get('/api/integrations').set('Cookie', cookie);
    expect(list.body.items[0]).toMatchObject({ connected: true, accountName: 'Acme' });
  });

  it('refuses a state that does not match the cookie', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await request(ctx.app).get('/api/integrations/jira/connect').set('Cookie', cookie);
    const res = await request(ctx.app)
      .get('/api/integrations/jira/callback?code=c&state=forged')
      .set('Cookie', `${cookie}; ${JIRA_COOKIE}=the-real-one`);
    expect(res.headers.location).toBe('http://localhost:3000/tasks?jira=failed');
    expect(ctx.repository.docs).toHaveLength(0);
    expect(ctx.fake.calls).toHaveLength(0);
  });

  it('reports a declined consent', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await request(ctx.app)
      .get('/api/integrations/jira/callback?error=access_denied&state=s1')
      .set('Cookie', `${cookie}; ${JIRA_COOKIE}=s1`);
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

describe('GitHub (UC-19)', () => {
  it('connects through GitHub sign-in and returns to the Connected apps page', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { start, callback } = await connect(ctx.app, cookie, 'github');
    const url = new URL(start.headers.location as string);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(callback.headers.location).toBe('http://localhost:3000/apps?github=connected');

    const doc = ctx.repository.docs.find((d) => d.provider === 'github')!;
    expect(doc.account).toEqual({ id: '42', url: 'https://github.com/priya-s', name: 'priya-s' });
    expect(JSON.stringify(doc)).not.toContain('gh-access-1');
    expect(ctx.audit.find((a) => a.action === 'integration.connect')?.targetId).toBe('github');
  });

  it('lists review requests, own pull requests and assigned issues for the employee', async () => {
    const ctx = setup();
    ctx.fake.github.assigned = [
      { ...githubItem(3, { repo: 'acme/api' }), html_url: 'https://github.com/acme/api/issues/3' },
    ];
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie, 'github');
    const res = await request(ctx.app).get('/api/integrations/github/work').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const body = GithubWorkResponseSchema.parse(res.body);
    expect(body).toMatchObject({ connected: true, accountName: 'priya-s', problem: null });
    expect(body.reviewRequests.map((i) => [i.repo, i.number, i.kind])).toEqual([
      ['acme/portal', 11, 'review_request'],
    ]);
    expect(body.pullRequests[0]).toMatchObject({ number: 12, draft: true });
    expect(body.issues[0]).toMatchObject({
      repo: 'acme/api',
      url: 'https://github.com/acme/api/issues/3',
    });
    const searches = ctx.fake.calls.filter((c) => c.url.includes('/search/issues'));
    expect(searches).toHaveLength(3);
    expect(searches.every((c) => c.method === 'GET' && c.auth === 'Bearer gh-access-1')).toBe(true);
    expect(searches.every((c) => new URL(c.url).searchParams.get('q')!.includes('@me'))).toBe(true);
  });

  it('is "not connected" for an employee who has not connected, and 503 when not set up', async () => {
    const ctx = setup({ tools: 'jira' });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await request(ctx.app).get('/api/integrations/github/work').set('Cookie', cookie);
    expect(res.status).toBe(503);
    const both = setup();
    const tom = await loginCookie(both.app, TOM);
    const work = await request(both.app).get('/api/integrations/github/work').set('Cookie', tom);
    expect(work.body).toMatchObject({ connected: false, reviewRequests: [] });
  });

  it('a 403 (rate limit) is "unreachable" and keeps the connection; a 401 drops it', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie, 'github');
    ctx.fake.respond = () => new Response('{}', { status: 403 });
    const limited = await request(ctx.app)
      .get('/api/integrations/github/work')
      .set('Cookie', cookie);
    expect(limited.body).toMatchObject({ connected: true, problem: 'unreachable' });
    expect(ctx.repository.docs).toHaveLength(1);
    ctx.fake.respond = () => new Response('{}', { status: 401 });
    const refused = await request(ctx.app)
      .get('/api/integrations/github/work')
      .set('Cookie', cookie);
    expect(refused.body).toMatchObject({ connected: false, problem: 'reconnect' });
    expect(ctx.repository.docs).toHaveLength(0);
  });

  it('treats a refused code (200 with an error field) as a failed connect', async () => {
    const ctx = setup();
    ctx.fake.respond = () =>
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { callback } = await connect(ctx.app, cookie, 'github');
    expect(callback.headers.location).toBe('http://localhost:3000/apps?github=failed');
    expect(ctx.repository.docs).toHaveLength(0);
  });

  it('Jira and GitHub connections are independent', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await connect(ctx.app, cookie, 'jira');
    await connect(ctx.app, cookie, 'github');
    await request(ctx.app).post('/api/integrations/github/disconnect').set('Cookie', cookie);
    expect(ctx.repository.docs.map((d) => d.provider)).toEqual(['jira']);
    expect((await tasks(ctx.app, cookie)).tracker.source).toBe('jira');
  });

  it('rejects an unknown tool', async () => {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await request(ctx.app).get('/api/integrations/slack/connect').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

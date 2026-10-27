// In-memory connected-app tokens and a fake Atlassian + GitHub (UC-18, UC-19): tests
// never reach the network. The fake answers the token, account and search calls.
import type { IntegrationTokenDoc } from '../../src/db/schemas';
import type { IntegrationsRepository } from '../../src/modules/integrations/repository';
import { integrationsFromEnv } from '../../src/modules/integrations/setup';

export function memoryIntegrationsRepository(): IntegrationsRepository & {
  docs: IntegrationTokenDoc[];
} {
  const docs: IntegrationTokenDoc[] = [];
  const index = (doc: Pick<IntegrationTokenDoc, 'userId' | 'provider'>) =>
    docs.findIndex((d) => d.userId.equals(doc.userId) && d.provider === doc.provider);
  return {
    docs,
    find: async (userId, provider) => docs[index({ userId, provider })] ?? null,
    async save(doc) {
      const i = index(doc);
      if (i >= 0) docs[i] = { ...doc, _id: docs[i]!._id, createdAt: docs[i]!.createdAt };
      else docs.push(doc);
    },
    async remove(userId, provider) {
      const i = index({ userId, provider });
      if (i < 0) return false;
      docs.splice(i, 1);
      return true;
    },
  };
}

export const TEST_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
export const TEST_SITE = { id: 'cloud-1', url: 'https://acme.atlassian.net', name: 'Acme' };

export function jiraIssue(
  key: string,
  overrides: { status?: string; category?: string; priority?: string; due?: string } = {},
) {
  return {
    id: String(10_000 + Number(key.split('-')[1])),
    key,
    fields: {
      summary: `Issue ${key}`,
      status: {
        name: overrides.status ?? 'In Progress',
        statusCategory: { key: overrides.category ?? 'indeterminate' },
      },
      priority: { name: overrides.priority ?? 'Medium' },
      duedate: overrides.due ?? null,
      project: { id: '100', key: key.split('-')[0], name: 'Platform' },
      updated: '2026-10-06T09:00:00.000+0000',
    },
  };
}

export function githubItem(
  number: number,
  overrides: { repo?: string; title?: string; draft?: boolean } = {},
) {
  const repo = overrides.repo ?? 'acme/portal';
  return {
    id: 5000 + number,
    number,
    title: overrides.title ?? `PR #${number}`,
    html_url: `https://github.com/${repo}/pull/${number}`,
    repository_url: `https://api.github.com/repos/${repo}`,
    updated_at: '2026-10-06T09:00:00Z',
    draft: overrides.draft ?? false,
  };
}

export interface FakeJira {
  fetch: typeof fetch;
  calls: { url: string; method: string; body?: unknown; auth?: string }[];
  /** Replace to simulate failures; default answers success. */
  respond: (url: string, init: RequestInit) => Response | Promise<Response>;
  issues: unknown[];
  /** GitHub search results per query word (review-requested / author / assignee). */
  github: { reviews: unknown[]; mine: unknown[]; assigned: unknown[] };
  sites: unknown[];
  /** Number of token responses issued (each gives new tokens). */
  tokenCount: number;
  expiresIn: number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function fakeJira(): FakeJira {
  const fake: FakeJira = {
    calls: [],
    issues: [jiraIssue('PLAT-1'), jiraIssue('PLAT-2', { status: 'Done', category: 'done' })],
    sites: [{ ...TEST_SITE, scopes: ['read:jira-work'] }],
    github: { reviews: [githubItem(11)], mine: [githubItem(12, { draft: true })], assigned: [] },
    tokenCount: 0,
    expiresIn: 3600,
    respond: (url) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        fake.tokenCount += 1;
        return json({
          access_token: `gh-access-${fake.tokenCount}`,
          refresh_token: `gh-refresh-${fake.tokenCount}`,
          expires_in: 28_800,
          scope: '',
          token_type: 'bearer',
        });
      }
      if (url === 'https://api.github.com/user') {
        return json({ id: 42, login: 'priya-s', html_url: 'https://github.com/priya-s' });
      }
      if (url.startsWith('https://api.github.com/search/issues')) {
        const q = new URL(url).searchParams.get('q') ?? '';
        const items = q.includes('review-requested:@me')
          ? fake.github.reviews
          : q.includes('author:@me')
            ? fake.github.mine
            : fake.github.assigned;
        return json({ total_count: items.length, items });
      }
      if (url.startsWith('https://auth.atlassian.com/oauth/token')) {
        fake.tokenCount += 1;
        return json({
          access_token: `access-${fake.tokenCount}`,
          refresh_token: `refresh-${fake.tokenCount}`,
          expires_in: fake.expiresIn,
          scope: 'read:jira-work read:jira-user offline_access',
        });
      }
      if (url.endsWith('/oauth/token/accessible-resources')) return json(fake.sites);
      if (url.includes('/rest/api/3/search/jql')) {
        const jql = new URL(url).searchParams.get('jql') ?? '';
        const open = jql.includes('statusCategory != Done');
        return json({
          issues: fake.issues.filter(
            (i) =>
              !open ||
              (i as ReturnType<typeof jiraIssue>).fields.status.statusCategory.key !== 'done',
          ),
        });
      }
      return json({ message: 'not found' }, 404);
    },
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const headers = (init.headers ?? {}) as Record<string, string>;
      fake.calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        auth: headers.authorization,
      });
      return fake.respond(url, init);
    }) as typeof fetch,
  };
  return fake;
}

/** Both tools set up against the fake; pass `only` to set up just one. */
export function testIntegrations(
  fake: FakeJira,
  options: { siteUrl?: string; only?: 'jira' | 'github' } = {},
) {
  const on = (tool: 'jira' | 'github') => !options.only || options.only === tool;
  return integrationsFromEnv(
    {
      JIRA_CLIENT_ID: on('jira') ? 'client-id' : undefined,
      JIRA_CLIENT_SECRET: on('jira') ? 'client-secret' : undefined,
      JIRA_REDIRECT_URI: 'http://localhost:3000/api/integrations/jira/callback',
      JIRA_SITE_URL: options.siteUrl,
      GITHUB_CLIENT_ID: on('github') ? 'gh-client' : undefined,
      GITHUB_CLIENT_SECRET: on('github') ? 'gh-secret' : undefined,
      GITHUB_REDIRECT_URI: 'http://localhost:3000/api/integrations/github/callback',
      TOKEN_ENCRYPTION_KEY: TEST_TOKEN_KEY,
    },
    fake.fetch,
  );
}

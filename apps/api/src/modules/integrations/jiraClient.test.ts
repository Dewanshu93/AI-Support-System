import { createJiraClient, JIRA_SCOPES, JiraAuthError, JiraUnavailableError } from './jiraClient';

const config = {
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/api/integrations/jira/callback',
};
const now = new Date('2026-10-07T09:00:00Z');
const site = { id: 'cloud-1', url: 'https://acme.atlassian.net', name: 'Acme' };

function fetchReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('createJiraClient', () => {
  it('builds the Atlassian consent URL with read-only scopes and the state', () => {
    const url = new URL(createJiraClient(config).authorizeUrl('st4te'));
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(url.searchParams.get('scope')).toBe(JIRA_SCOPES.join(' '));
    expect(JIRA_SCOPES.some((s) => s.startsWith('write'))).toBe(false);
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('client_id')).toBe('cid');
  });

  it('exchanges a code for tokens with an expiry', async () => {
    const { fn, calls } = fetchReturning(200, {
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      scope: 'read:jira-work offline_access',
    });
    const tokens = await createJiraClient(config, fn).exchangeCode('code-1', now);
    expect(tokens).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date('2026-10-07T10:00:00Z'),
      scopes: ['read:jira-work', 'offline_access'],
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'cid',
      client_secret: 'secret',
    });
  });

  it('treats a refused token request as a reconnect', async () => {
    const { fn } = fetchReturning(400, { error: 'invalid_grant' });
    await expect(createJiraClient(config, fn).refresh('old', now)).rejects.toBeInstanceOf(
      JiraAuthError,
    );
  });

  it('searches only the signed-in user’s issues with a bearer token', async () => {
    const { fn, calls } = fetchReturning(200, { issues: [] });
    await createJiraClient(config, fn).myIssues('tok', site, 'open');
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/ex/jira/cloud-1/rest/api/3/search/jql');
    expect(url.searchParams.get('jql')).toContain('assignee = currentUser()');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(calls[0]!.init.method ?? 'GET').toBe('GET');
  });

  it('maps 401 to a reconnect and 5xx or a network error to unavailable', async () => {
    await expect(
      createJiraClient(config, fetchReturning(401, {}).fn).myIssues('t', site, 'all'),
    ).rejects.toBeInstanceOf(JiraAuthError);
    await expect(
      createJiraClient(config, fetchReturning(503, {}).fn).myIssues('t', site, 'all'),
    ).rejects.toBeInstanceOf(JiraUnavailableError);
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(createJiraClient(config, failing).sites('t')).rejects.toBeInstanceOf(
      JiraUnavailableError,
    );
  });

  it('lists only Jira sites', async () => {
    const { fn } = fetchReturning(200, [
      { ...site, scopes: ['read:jira-work'] },
      {
        id: 'c2',
        url: 'https://acme.atlassian.net/wiki',
        name: 'Wiki',
        scopes: ['read:confluence'],
      },
    ]);
    expect(await createJiraClient(config, fn).sites('t')).toEqual([site]);
  });
});

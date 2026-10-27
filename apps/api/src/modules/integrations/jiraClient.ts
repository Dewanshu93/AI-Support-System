// Atlassian OAuth 2.0 (3LO) and Jira Cloud REST v3 calls (UC-18, ADR-032). Read-only:
// the only Jira call is the issue search. `fetch` is injected so tests never touch
// the network. Response bodies are never logged (they can carry tokens).
import type { Task, TaskListQuery } from '@sd/shared';
import { z } from 'zod';
import { JIRA_ISSUE_FIELDS, myIssuesJql, parseIssues } from './jiraMapping';

export const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_API_URL = 'https://api.atlassian.com';
export const JIRA_SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'];
const TIMEOUT_MS = 10_000;
const MAX_ISSUES = 50;

export interface JiraOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Atlassian refused the token (expired, revoked, scopes removed): reconnect needed. */
export class JiraAuthError extends Error {}
/** Network, proxy, timeout or a 5xx: try again later. */
export class JiraUnavailableError extends Error {}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(''),
});
export type JiraTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
};

const ResourcesSchema = z.array(
  z
    .object({
      id: z.string(),
      url: z.url(),
      name: z.string(),
      scopes: z.array(z.string()).default([]),
    })
    .loose(),
);
export type JiraSite = { id: string; url: string; name: string };

export interface JiraClient {
  authorizeUrl(state: string): string;
  exchangeCode(code: string, now: Date): Promise<JiraTokens>;
  refresh(refreshToken: string, now: Date): Promise<JiraTokens>;
  sites(accessToken: string): Promise<JiraSite[]>;
  myIssues(accessToken: string, site: JiraSite, view: TaskListQuery['view']): Promise<Task[]>;
}

export function createJiraClient(
  config: JiraOAuthConfig,
  fetchFn: typeof fetch = fetch,
): JiraClient {
  async function call(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new JiraUnavailableError(`Jira unreachable: ${(err as Error).name}`);
    }
    if (res.status === 401 || res.status === 403)
      throw new JiraAuthError(`Jira refused: ${res.status}`);
    // A refused code or refresh token is a 400/invalid_grant from the token endpoint.
    if (res.status === 400 && url === ATLASSIAN_TOKEN_URL)
      throw new JiraAuthError('Jira token refused');
    if (!res.ok) throw new JiraUnavailableError(`Jira answered ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new JiraUnavailableError('Jira answered with invalid JSON');
    }
  }

  async function token(body: Record<string, string>, now: Date): Promise<JiraTokens> {
    const raw = await call(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...body,
      }),
    });
    const parsed = TokenResponseSchema.safeParse(raw);
    if (!parsed.success) throw new JiraUnavailableError('Unexpected token response');
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresAt: new Date(now.getTime() + parsed.data.expires_in * 1000),
      scopes: parsed.data.scope.split(' ').filter(Boolean),
    };
  }

  const bearer = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  });

  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        audience: 'api.atlassian.com',
        client_id: config.clientId,
        scope: JIRA_SCOPES.join(' '),
        redirect_uri: config.redirectUri,
        state,
        response_type: 'code',
        prompt: 'consent',
      });
      return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
    },
    exchangeCode: (code, now) =>
      token({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }, now),
    refresh: (refreshToken, now) =>
      token({ grant_type: 'refresh_token', refresh_token: refreshToken }, now),
    async sites(accessToken) {
      const raw = await call(`${ATLASSIAN_API_URL}/oauth/token/accessible-resources`, {
        headers: bearer(accessToken),
      });
      const parsed = ResourcesSchema.safeParse(raw);
      if (!parsed.success) throw new JiraUnavailableError('Unexpected site list');
      return parsed.data
        .filter((r) => r.scopes.length === 0 || r.scopes.some((s) => s.includes('jira')))
        .map((r) => ({ id: r.id, url: r.url, name: r.name }));
    },
    async myIssues(accessToken, site, view) {
      const params = new URLSearchParams({
        jql: myIssuesJql(view),
        fields: JIRA_ISSUE_FIELDS.join(','),
        maxResults: String(MAX_ISSUES),
      });
      const raw = await call(
        `${ATLASSIAN_API_URL}/ex/jira/${encodeURIComponent(site.id)}/rest/api/3/search/jql?${params.toString()}`,
        { headers: bearer(accessToken) },
      );
      return parseIssues(raw, site.url);
    },
  };
}

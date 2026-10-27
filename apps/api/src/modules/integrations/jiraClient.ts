// Atlassian OAuth 2.0 (3LO) and Jira Cloud REST v3 calls (UC-18, ADR-032). Read-only:
// the only Jira call is the issue search. `fetch` is injected so tests never touch
// the network.
import type { Task, TaskListQuery } from '@sd/shared';
import { z } from 'zod';
import { JIRA_ISSUE_FIELDS, myIssuesJql, parseIssues } from './jiraMapping';
import {
  callJson,
  type ConnectedAccount,
  IntegrationUnavailableError,
  type OAuthClientConfig,
  type OAuthProvider,
  parseTokenResponse,
} from './oauth';

export const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_API_URL = 'https://api.atlassian.com';
export const JIRA_SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'];
const MAX_ISSUES = 50;

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

export interface JiraClient extends OAuthProvider {
  /** Jira sites the token can reach. */
  sites(accessToken: string): Promise<ConnectedAccount[]>;
  myIssues(
    accessToken: string,
    site: ConnectedAccount,
    view: TaskListQuery['view'],
  ): Promise<Task[]>;
}

export function createJiraClient(
  config: OAuthClientConfig & { siteUrl?: string },
  fetchFn: typeof fetch = fetch,
): JiraClient {
  const token = async (body: Record<string, string>, now: Date) =>
    parseTokenResponse(
      await callJson(
        fetchFn,
        ATLASSIAN_TOKEN_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            ...body,
          }),
        },
        [400, 401, 403], // 400: invalid_grant
      ),
      now,
    );

  const bearer = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  });

  async function sites(accessToken: string): Promise<ConnectedAccount[]> {
    const raw = await callJson(fetchFn, `${ATLASSIAN_API_URL}/oauth/token/accessible-resources`, {
      headers: bearer(accessToken),
    });
    const parsed = ResourcesSchema.safeParse(raw);
    if (!parsed.success) throw new IntegrationUnavailableError('unexpected site list');
    return parsed.data
      .filter((r) => r.scopes.length === 0 || r.scopes.some((s) => s.includes('jira')))
      .map((r) => ({ id: r.id, url: r.url, name: r.name }));
  }

  return {
    id: 'jira',
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
    sites,
    /** JIRA_SITE_URL when set (null if the account cannot reach it), else the first site. */
    async account(accessToken) {
      const all = await sites(accessToken);
      const norm = (url: string) => url.replace(/\/+$/, '').toLowerCase();
      if (config.siteUrl) return all.find((s) => norm(s.url) === norm(config.siteUrl!)) ?? null;
      return all[0] ?? null;
    },
    async myIssues(accessToken, site, view) {
      const params = new URLSearchParams({
        jql: myIssuesJql(view),
        fields: JIRA_ISSUE_FIELDS.join(','),
        maxResults: String(MAX_ISSUES),
      });
      const raw = await callJson(
        fetchFn,
        `${ATLASSIAN_API_URL}/ex/jira/${encodeURIComponent(site.id)}/rest/api/3/search/jql?${params.toString()}`,
        { headers: bearer(accessToken) },
      );
      return parseIssues(raw, site.url);
    },
  };
}

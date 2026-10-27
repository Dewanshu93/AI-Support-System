// GitHub sign-in and reads (UC-19, ADR-033): a GitHub App with read-only
// permissions, signed in per employee (user-to-server tokens, which expire and
// refresh). Read-only: the only calls are /user and issue search. `fetch` is injected.
import type { GithubItem, GithubItemKind } from '@sd/shared';
import { z } from 'zod';
import { GITHUB_QUERIES, parseSearch } from './githubMapping';
import {
  callJson,
  IntegrationUnavailableError,
  type OAuthClientConfig,
  type OAuthProvider,
  parseTokenResponse,
} from './oauth';

export const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_API_URL = 'https://api.github.com';
const PER_LIST = 30;
/** GitHub answers 403 for rate limits, so only 401 means "token refused". */
const REFUSED = [401];

const UserSchema = z.object({ id: z.number(), login: z.string(), html_url: z.url() }).loose();

export interface GithubClient extends OAuthProvider {
  search(accessToken: string, kind: GithubItemKind): Promise<GithubItem[]>;
}

export function createGithubClient(
  config: OAuthClientConfig,
  fetchFn: typeof fetch = fetch,
): GithubClient {
  const token = async (body: Record<string, string>, now: Date) =>
    parseTokenResponse(
      await callJson(
        fetchFn,
        GITHUB_TOKEN_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            ...body,
          }),
        },
        REFUSED,
      ),
      now,
      ',',
    );

  const headers = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'employee-hub',
  });

  return {
    id: 'github',
    authorizeUrl(state) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        state,
      });
      return `${GITHUB_AUTH_URL}?${params.toString()}`;
    },
    exchangeCode: (code, now) => token({ code, redirect_uri: config.redirectUri }, now),
    refresh: (refreshToken, now) =>
      token({ grant_type: 'refresh_token', refresh_token: refreshToken }, now),
    async account(accessToken) {
      const raw = await callJson(
        fetchFn,
        `${GITHUB_API_URL}/user`,
        { headers: headers(accessToken) },
        REFUSED,
      );
      const user = UserSchema.safeParse(raw);
      if (!user.success) throw new IntegrationUnavailableError('unexpected user');
      return { id: String(user.data.id), url: user.data.html_url, name: user.data.login };
    },
    async search(accessToken, kind) {
      const params = new URLSearchParams({
        q: GITHUB_QUERIES[kind],
        sort: 'updated',
        order: 'desc',
        per_page: String(PER_LIST),
      });
      const raw = await callJson(
        fetchFn,
        `${GITHUB_API_URL}/search/issues?${params.toString()}`,
        { headers: headers(accessToken) },
        REFUSED,
      );
      return parseSearch(raw, kind);
    },
  };
}

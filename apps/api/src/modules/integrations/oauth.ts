// What every connected app implements (UC-19, ADR-033): its sign-in URL, the code
// and refresh exchanges, and who the connected account is. Errors fall into two
// kinds the service handles the same way for every tool.
import type { IntegrationProvider } from '@sd/shared';
import { z } from 'zod';

/** The tool refused the token (expired, revoked, permission removed): reconnect needed. */
export class IntegrationAuthError extends Error {}
/** Network, proxy, timeout or a 5xx: try again later. */
export class IntegrationUnavailableError extends Error {}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Null when the tool's tokens do not expire. */
  expiresAt: Date | null;
  scopes: string[];
}

/** The connected account: a Jira site, a GitHub user. */
export interface ConnectedAccount {
  id: string;
  url: string;
  name: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthProvider {
  id: IntegrationProvider;
  authorizeUrl(state: string): string;
  exchangeCode(code: string, now: Date): Promise<OAuthTokens>;
  refresh(refreshToken: string, now: Date): Promise<OAuthTokens>;
  /** Null when the account has nothing this app can use (e.g. no Jira site). */
  account(accessToken: string): Promise<ConnectedAccount | null>;
}

const TIMEOUT_MS = 10_000;

/**
 * One HTTP call with a timeout. `refused` statuses (default 401, 403) → auth error;
 * network, other non-2xx and bad JSON → unavailable. A token endpoint adds its 400
 * (invalid_grant); GitHub passes only 401 (its 403 is a rate limit). Response bodies
 * are never logged: they can carry tokens.
 */
export async function callJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  refused: number[] = [401, 403],
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new IntegrationUnavailableError(`unreachable: ${(err as Error).name}`);
  }
  if (refused.includes(res.status)) {
    throw new IntegrationAuthError(`refused: ${res.status}`);
  }
  if (!res.ok) throw new IntegrationUnavailableError(`answered ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new IntegrationUnavailableError('answered with invalid JSON');
  }
}

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1).optional(),
    expires_in: z.number().int().positive().optional(),
    refresh_token: z.string().min(1).optional(),
    scope: z.string().default(''),
    /** GitHub answers 200 with an error field for a refused code or refresh token. */
    error: z.string().optional(),
  })
  .loose();

export function parseTokenResponse(raw: unknown, now: Date, scopeSeparator = ' '): OAuthTokens {
  const parsed = TokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new IntegrationUnavailableError('unexpected token response');
  if (parsed.data.error || !parsed.data.access_token) {
    throw new IntegrationAuthError(`token refused: ${parsed.data.error ?? 'no token'}`);
  }
  const { access_token, expires_in, refresh_token, scope } = parsed.data;
  return {
    accessToken: access_token,
    refreshToken: refresh_token ?? null,
    expiresAt: expires_in ? new Date(now.getTime() + expires_in * 1000) : null,
    scopes: scope
      .split(scopeSeparator)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

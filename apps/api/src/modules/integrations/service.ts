// Connected apps (UC-18, UC-19; ADR-032, ADR-033): each employee's connection to
// each tool, and the reads. Tokens are decrypted only here, refreshed before they
// expire, and a connection is dropped when the tool refuses its tokens. Every tool
// goes through `withToken`, so the error handling is the same for all of them.
import {
  type AuthUser,
  GITHUB_ITEM_KINDS,
  type GithubWorkResponse,
  INTEGRATION_PROVIDERS,
  type IntegrationProblem,
  type IntegrationProvider,
  type IntegrationStatus,
  type Task,
  type TaskListQuery,
  type TaskTrackerInfo,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { IntegrationTokenDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { GithubClient } from './githubClient';
import type { JiraClient } from './jiraClient';
import {
  type ConnectedAccount,
  IntegrationAuthError,
  IntegrationUnavailableError,
  type OAuthProvider,
  type OAuthTokens,
} from './oauth';
import type { IntegrationsRepository } from './repository';
import type { TokenCipher } from './tokenCrypto';

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

/** The tools this server has client credentials for. */
export interface IntegrationClients {
  jira?: JiraClient;
  github?: GithubClient;
}

export interface IntegrationsServiceDeps {
  repository: IntegrationsRepository;
  /** TOKEN_ENCRYPTION_KEY; without it no tool is offered. */
  cipher?: TokenCipher;
  clients: IntegrationClients;
  clock: () => Date;
}

export type ConnectOutcome = 'connected' | 'no_site';

export interface JiraTasksResult {
  items: Task[];
  tracker: TaskTrackerInfo;
}

type Read<T> =
  | { ok: true; value: T; account: ConnectedAccount }
  | { ok: false; problem: IntegrationProblem; account: ConnectedAccount };

export function createIntegrationsService(deps: IntegrationsServiceDeps) {
  const uid = (user: AuthUser) => new ObjectId(user.id);

  function clientOf(provider: IntegrationProvider): OAuthProvider | undefined {
    return deps.cipher ? deps.clients[provider] : undefined;
  }

  function required(provider: IntegrationProvider): { client: OAuthProvider; cipher: TokenCipher } {
    const client = clientOf(provider);
    if (!client || !deps.cipher) {
      throw new AppError('INTEGRATION_UNAVAILABLE', `${provider} is not set up on this server`);
    }
    return { client, cipher: deps.cipher };
  }

  function toDoc(
    userId: ObjectId,
    provider: IntegrationProvider,
    account: ConnectedAccount,
    tokens: OAuthTokens,
    previous: IntegrationTokenDoc | null,
    now: Date,
  ): IntegrationTokenDoc {
    const { cipher } = required(provider);
    return {
      _id: previous?._id ?? new ObjectId(),
      userId,
      provider,
      account,
      accessToken: cipher.encrypt(tokens.accessToken),
      // Refresh tokens rotate; keep the old one if none came back.
      refreshToken: tokens.refreshToken
        ? cipher.encrypt(tokens.refreshToken)
        : (previous?.refreshToken ?? null),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  }

  /** A valid access token, refreshed when it is about to expire. */
  async function accessToken(doc: IntegrationTokenDoc): Promise<string> {
    const { client, cipher } = required(doc.provider);
    const now = deps.clock();
    if (!doc.expiresAt || doc.expiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime()) {
      return cipher.decrypt(doc.accessToken);
    }
    if (!doc.refreshToken) throw new IntegrationAuthError('session expired');
    const tokens = await client.refresh(cipher.decrypt(doc.refreshToken), now);
    await deps.repository.save(toDoc(doc.userId, doc.provider, doc.account, tokens, doc, now));
    return tokens.accessToken;
  }

  /**
   * Runs a read with the employee's token: null when not connected; a refused token
   * drops the connection (`reconnect`), an unreachable tool gives `unreachable`.
   */
  async function withToken<T>(
    user: AuthUser,
    provider: IntegrationProvider,
    read: (token: string, account: ConnectedAccount) => Promise<T>,
  ): Promise<Read<T> | null> {
    if (!clientOf(provider)) return null;
    const doc = await deps.repository.find(uid(user), provider);
    if (!doc) return null;
    try {
      return {
        ok: true,
        value: await read(await accessToken(doc), doc.account),
        account: doc.account,
      };
    } catch (err) {
      if (err instanceof IntegrationAuthError) {
        await deps.repository.remove(doc.userId, provider);
        logger.warn({ userId: user.id, provider }, 'connection refused by the tool; removed');
        return { ok: false, problem: 'reconnect', account: doc.account };
      }
      if (err instanceof IntegrationUnavailableError) {
        logger.warn({ userId: user.id, provider, reason: err.message }, 'tool unreachable');
        return { ok: false, problem: 'unreachable', account: doc.account };
      }
      throw err;
    }
  }

  return {
    available: (provider: IntegrationProvider) => clientOf(provider) !== undefined,

    async list(user: AuthUser): Promise<IntegrationStatus[]> {
      return Promise.all(
        INTEGRATION_PROVIDERS.map(async (provider) => {
          const available = clientOf(provider) !== undefined;
          const doc = available ? await deps.repository.find(uid(user), provider) : null;
          return {
            provider,
            available,
            connected: doc !== null,
            accountName: doc?.account.name ?? null,
            accountUrl: doc?.account.url ?? null,
            connectedAt: doc?.createdAt.toISOString() ?? null,
          };
        }),
      );
    },

    /** The tool's sign-in and consent page for this state. */
    authorizeUrl: (provider: IntegrationProvider, state: string) =>
      required(provider).client.authorizeUrl(state),

    async complete(
      user: AuthUser,
      provider: IntegrationProvider,
      code: string,
    ): Promise<ConnectOutcome> {
      const { client } = required(provider);
      const now = deps.clock();
      const tokens = await client.exchangeCode(code, now);
      const account = await client.account(tokens.accessToken);
      if (!account) return 'no_site';
      const previous = await deps.repository.find(uid(user), provider);
      await deps.repository.save(toDoc(uid(user), provider, account, tokens, previous, now));
      return 'connected';
    },

    disconnect: (user: AuthUser, provider: IntegrationProvider) =>
      deps.repository.remove(uid(user), provider),

    /**
     * The employee's Jira issues, or null when they have not connected Jira (the
     * caller then shows the mock tracker). A failure gives an empty list with the reason.
     */
    async tasks(user: AuthUser, query: TaskListQuery): Promise<JiraTasksResult | null> {
      const jira = deps.clients.jira;
      if (!jira) return null;
      const read = await withToken(user, 'jira', (token, site) =>
        jira.myIssues(token, site, query.view),
      );
      if (!read) return null;
      const tracker = { source: 'jira' as const, siteName: read.account.name };
      if (!read.ok) return { items: [], tracker: { ...tracker, problem: read.problem } };
      return {
        items: query.status ? read.value.filter((t) => t.status === query.status) : read.value,
        tracker: { ...tracker, problem: null },
      };
    },

    /** Review requests, own pull requests and assigned issues on GitHub. */
    async githubWork(user: AuthUser): Promise<GithubWorkResponse> {
      const github = deps.clients.github;
      required('github');
      const read = await withToken(user, 'github', async (token) => {
        const [reviewRequests, pullRequests, issues] = await Promise.all(
          GITHUB_ITEM_KINDS.map((kind) => github!.search(token, kind)),
        );
        return { reviewRequests: reviewRequests!, pullRequests: pullRequests!, issues: issues! };
      });
      const empty = { reviewRequests: [], pullRequests: [], issues: [] };
      if (!read) return { connected: false, accountName: null, problem: null, ...empty };
      if (!read.ok) {
        return {
          connected: read.problem !== 'reconnect',
          accountName: read.account.name,
          problem: read.problem,
          ...empty,
        };
      }
      return { connected: true, accountName: read.account.name, problem: null, ...read.value };
    },
  };
}
export type IntegrationsService = ReturnType<typeof createIntegrationsService>;

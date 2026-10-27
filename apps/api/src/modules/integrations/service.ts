// Connected tools (UC-18, ADR-032): the Jira connection of each employee and the
// read of their issues. Tokens are decrypted only here, refreshed before they expire,
// and the connection is dropped when Atlassian refuses them.
import type { AuthUser, IntegrationStatus, Task, TaskListQuery, TaskTrackerInfo } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { IntegrationTokenDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import {
  JiraAuthError,
  type JiraClient,
  type JiraSite,
  type JiraTokens,
  JiraUnavailableError,
} from './jiraClient';
import type { IntegrationsRepository } from './repository';
import type { TokenCipher } from './tokenCrypto';

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

export interface JiraIntegration {
  client: JiraClient;
  cipher: TokenCipher;
  /** JIRA_SITE_URL: preferred site when the account can reach several. */
  siteUrl?: string;
}

export interface IntegrationsServiceDeps {
  repository: IntegrationsRepository;
  /** Absent when the server has no Jira client credentials. */
  jira?: JiraIntegration;
  clock: () => Date;
}

export type JiraConnectOutcome = 'connected' | 'no_site';

export interface JiraTasksResult {
  items: Task[];
  tracker: TaskTrackerInfo;
}

export function createIntegrationsService(deps: IntegrationsServiceDeps) {
  const uid = (user: AuthUser) => new ObjectId(user.id);

  function jira(): JiraIntegration {
    if (!deps.jira)
      throw new AppError('INTEGRATION_UNAVAILABLE', 'Jira is not set up on this server');
    return deps.jira;
  }

  function pickSite(sites: JiraSite[], preferred?: string): JiraSite | null {
    const norm = (url: string) => url.replace(/\/+$/, '').toLowerCase();
    if (preferred) return sites.find((s) => norm(s.url) === norm(preferred)) ?? null;
    return sites[0] ?? null;
  }

  function toDoc(
    userId: ObjectId,
    site: JiraSite,
    tokens: JiraTokens,
    previous: IntegrationTokenDoc | null,
    now: Date,
  ): IntegrationTokenDoc {
    const { cipher } = jira();
    return {
      _id: previous?._id ?? new ObjectId(),
      userId,
      provider: 'jira',
      siteId: site.id,
      siteUrl: site.url,
      siteName: site.name,
      accessToken: cipher.encrypt(tokens.accessToken),
      // Atlassian rotates refresh tokens; keep the old one if none came back.
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
    const { client, cipher } = jira();
    const now = deps.clock();
    if (doc.expiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime()) {
      return cipher.decrypt(doc.accessToken);
    }
    if (!doc.refreshToken) throw new JiraAuthError('Jira session expired');
    const tokens = await client.refresh(cipher.decrypt(doc.refreshToken), now);
    const site = { id: doc.siteId, url: doc.siteUrl, name: doc.siteName };
    await deps.repository.save(toDoc(doc.userId, site, tokens, doc, now));
    return tokens.accessToken;
  }

  return {
    available: () => deps.jira !== undefined,

    async list(user: AuthUser): Promise<IntegrationStatus[]> {
      const doc = deps.jira ? await deps.repository.find(uid(user), 'jira') : null;
      return [
        {
          provider: 'jira',
          available: deps.jira !== undefined,
          connected: doc !== null,
          siteName: doc?.siteName ?? null,
          siteUrl: doc?.siteUrl ?? null,
          connectedAt: doc?.createdAt.toISOString() ?? null,
        },
      ];
    },

    /** Atlassian's sign-in and consent page for this state. */
    authorizeUrl: (state: string) => jira().client.authorizeUrl(state),

    async complete(user: AuthUser, code: string): Promise<JiraConnectOutcome> {
      const { client } = jira();
      const now = deps.clock();
      const tokens = await client.exchangeCode(code, now);
      const site = pickSite(await client.sites(tokens.accessToken), deps.jira?.siteUrl);
      if (!site) return 'no_site';
      const previous = await deps.repository.find(uid(user), 'jira');
      await deps.repository.save(toDoc(uid(user), site, tokens, previous, now));
      return 'connected';
    },

    disconnect: (user: AuthUser) => deps.repository.remove(uid(user), 'jira'),

    /**
     * The employee's Jira issues, or null when they have not connected Jira (the
     * caller then shows the mock tracker). A failure gives an empty list with the reason.
     */
    async tasks(user: AuthUser, query: TaskListQuery): Promise<JiraTasksResult | null> {
      if (!deps.jira) return null;
      const doc = await deps.repository.find(uid(user), 'jira');
      if (!doc) return null;
      const site = { id: doc.siteId, url: doc.siteUrl, name: doc.siteName };
      const info = (problem: TaskTrackerInfo['problem']): TaskTrackerInfo => ({
        source: 'jira',
        siteName: doc.siteName,
        problem,
      });
      try {
        const items = await deps.jira.client.myIssues(await accessToken(doc), site, query.view);
        return {
          items: query.status ? items.filter((t) => t.status === query.status) : items,
          tracker: info(null),
        };
      } catch (err) {
        if (err instanceof JiraAuthError) {
          await deps.repository.remove(doc.userId, 'jira');
          logger.warn({ userId: user.id }, 'Jira connection refused; removed');
          return { items: [], tracker: info('reconnect') };
        }
        if (err instanceof JiraUnavailableError) {
          logger.warn({ userId: user.id, reason: err.message }, 'Jira unreachable');
          return { items: [], tracker: info('unreachable') };
        }
        throw err;
      }
    },
  };
}
export type IntegrationsService = ReturnType<typeof createIntegrationsService>;

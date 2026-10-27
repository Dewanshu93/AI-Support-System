// Builds the connected apps from the environment (UC-18, UC-19). A tool is offered
// only when its client ID and secret are set, and only with TOKEN_ENCRYPTION_KEY.
import type { Env } from '../../config/env';
import { createGithubClient } from './githubClient';
import { createJiraClient } from './jiraClient';
import type { IntegrationClients } from './service';
import { createTokenCipher, type TokenCipher } from './tokenCrypto';

export type IntegrationEnv = Pick<
  Env,
  | 'JIRA_CLIENT_ID'
  | 'JIRA_CLIENT_SECRET'
  | 'JIRA_REDIRECT_URI'
  | 'JIRA_SITE_URL'
  | 'GITHUB_CLIENT_ID'
  | 'GITHUB_CLIENT_SECRET'
  | 'GITHUB_REDIRECT_URI'
  | 'TOKEN_ENCRYPTION_KEY'
>;

export function integrationsFromEnv(
  env: IntegrationEnv,
  fetchFn: typeof fetch = fetch,
): { cipher?: TokenCipher; clients: IntegrationClients } {
  if (!env.TOKEN_ENCRYPTION_KEY) return { clients: {} };
  const clients: IntegrationClients = {};
  if (env.JIRA_CLIENT_ID && env.JIRA_CLIENT_SECRET) {
    clients.jira = createJiraClient(
      {
        clientId: env.JIRA_CLIENT_ID,
        clientSecret: env.JIRA_CLIENT_SECRET,
        redirectUri: env.JIRA_REDIRECT_URI,
        siteUrl: env.JIRA_SITE_URL,
      },
      fetchFn,
    );
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    clients.github = createGithubClient(
      {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: env.GITHUB_REDIRECT_URI,
      },
      fetchFn,
    );
  }
  return { cipher: createTokenCipher(env.TOKEN_ENCRYPTION_KEY), clients };
}

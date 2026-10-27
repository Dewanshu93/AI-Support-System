// Builds the Jira integration from the environment (UC-18, ADR-032): offered only
// when the Atlassian client ID, secret and the token encryption key are all set.
import type { Env } from '../../config/env';
import { createJiraClient } from './jiraClient';
import type { JiraIntegration } from './service';
import { createTokenCipher } from './tokenCrypto';

export function jiraIntegrationFromEnv(
  env: Pick<
    Env,
    | 'JIRA_CLIENT_ID'
    | 'JIRA_CLIENT_SECRET'
    | 'JIRA_REDIRECT_URI'
    | 'JIRA_SITE_URL'
    | 'TOKEN_ENCRYPTION_KEY'
  >,
  fetchFn: typeof fetch = fetch,
): JiraIntegration | undefined {
  if (!env.JIRA_CLIENT_ID || !env.JIRA_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) return undefined;
  return {
    client: createJiraClient(
      {
        clientId: env.JIRA_CLIENT_ID,
        clientSecret: env.JIRA_CLIENT_SECRET,
        redirectUri: env.JIRA_REDIRECT_URI,
      },
      fetchFn,
    ),
    cipher: createTokenCipher(env.TOKEN_ENCRYPTION_KEY),
    siteUrl: env.JIRA_SITE_URL,
  };
}

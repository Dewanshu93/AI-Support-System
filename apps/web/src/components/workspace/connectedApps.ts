// Connected apps (UC-18, UC-19): texts and links shared by the Connected apps page
// and the Jira card on the Tasks page. "Connect" is a plain link, so the browser goes
// to the tool's own sign-in page and comes back with `?<provider>=<result>`.
import {
  CONNECT_RESULTS,
  type ConnectResult,
  INTEGRATION_LABEL,
  type IntegrationProblem,
  type IntegrationProvider,
} from '@sd/shared';

export const connectPath = (provider: IntegrationProvider) =>
  `/api/integrations/${provider}/connect`;

/** What each tool shows once connected (the app only reads). */
export const APP_DESCRIPTION: Record<IntegrationProvider, string> = {
  jira: 'Issues assigned to you, on the Tasks page and the dashboard.',
  github: 'Pull requests waiting for your review, your open pull requests and assigned issues.',
};

/** The message after the tool sends the employee back. */
export function connectResultText(
  provider: IntegrationProvider,
  result: string | null,
): { tone: 'ok' | 'warn'; text: string } | null {
  if (!result || !(CONNECT_RESULTS as readonly string[]).includes(result)) return null;
  const name = INTEGRATION_LABEL[provider];
  switch (result as ConnectResult) {
    case 'connected':
      return { tone: 'ok', text: `${name} connected.` };
    case 'declined':
      return { tone: 'warn', text: `${name} was not connected: access was not allowed.` };
    case 'no_site':
      return { tone: 'warn', text: `Your ${name} account has nothing this app can use.` };
    case 'failed':
      return { tone: 'warn', text: `${name} could not be connected. Please try again.` };
  }
}

/** Why a connected tool shows nothing. */
export function problemText(
  provider: IntegrationProvider,
  problem: IntegrationProblem | null | undefined,
): string | null {
  const name = INTEGRATION_LABEL[provider];
  if (problem === 'reconnect') return `${name} asked you to sign in again. Connect it to continue.`;
  if (problem === 'unreachable')
    return `${name} could not be reached just now. Try again in a moment.`;
  return null;
}

/** Reads `?<provider>=<result>` once and removes it from the address bar. */
export function takeConnectResult(provider: IntegrationProvider) {
  const params = new URLSearchParams(window.location.search);
  const result = connectResultText(provider, params.get(provider));
  if (params.has(provider)) {
    params.delete(provider);
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }
  return result;
}

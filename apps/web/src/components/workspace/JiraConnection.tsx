'use client';

// Connect Jira (UC-18, ADR-032): "Connect Jira" is a plain link, so the browser goes
// to Atlassian's own sign-in page and comes back to /tasks?jira=<result>. The app only
// reads issues; changes are made in Jira through each issue's link.
import {
  JIRA_CONNECT_RESULTS,
  type IntegrationStatus,
  type JiraConnectResult,
  type TaskTrackerInfo,
} from '@sd/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';

export const JIRA_CONNECT_PATH = '/api/integrations/jira/connect';

/** The message after Atlassian sends the employee back (`?jira=`). */
export function jiraResultText(
  result: string | null,
): { tone: 'ok' | 'warn'; text: string } | null {
  if (!result || !(JIRA_CONNECT_RESULTS as readonly string[]).includes(result)) return null;
  switch (result as JiraConnectResult) {
    case 'connected':
      return { tone: 'ok', text: 'Jira connected. Your Jira issues are shown below.' };
    case 'declined':
      return { tone: 'warn', text: 'Jira was not connected: access was not allowed.' };
    case 'no_site':
      return { tone: 'warn', text: 'Your Atlassian account has no Jira site this app can use.' };
    case 'failed':
      return { tone: 'warn', text: 'Jira could not be connected. Please try again.' };
  }
}

/** Why a Jira list is empty, when Jira could not be read. */
export function trackerProblemText(tracker: TaskTrackerInfo | undefined): string | null {
  if (tracker?.problem === 'reconnect')
    return 'Jira asked you to sign in again. Connect Jira to see your issues.';
  if (tracker?.problem === 'unreachable')
    return 'Jira could not be reached just now. Try again in a moment.';
  return null;
}

export function JiraConnection({
  tracker,
  onChange,
}: {
  tracker: TaskTrackerInfo | undefined;
  onChange: () => void;
}) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [result, setResult] = useState<ReturnType<typeof jiraResultText>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .integrations()
      .then((r) => setStatus(r.items.find((i) => i.provider === 'jira') ?? null))
      .catch(() => setStatus(null));
  }, [tracker?.source]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setResult(jiraResultText(params.get('jira')));
    if (params.has('jira')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  if (!status?.available) return null;
  const problem = trackerProblemText(tracker);

  async function disconnect() {
    setBusy(true);
    try {
      const r = await api.disconnectJira();
      setStatus(r.items.find((i) => i.provider === 'jira') ?? null);
      setResult(null);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-2" data-testid="jira-connection">
      {result && (
        <p
          role="status"
          className={`rounded-xl px-4 py-2.5 text-sm ${
            result.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          {result.text}
        </p>
      )}
      {status.connected && !problem ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-surface px-4 py-3 shadow-card">
          <p className="text-sm text-slate-700">
            Showing your issues from Jira
            {status.siteUrl && (
              <>
                {' · '}
                <a
                  href={status.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {status.siteName}
                </a>
              </>
            )}
            <span className="text-slate-500"> — to change an issue, open it in Jira.</span>
          </p>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-surface px-4 py-3 shadow-card">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {problem ? 'Jira needs attention' : 'Connect your Jira'}
            </p>
            <p className="text-xs text-slate-500">
              {problem ??
                'Sign in on Atlassian’s page to see the issues assigned to you here. The app only reads them.'}
            </p>
          </div>
          {tracker?.problem !== 'unreachable' && (
            <a
              href={JIRA_CONNECT_PATH}
              data-testid="jira-connect"
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-ink px-3 text-xs font-medium text-on-ink shadow-sm hover:bg-ink-hover"
            >
              Connect Jira
              <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

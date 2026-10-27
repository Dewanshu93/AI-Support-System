'use client';

// Connect Jira on the Tasks page (UC-18, ADR-032): "Connect Jira" is a plain link to
// Atlassian's own sign-in page, which comes back to /tasks?jira=<result>. The app only
// reads issues; changes are made in Jira through each issue's link.
import type { IntegrationStatus, TaskTrackerInfo } from '@sd/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { connectPath, problemText, takeConnectResult } from './connectedApps';

export function JiraConnection({
  tracker,
  onChange,
}: {
  tracker: TaskTrackerInfo | undefined;
  onChange: () => void;
}) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [result, setResult] = useState<ReturnType<typeof takeConnectResult>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .integrations()
      .then((r) => setStatus(r.items.find((i) => i.provider === 'jira') ?? null))
      .catch(() => setStatus(null));
  }, [tracker?.source]);

  useEffect(() => {
    setResult(takeConnectResult('jira'));
  }, []);

  if (!status?.available) return null;
  const problem = problemText('jira', tracker?.problem);

  async function disconnect() {
    setBusy(true);
    try {
      const r = await api.disconnectIntegration('jira');
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
            {status.accountUrl && (
              <>
                {' · '}
                <a
                  href={status.accountUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {status.accountName}
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
              href={connectPath('jira')}
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

'use client';

// Connected apps (UC-19, ADR-033): one card per tool the server offers. "Connect"
// opens the tool's own sign-in page; the app then reads (never writes) the
// employee's data, and every item links to the tool, where changes are made.
import {
  type GithubItem,
  INTEGRATION_LABEL,
  type IntegrationProvider,
  type IntegrationStatus,
} from '@sd/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { APP_DESCRIPTION, connectPath, problemText, takeConnectResult } from './connectedApps';

export function ConnectedAppsPage() {
  const { state, reload } = useApi(() => api.integrations());
  const [result, setResult] = useState<ReturnType<typeof takeConnectResult>>(null);

  useEffect(() => {
    setResult(takeConnectResult('github') ?? takeConnectResult('jira'));
  }, []);

  const offered = state.data?.items.filter((i) => i.available) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Connected apps"
        description="Connect the tools you use. You sign in on each tool’s own page; this app only reads your data, and every item opens in the tool for changes."
      />
      {result && (
        <p
          role="status"
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${
            result.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          {result.text}
        </p>
      )}
      {state.kind === 'error' && !state.data ? (
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      ) : !state.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : offered.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No apps to connect yet"
          description="Your administrator has not set up any tools on this server."
        />
      ) : (
        <div className="space-y-4">
          {offered.map((status) => (
            <AppCard key={status.provider} status={status} onChange={() => void reload()} />
          ))}
        </div>
      )}
    </>
  );
}

function AppCard({ status, onChange }: { status: IntegrationStatus; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = INTEGRATION_LABEL[status.provider];

  async function disconnect() {
    setBusy(true);
    try {
      await api.disconnectIntegration(status.provider);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid={`app-${status.provider}`}>
      <CardHeader
        icon={
          <Icon name={status.provider === 'jira' ? 'checklist' : 'board'} className="h-4.5 w-4.5" />
        }
        title={
          <span className="flex items-center gap-2">
            {name}
            {status.connected && (
              <Badge tone="success" dot>
                Connected
              </Badge>
            )}
          </span>
        }
        subtitle={
          status.connected && status.accountName
            ? `Signed in as ${status.accountName}`
            : APP_DESCRIPTION[status.provider]
        }
        action={
          status.connected ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : (
            <ConnectLink provider={status.provider} />
          )
        }
      />
      {status.connected && status.provider === 'github' && <GithubWork />}
      {status.connected && status.provider === 'jira' && (
        <p className="text-sm text-slate-600">
          Your Jira issues are on{' '}
          <Link href="/tasks" className="font-medium text-brand-600 hover:text-brand-700">
            My work
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

function ConnectLink({ provider }: { provider: IntegrationProvider }) {
  return (
    <a
      href={connectPath(provider)}
      data-testid={`connect-${provider}`}
      className="inline-flex h-8 items-center gap-2 rounded-lg bg-ink px-3 text-xs font-medium whitespace-nowrap text-on-ink shadow-sm hover:bg-ink-hover"
    >
      Connect {INTEGRATION_LABEL[provider]}
      <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
    </a>
  );
}

function GithubWork() {
  const { state, reload } = useApi(() => api.githubWork());
  if (state.kind === 'error' && !state.data) {
    return (
      <ErrorState
        message={state.error.message}
        requestId={state.error.requestId}
        onRetry={() => void reload()}
      />
    );
  }
  if (!state.data) return <Skeleton className="h-32 rounded-xl" />;
  const work = state.data;
  const problem = problemText('github', work.problem);
  if (problem) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <span>{problem}</span>
        {work.problem === 'reconnect' && <ConnectLink provider="github" />}
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ItemList
        title="Waiting for your review"
        items={work.reviewRequests}
        empty="No reviews waiting."
      />
      <ItemList
        title="Your open pull requests"
        items={work.pullRequests}
        empty="No open pull requests."
      />
      <ItemList title="Issues assigned to you" items={work.issues} empty="No assigned issues." />
    </div>
  );
}

function ItemList({ title, items, empty }: { title: string; items: GithubItem[]; empty: string }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
        {title}
        <span className="font-medium text-slate-500">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
          {items.slice(0, 8).map((item) => (
            <li key={item.id} className="px-3 py-2.5">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="github-item"
                className="group block"
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-600">
                    {item.title}
                  </span>
                  {item.draft && <Badge tone="neutral">Draft</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {item.repo} #{item.number} · updated {relativeTime(item.updatedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

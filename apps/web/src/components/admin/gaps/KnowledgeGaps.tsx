'use client';

// Knowledge gaps (W4-02, playbook section 10): clusters of questions the
// knowledge base could not answer, named by topic, with example questions that
// link to their traces. A refresh runs on the server in the background; the page
// polls until it finishes.
import type { GapClusterDto, KnowledgeGapsResponse } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';

const POLL_MS = 4000;

const DOMAIN_TONE = { IT: 'info', HR: 'violet', unknown: 'neutral' } as const;

const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function ClusterList({
  clusters,
  selected,
  onSelect,
}: {
  clusters: GapClusterDto[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const max = Math.max(...clusters.map((c) => c.questionCount));
  return (
    <Card className="p-2" data-testid="gap-cluster-list">
      <ul className="space-y-1">
        {clusters.map((c) => {
          const active = c.id === selected;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(c.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                  active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${
                      c.labelled ? 'text-slate-900' : 'text-slate-500 italic'
                    }`}
                  >
                    {c.label}
                  </span>
                  <Badge tone={DOMAIN_TONE[c.domain]}>{c.domain}</Badge>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${(c.questionCount / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-20 text-right text-xs text-slate-500 tabular-nums">
                    {c.questionCount} question{c.questionCount === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ClusterDetail({ cluster }: { cluster: GapClusterDto }) {
  return (
    <Card className="space-y-4" data-testid="gap-cluster-detail">
      <div className="flex flex-wrap items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900">{cluster.label}</h2>
        <Badge tone={DOMAIN_TONE[cluster.domain]}>{cluster.domain}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        {cluster.questionCount} question{cluster.questionCount === 1 ? '' : 's'} the knowledge base
        could not fully answer. Showing {cluster.examples.length} example
        {cluster.examples.length === 1 ? '' : 's'} (personal details removed).
        {!cluster.labelled && ' The topic could not be named automatically.'}
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
        {cluster.examples.map((e) => (
          <li key={e.messageId} className="flex items-start gap-3 px-4 py-3">
            <Icon name="chat" className="mt-0.5 h-4 w-4 text-slate-400" />
            <p className="min-w-0 flex-1 text-sm text-slate-800">{e.question}</p>
            <Link
              href={`/admin/traces/${e.conversationId}`}
              className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View trace
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function KnowledgeGaps() {
  const [data, setData] = useState<KnowledgeGapsResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.knowledgeGaps());
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, []);

  useEffect(() => void load(), [load]);

  const running = data?.refresh.status === 'running';
  // Poll while a refresh runs; stop as soon as it finishes or fails.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const refresh = async () => {
    setActionError(null);
    try {
      const state = await api.refreshKnowledgeGaps();
      setData((d) => (d ? { ...d, refresh: state } : d));
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.code === 'LLM_UNAVAILABLE'
          ? 'The AI service is not configured, so gaps cannot be refreshed right now.'
          : err instanceof ApiError
            ? err.message
            : 'Cannot reach the service.',
      );
    }
  };

  const clusters = data?.snapshot?.clusters ?? [];
  const current = clusters.find((c) => c.id === selected) ?? clusters[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Knowledge gaps"
        description="Questions the knowledge base could not answer, grouped by topic, so you know which articles to write next. Confidential and evaluation conversations are never included."
        actions={
          <Button onClick={() => void refresh()} disabled={!data || running}>
            <Icon name="refresh" className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {running && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800"
        >
          <Icon name="sparkles" className="h-4 w-4" />
          Grouping recent questions and naming the topics. This can take a few minutes.
        </p>
      )}
      {(actionError || data?.refresh.status === 'failed') && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <Icon name="alert" className="h-4 w-4" />
          {actionError ?? data?.refresh.error}
        </p>
      )}

      {error && (
        <ErrorState
          title="Could not load knowledge gaps"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !data && (
        <div role="status" aria-label="Loading knowledge gaps" className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}
      {data && !data.snapshot && !running && (
        <EmptyState
          title="No gaps detected yet"
          description="Refresh to group the questions of the last 30 days that the knowledge base answered only in part or not at all."
          icon="search"
        />
      )}
      {data?.snapshot && current && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500" data-testid="gap-snapshot-meta">
            {clusters.length} topic{clusters.length === 1 ? '' : 's'} from questions asked{' '}
            {formatDay(data.snapshot.range.from)} – {formatDay(data.snapshot.range.to)} · updated{' '}
            {new Date(data.snapshot.snapshotAt).toLocaleString()}
          </p>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <ClusterList clusters={clusters} selected={current.id} onSelect={setSelected} />
            <ClusterDetail cluster={current} />
          </div>
        </div>
      )}
    </>
  );
}

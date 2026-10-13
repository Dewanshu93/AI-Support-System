'use client';

// Admin overview (W4-01, playbook section 10): service desk and AI health for a
// date range. Every metric shows its fixed definition (from the API) as a
// tooltip. Bars are plain Tailwind (no chart library, CLAUDE.md).
import type { Decision, MetricsOverviewResponse } from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { fieldLabel } from '@/lib/ticketDraft';

type Data = MetricsOverviewResponse;

export const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
export const secs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

/** One colour per decision, used by the bar and its legend. */
export const DECISION_STYLE: Record<Decision, { label: string; bar: string }> = {
  ANSWER: { label: 'Answer', bar: 'bg-emerald-500' },
  PARTIAL: { label: 'Partial', bar: 'bg-sky-500' },
  CLARIFY: { label: 'Clarify', bar: 'bg-violet-500' },
  ESCALATE: { label: 'Escalate', bar: 'bg-amber-500' },
  SENSITIVE_HANDOFF: { label: 'Sensitive handoff', bar: 'bg-rose-500' },
  OUT_OF_SCOPE: { label: 'Out of scope', bar: 'bg-slate-400' },
};

function Definition({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-slate-400 hover:text-slate-600">
      <Icon name="info" className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function MetricCard({
  label,
  value,
  definition,
  testId,
}: {
  label: string;
  value: string;
  definition?: string;
  testId?: string;
}) {
  return (
    <Card className="space-y-1" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label} {definition && <Definition text={definition} />}
      </p>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
    </Card>
  );
}

export function DecisionDistributionBar({ data }: { data: Data }) {
  const total = data.decisionDistribution.reduce((n, d) => n + d.count, 0);
  return (
    <Card className="space-y-3" data-testid="decision-distribution">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        Decisions <Definition text={data.definitions.decisionDistribution ?? ''} />
        <span className="ml-auto text-xs font-normal text-slate-500">{total} turns</span>
      </p>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {total > 0 &&
          data.decisionDistribution.map((d) =>
            d.count > 0 ? (
              <span
                key={d.decision}
                className={DECISION_STYLE[d.decision].bar}
                style={{ width: `${(d.count / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {data.decisionDistribution.map((d) => (
          <li key={d.decision}>
            <Link
              href={`/admin/traces?decision=${d.decision}`}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50"
            >
              <span className={`h-2.5 w-2.5 rounded-sm ${DECISION_STYLE[d.decision].bar}`} />
              <span className="text-slate-700">{DECISION_STYLE[d.decision].label}</span>
              <span className="ml-auto text-slate-900 tabular-nums">
                {d.count}
                {total > 0 && (
                  <span className="ml-1 text-xs text-slate-500">({pct(d.count / total)})</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EscalationByCategoryTable({ data }: { data: Data }) {
  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        Escalations by category <Definition text={data.definitions.escalationByCategory ?? ''} />
      </p>
      {data.escalationByCategory.length === 0 ? (
        <p className="text-sm text-slate-500">No tickets in this range.</p>
      ) : (
        <table className="w-full text-sm" data-testid="escalation-by-category">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="py-1 font-medium">
                Category
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Tickets
              </th>
              <th scope="col" className="w-2/5 py-1 pl-4 font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.escalationByCategory.map((c) => (
              <tr key={c.category}>
                <td className="py-1.5 text-slate-800">{fieldLabel(c.category)}</td>
                <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                <td className="py-1.5 pl-4">
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${c.rate * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-right text-xs text-slate-500 tabular-nums">
                      {pct(c.rate)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function LatencyCostCard({ data }: { data: Data }) {
  const rows: [string, string][] = [
    ['First token, p50', secs(data.latency.ttftP50)],
    ['First token, p90', secs(data.latency.ttftP90)],
    ['Whole turn, p50', secs(data.latency.totalP50)],
    ['Whole turn, p90', secs(data.latency.totalP90)],
    ['Cost per conversation', `$${data.costPerConversationUsd.toFixed(4)}`],
  ];
  return (
    <Card className="space-y-3" data-testid="latency-cost">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        Latency and cost <Definition text={data.definitions.latency ?? ''} />
      </p>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-slate-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function OverviewView({ data }: { data: Data }) {
  const d = data.definitions;
  if (data.conversations === 0) {
    return (
      <EmptyState
        title="No conversations in range"
        description="Pick a longer range, or come back after employees have used the copilot."
        icon="grid"
      />
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Conversations"
          value={String(data.conversations)}
          definition={d.conversations}
          testId="metric-conversations"
        />
        <MetricCard
          label="Confirmed resolution"
          value={pct(data.confirmedResolutionRate)}
          definition={d.confirmedResolutionRate}
          testId="metric-resolution"
        />
        <MetricCard
          label="Escalation rate"
          value={pct(data.escalationRate)}
          definition={d.escalationRate}
          testId="metric-escalation"
        />
        <MetricCard
          label="Sensitive handoffs"
          value={String(data.sensitiveHandoffs)}
          definition={d.sensitiveHandoffs}
          testId="metric-sensitive"
        />
        <MetricCard
          label="Agent override rate"
          value={pct(data.overrideRate)}
          definition={d.overrideRate}
          testId="metric-override"
        />
        <MetricCard
          label="Thumbs-down rate"
          value={pct(data.thumbsDownRate)}
          definition={d.thumbsDownRate}
          testId="metric-thumbs-down"
        />
        <MetricCard
          label="Whole turn, p90"
          value={secs(data.latency.totalP90)}
          definition={d.latency}
          testId="metric-latency"
        />
        <MetricCard
          label="Cost per conversation"
          value={`$${data.costPerConversationUsd.toFixed(4)}`}
          definition={d.costPerConversationUsd}
          testId="metric-cost"
        />
      </div>
      <DecisionDistributionBar data={data} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EscalationByCategoryTable data={data} />
        <LatencyCostCard data={data} />
      </div>
    </div>
  );
}

const DAY_MS = 86_400_000;
const isoDaysAgo = (to: string, days: number) =>
  new Date(Date.parse(`${to}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);

export function AdminOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.metricsOverview({ from, to }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [from, to]);

  useEffect(() => void load(), [load]);

  const setRange = (next: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (next.from) q.set('from', next.from);
    if (next.to) q.set('to', next.to);
    router.replace(q.toString() ? `${pathname}?${q}` : pathname);
  };
  const end = data?.range.to ?? to ?? new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description="Service desk and AI health. Evaluation runs are excluded."
        actions={
          <div
            className="flex flex-wrap items-center gap-2 text-sm text-slate-600"
            data-testid="date-range"
          >
            {[7, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange({ from: isoDaysAgo(end, days - 1), to: end })}
                className="h-9 rounded-lg px-3 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Last {days} days
              </button>
            ))}
            <label className="flex items-center gap-1">
              From
              <input
                type="date"
                data-testid="range-from"
                value={data?.range.from ?? from ?? ''}
                onChange={(e) => setRange({ from: e.target.value, to: data?.range.to ?? to })}
                className="h-9 rounded-lg border border-slate-300 px-2"
              />
            </label>
            <label className="flex items-center gap-1">
              To
              <input
                type="date"
                data-testid="range-to"
                value={data?.range.to ?? to ?? ''}
                onChange={(e) => setRange({ from: data?.range.from ?? from, to: e.target.value })}
                className="h-9 rounded-lg border border-slate-300 px-2"
              />
            </label>
          </div>
        }
      />
      {error && (
        <ErrorState
          title="Could not load the metrics"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !data && (
        <div
          role="status"
          aria-label="Loading metrics"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}
      {data && <OverviewView data={data} />}
    </>
  );
}

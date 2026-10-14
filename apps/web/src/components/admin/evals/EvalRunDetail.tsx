'use client';

// One eval run (W4-05, playbook section 10): progress while it runs, then the
// targets, metrics, per-category breakdown, the decision confusion matrix (full
// suite) and the cases — failed ones first, each with expected vs actual.
import { DECISIONS, type EvalResult, type EvalRunDetail as Run } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { duration, isActive, POLL_MS, RunStatus } from './EvalRuns';

const fmt = (key: string, v: number) =>
  /recall|rate|accuracy|precision|share|mrr/i.test(key) && v <= 1
    ? `${(v * 100).toFixed(1)}%`
    : Number.isInteger(v)
      ? String(v)
      : v.toFixed(3);
const label = (key: string) =>
  key
    .replace(/\./g, ' · ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/At5/g, '@5')
    .replace(/^./, (c) => c.toUpperCase());

/** A target's measured value: same key, or e.g. fusedRecallAt5 → fused.recallAt5. */
function metricFor(metrics: Record<string, number>, key: string): number | undefined {
  if (metrics[key] !== undefined) return metrics[key];
  const m = /^([a-z]+)([A-Z].*)$/.exec(key);
  return m ? metrics[`${m[1]}.${m[2]!.charAt(0).toLowerCase()}${m[2]!.slice(1)}`] : undefined;
}

function TargetCards({ run }: { run: Run }) {
  const entries = Object.entries(run.targets);
  if (entries.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="target-cards">
      {entries.map(([key, t]) => {
        const value = metricFor(run.metrics, key);
        return (
          <Card key={key} className={`space-y-1 ${t.met ? '' : 'ring-1 ring-amber-300'}`}>
            <p className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span className="truncate" title={key}>
                {label(key)}
              </span>
              {t.met ? <Badge tone="success">Met</Badge> : <Badge tone="warning">Missed</Badge>}
            </p>
            <p className="text-2xl font-semibold text-slate-900 tabular-nums">
              {value === undefined ? '—' : fmt(key, value)}
            </p>
            <p className="text-xs text-slate-500">Target {fmt(key, t.target)}</p>
          </Card>
        );
      })}
    </div>
  );
}

function CategoryBreakdown({ run }: { run: Run }) {
  const categories = Object.entries(run.perCategory);
  if (categories.length === 0) return null;
  const keys = [...new Set(categories.flatMap(([, m]) => Object.keys(m)))].slice(0, 6);
  return (
    <Card className="overflow-x-auto" data-testid="category-breakdown">
      <p className="mb-3 text-sm font-semibold text-slate-900">By category</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th scope="col" className="py-1 pr-4 font-medium">
              Category
            </th>
            {keys.map((k) => (
              <th
                key={k}
                scope="col"
                className="py-1 pr-4 text-right font-medium whitespace-nowrap"
              >
                {label(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {categories.map(([cat, m]) => (
            <tr key={cat}>
              <td className="py-1.5 pr-4 font-medium text-slate-800">{cat}</td>
              {keys.map((k) => (
                <td key={k} className="py-1.5 pr-4 text-right tabular-nums">
                  {m[k] === undefined ? '—' : fmt(k, m[k]!)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Expected decision (rows) vs actual (columns) over every case of a full-suite run. */
function ConfusionMatrix({ results }: { results: EvalResult[] }) {
  const counts = new Map<string, number>();
  for (const r of results) {
    const expected = typeof r.expected.decision === 'string' ? r.expected.decision : null;
    if (!expected) continue;
    const key = `${expected}|${r.actual.decision ?? 'NONE'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const cols = [...DECISIONS, 'NONE'];
  return (
    <Card className="overflow-x-auto" data-testid="confusion-matrix">
      <p className="mb-3 text-sm font-semibold text-slate-900">
        Decisions: expected (rows) × actual (columns)
      </p>
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} scope="col" className="px-2 py-1 font-medium text-slate-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DECISIONS.map((row) => (
            <tr key={row}>
              <th scope="row" className="py-1 pr-3 text-left font-medium text-slate-600">
                {row}
              </th>
              {cols.map((col) => {
                const n = counts.get(`${row}|${col}`) ?? 0;
                return (
                  <td
                    key={col}
                    className={`px-2 py-1 text-center tabular-nums ${
                      n === 0
                        ? 'text-slate-300'
                        : row === col
                          ? 'bg-emerald-50 font-semibold text-emerald-800'
                          : 'bg-rose-50 font-semibold text-rose-800'
                    }`}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CaseRow({ r }: { r: EvalResult }) {
  return (
    <li data-testid="case-row">
      <details className="group px-4 py-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono text-xs font-semibold text-slate-900">{r.caseId}</span>
          <span className="text-xs text-slate-500">{r.category}</span>
          {r.passed ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Fail</Badge>}
          <span className="flex flex-wrap gap-1">
            {r.failureReasons.map((f) => (
              <Badge key={f} tone="warning">
                <span className="font-mono">{f}</span>
              </Badge>
            ))}
          </span>
          <span className="ml-auto text-xs text-slate-400 tabular-nums">
            {duration(r.latencyMs)}
          </span>
          <Icon
            name="chevronDown"
            className="h-4 w-4 text-slate-400 transition group-open:rotate-180"
          />
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Expected</p>
            <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
              {JSON.stringify(r.expected, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Actual</p>
            <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
              {JSON.stringify({ ...r.actual, scores: r.scores, trace: r.traceRef }, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </li>
  );
}

export function EvalRunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [category, setCategory] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.evalRun(runId);
      setRun(r);
      setError(null);
      if (!isActive(r)) {
        // Every case of the run (≤ 100 per page; the golden set has under 100 per suite).
        const items: EvalResult[] = [];
        let cursor: string | undefined;
        do {
          const page = await api.evalResults(runId, { limit: 100, cursor });
          items.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        setResults(items);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [runId]);

  useEffect(() => void load(), [load]);
  const active = run ? isActive(run) : false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const categories = useMemo(
    () => [...new Set((results ?? []).map((r) => r.category))].sort(),
    [results],
  );
  const shown = (results ?? []).filter(
    (r) => (!onlyFailed || !r.passed) && (!category || r.category === category),
  );
  const failedCount = (results ?? []).filter((r) => !r.passed).length;

  return (
    <>
      <Link
        href="/admin/evals"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <Icon name="chevronLeft" className="h-4 w-4" /> All runs
      </Link>
      <PageHeader
        eyebrow="Evaluation run"
        title={
          run
            ? `${run.suite === 'full' ? 'Full graph' : run.suite === 'judge' ? 'Judge' : 'Retrieval'} · ${runId.slice(-8)}`
            : 'Evaluation run'
        }
        description={
          run ? (
            <span className="flex flex-wrap items-center gap-2">
              <RunStatus run={run} />
              <span>
                by {run.triggeredBy} · {new Date(run.startedAt).toLocaleString()} ·{' '}
                {duration(run.durationMs)} · ${run.costUsd.toFixed(4)}
                {run.modelMode && ` · ${run.modelMode === 'local' ? 'local model' : 'Pro models'}`}
                {run.configSnapshot.gitCommit !== 'pending' && ` · ${run.configSnapshot.gitCommit}`}
              </span>
            </span>
          ) : undefined
        }
      />
      {error && (
        <ErrorState
          title={error.status === 404 ? 'Run not found' : 'Could not load the run'}
          message={error.message}
          requestId={error.requestId}
          onRetry={error.status === 404 ? undefined : () => void load()}
        />
      )}
      {!error && !run && <Skeleton className="h-40 rounded-2xl" />}

      {run && active && (
        <Card className="space-y-3" data-testid="run-progress" role="status">
          <p className="text-sm font-medium text-slate-900">
            {run.status === 'queued'
              ? 'Starting the runner…'
              : `Running case ${Math.min(run.completedCases + 1, run.caseCount)} of ${run.caseCount}`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{
                width: `${run.caseCount ? (run.completedCases / run.caseCount) * 100 : 5}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-500">This page refreshes every 5 seconds.</p>
        </Card>
      )}
      {run?.status === 'failed' && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm whitespace-pre-wrap text-rose-800"
        >
          The run stopped with an error: {run.error ?? 'unknown error'}
        </p>
      )}

      {run && !active && (
        <div className="space-y-5">
          <TargetCards run={run} />
          <CategoryBreakdown run={run} />
          {run.suite === 'full' && results && <ConfusionMatrix results={results} />}
          {results && (
            <Card className="p-0" data-testid="case-table">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  Cases{' '}
                  <span className="font-normal text-slate-500">
                    ({failedCount} failed of {results.length})
                  </span>
                </p>
                <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyFailed}
                    onChange={(e) => setOnlyFailed(e.target.checked)}
                  />
                  Failed only
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 rounded-lg border border-slate-300 bg-surface px-2 text-sm"
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  {onlyFailed && failedCount === 0 ? 'Every case passed.' : 'No cases match.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <CaseRow key={r.id} r={r} />
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}

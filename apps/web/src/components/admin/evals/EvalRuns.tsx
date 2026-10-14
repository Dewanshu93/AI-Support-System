'use client';

// Evaluation runs (W4-05, playbook section 10): every golden-set run (UI and CLI)
// with its result, a dialog to start one (one at a time), and progress polling
// every 5 s while a run is queued or running.
import type { EvalRunSummary } from '@sd/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';

export const POLL_MS = 5000;
const SUITE_LABEL = { retrieval: 'Retrieval', full: 'Full graph', judge: 'Judge' } as const;

export const isActive = (r: Pick<EvalRunSummary, 'status'>) =>
  r.status === 'queued' || r.status === 'running';

export function RunStatus({ run }: { run: EvalRunSummary }) {
  if (run.status === 'queued') return <Badge tone="info">Queued</Badge>;
  if (run.status === 'running')
    return (
      <span className="inline-flex items-center gap-2">
        <Badge tone="info">Running</Badge>
        <span className="text-xs text-slate-500 tabular-nums">
          {run.completedCases}/{run.caseCount || '…'}
        </span>
      </span>
    );
  if (run.status === 'failed') return <Badge tone="danger">Error</Badge>;
  return run.passed ? (
    <Badge tone="success">Passed</Badge>
  ) : (
    <Badge tone="warning">Failed targets</Badge>
  );
}

export const duration = (ms: number | null) =>
  ms === null
    ? '—'
    : ms >= 60_000
      ? `${Math.round(ms / 60_000)} min`
      : `${(ms / 1000).toFixed(1)} s`;

function StartRunDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [suite, setSuite] = useState<'retrieval' | 'full'>('retrieval');
  const [tags, setTags] = useState('');
  const [cases, setCases] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ids = list(cases);
      const tagList = list(tags);
      onStarted(
        await api.startEvalRun({
          suite,
          ...(tagList.length > 0 && { tags: tagList }),
          ...(ids.length > 0 && { caseIds: ids }),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The run could not be started.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-run-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 animate-fade bg-slate-900/30 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative w-full max-w-lg animate-rise space-y-4 rounded-2xl bg-surface p-6 shadow-2xl"
        data-testid="start-run-dialog"
      >
        <div>
          <h2 id="start-run-title" className="text-lg font-semibold text-slate-900">
            Start an evaluation run
          </h2>
          <p className="text-sm text-slate-500">
            Runs the golden set against the live index. Models follow your Pro switch: on uses the
            paid models (costs quota), off uses the local model (slower).
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Suite</legend>
          {(
            [
              [
                'retrieval',
                'Retrieval',
                'Recall@5 and leakage per search mode, with rerank. Minutes.',
              ],
              [
                'full',
                'Full graph',
                'Every case through the copilot: decisions, citations, key facts. Long.',
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${suite === value ? 'border-brand-300 bg-brand-50' : 'border-slate-200'}`}
            >
              <input
                type="radio"
                name="suite"
                value={value}
                checked={suite === value}
                onChange={() => setSuite(value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Tags <span className="font-normal text-slate-400">(optional, e.g. smoke, table)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm"
            placeholder="smoke"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Case ids <span className="font-normal text-slate-400">(optional)</span>
          <input
            value={cases}
            onChange={(e) => setCases(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-300 bg-surface px-3 font-mono text-sm"
            placeholder="HR-ANS-001, IT-ANS-004"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Starting…' : 'Start run'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function EvalRuns() {
  const router = useRouter();
  const [runs, setRuns] = useState<EvalRunSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRuns((await api.evalRuns({ limit: 50 })).items);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, []);

  useEffect(() => void load(), [load]);
  const active = runs?.some(isActive) ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Evaluation"
        description="Golden-set runs with their targets. Runs from the command line appear here too."
        actions={
          <Button
            onClick={() => setStarting(true)}
            disabled={active}
            title={active ? 'A run is in progress' : undefined}
          >
            <Icon name="sparkles" className="h-4 w-4" /> Start run
          </Button>
        }
      />
      {error && (
        <ErrorState
          title="Could not load eval runs"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !runs && (
        <div role="status" aria-label="Loading eval runs" className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      )}
      {runs && runs.length === 0 && (
        <EmptyState
          title="No runs yet — start one"
          description="A retrieval run with the smoke tag takes about a minute."
          icon="checkCircle"
          action={<Button onClick={() => setStarting(true)}>Start run</Button>}
        />
      )}
      {runs && runs.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="run-table">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                {['Run', 'Result', 'Cases', 'Models', 'Started', 'Duration', 'Cost'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50" data-testid="run-row">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/evals/${r.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {SUITE_LABEL[r.suite]}
                      <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
                        {r.id.slice(-8)}
                      </span>
                    </Link>
                    <span className="block text-[11px] text-slate-400">
                      by {r.triggeredBy}
                      {r.filter &&
                        r.filter.tags.length > 0 &&
                        ` · tags ${r.filter.tags.join(', ')}`}
                      {r.filter &&
                        r.filter.caseIds.length > 0 &&
                        ` · ${r.filter.caseIds.length} cases`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <RunStatus run={r} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{r.caseCount || '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                    {r.modelMode === 'local'
                      ? 'Local'
                      : r.modelMode === 'pro'
                        ? 'Pro'
                        : 'Configured'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                    {new Date(r.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{duration(r.durationMs)}</td>
                  <td className="px-4 py-2.5 tabular-nums">${r.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {starting && (
        <StartRunDialog
          onClose={() => setStarting(false)}
          onStarted={(id) => {
            setStarting(false);
            router.push(`/admin/evals/${id}`);
          }}
        />
      )}
    </>
  );
}

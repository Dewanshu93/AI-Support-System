'use client';

// Conversation trace (W4-03, playbook sections 3 and 10): the turn timeline and,
// for the selected turn, every trace field in five tabs. User text is the
// redacted input. Opening the page and each trace is audited by the API.
import type { ConversationTracesResponse, TraceCandidate, TraceDetail } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { DecisionBadge, STATUS_LABEL } from './ConversationTable';

type Data = ConversationTracesResponse;
type Turn = Data['turns'][number];

const TABS = ['Analysis', 'Retrieval', 'Decision', 'Output', 'LLM calls'] as const;
type Tab = (typeof TABS)[number];

const ms = (n: number | null) =>
  n === null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
const usd = (n: number) => `$${n.toFixed(5)}`;
const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Chips({
  items,
  tone = 'neutral',
}: {
  items: string[];
  tone?: 'neutral' | 'danger' | 'success' | 'warning' | 'brand';
}) {
  if (items.length === 0) return <span className="text-slate-400">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((i) => (
        <Badge key={i} tone={tone}>
          <span className="font-mono">{i}</span>
        </Badge>
      ))}
    </span>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="scrollbar-thin max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function CandidateList({
  title,
  items,
  scoreLabel,
}: {
  title: string;
  items: TraceCandidate[];
  scoreLabel: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title} <span className="font-normal normal-case">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No candidates.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
          {items.map((c, i) => (
            <li key={`${c.chunkId}-${i}`}>
              <details className="group px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm">
                  <span className="w-6 text-xs text-slate-400 tabular-nums">{c.rank ?? i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {c.docTitle ?? <span className="text-slate-400">Chunk not found</span>}
                    {c.sectionPath.length > 0 && (
                      <span className="text-slate-500"> › {c.sectionPath.join(' › ')}</span>
                    )}
                  </span>
                  <span
                    className="font-mono text-xs text-slate-600 tabular-nums"
                    title={scoreLabel}
                  >
                    {Number.isInteger(c.score) ? c.score : c.score.toFixed(4)}
                  </span>
                  <Icon
                    name="chevronDown"
                    className="h-4 w-4 text-slate-400 transition group-open:rotate-180"
                  />
                </summary>
                <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">
                  {c.text ?? 'The chunk is no longer in the index.'}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-400">chunk {c.chunkId}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TraceTabs({ trace }: { trace: TraceDetail }) {
  const [tab, setTab] = useState<Tab>('Analysis');
  const r = trace.retrieval;
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Trace sections"
        className="flex flex-wrap gap-1 border-b border-slate-100"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={tab}
        data-testid={`trace-tab-${tab.toLowerCase().replace(' ', '-')}`}
      >
        {tab === 'Analysis' && (
          <dl className="space-y-3">
            <Field label="Sensitive pre-check">
              {trace.precheck.sensitiveHit ? <Badge tone="danger">Hit</Badge> : 'No hit'}
            </Field>
            <Field label="Safety pre-check">
              {trace.precheck.safetyHit ? <Badge tone="danger">Hit</Badge> : 'No hit'}
            </Field>
            <Field label="Matched rules">
              <Chips items={trace.precheck.matchedRules} tone="warning" />
            </Field>
            <Field label="Profile snapshot">
              {trace.profileSnapshot.country} · {trace.profileSnapshot.employmentType} ·{' '}
              {trace.profileSnapshot.accessLevel} · {trace.profileSnapshot.department}
            </Field>
            <Field label="Turn analysis (P-1)">
              {trace.analysis ? (
                <Json value={trace.analysis} />
              ) : (
                <span className="text-slate-400">Not run</span>
              )}
            </Field>
          </dl>
        )}

        {tab === 'Retrieval' &&
          (r ? (
            <div className="space-y-5">
              <dl className="space-y-3">
                <Field label="Search query">
                  <span className="font-mono text-xs">{r.query}</span>
                </Field>
                <Field label="Coverage">
                  <Badge
                    tone={
                      r.coverage === 'full'
                        ? 'success'
                        : r.coverage === 'none'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {r.coverage}
                  </Badge>
                </Field>
                <Field label="Access filter">
                  <Json value={r.filter} />
                </Field>
              </dl>
              <CandidateList title="Vector" items={r.vector} scoreLabel="Cosine similarity" />
              <CandidateList title="Keyword (BM25)" items={r.keyword} scoreLabel="BM25 score" />
              <CandidateList
                title="Fused (RRF)"
                items={r.fused}
                scoreLabel="Reciprocal rank fusion score"
              />
              <CandidateList
                title="Reranked"
                items={r.reranked}
                scoreLabel="Rerank relevance (0–3)"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No retrieval for this turn (decided before search).
            </p>
          ))}

        {tab === 'Decision' && (
          <dl className="space-y-3">
            <Field label="Decision">
              <DecisionBadge decision={trace.decision.value} />
            </Field>
            <Field label="Reason code">
              <span className="font-mono text-xs">{trace.decision.reasonCode}</span>
            </Field>
            <Field label="Rules fired">
              <Chips items={trace.decision.rulesFired} tone="brand" />
            </Field>
            <Field label="Thresholds">
              {Object.keys(trace.decision.thresholds).length === 0 ? (
                <span className="text-slate-400">None</span>
              ) : (
                <table className="text-sm">
                  <tbody>
                    {Object.entries(trace.decision.thresholds).map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-6 font-mono text-xs text-slate-600">{k}</td>
                        <td className="tabular-nums">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Field>
          </dl>
        )}

        {tab === 'Output' && (
          <dl className="space-y-3">
            <Field label="Citations proposed">
              <Chips items={trace.output.citationsProposed} />
            </Field>
            <Field label="Citations valid">
              <Chips items={trace.output.citationsValid} tone="success" />
            </Field>
            <Field label="Citations rejected">
              <Chips items={trace.output.citationsRejected} tone="danger" />
            </Field>
            <Field label="Numeric violations">
              <Chips items={trace.output.numericViolations} tone="danger" />
            </Field>
            <Field label="Answer withdrawn">
              {trace.output.withdrawn ? <Badge tone="danger">Withdrawn</Badge> : 'No'}
            </Field>
          </dl>
        )}

        {tab === 'LLM calls' && (
          <div className="space-y-5">
            {trace.llmCalls.length === 0 ? (
              <p className="text-sm text-slate-500">No model calls in this turn.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="llm-calls">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      {[
                        'Node',
                        'Prompt',
                        'Model',
                        'Tokens in / out',
                        'Cost',
                        'Latency',
                        'Retries',
                        'Error',
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="py-1.5 pr-4 font-medium whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trace.llmCalls.map((c, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-4 font-mono text-xs">{c.node}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">
                          {c.promptName} v{c.promptVersion}
                          <span className="block font-mono text-[11px] text-slate-400">
                            {c.promptHash.slice(0, 12)}
                          </span>
                        </td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">
                          {c.model}
                          <span className="block text-[11px] text-slate-400">{c.provider}</span>
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums">
                          {c.inputTokens} / {c.outputTokens}
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums">{usd(c.costUsd)}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{ms(c.latencyMs)}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{c.retries}</td>
                        <td className="py-1.5 text-xs text-rose-700">{c.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <dl className="space-y-3">
              <Field label="Whole turn">{ms(trace.totalLatencyMs)}</Field>
              <Field label="First token">{ms(trace.ttftMs)}</Field>
              <Field label="Total cost">{usd(trace.totalCostUsd)}</Field>
              <Field label="Step latency">
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(trace.stepLatencyMs).map(([k, v]) => (
                    <span key={k} className="text-xs">
                      <span className="font-mono text-slate-500">{k}</span> {ms(v)}
                    </span>
                  ))}
                </span>
              </Field>
              <Field label="Errors">
                {trace.errors.length === 0 ? (
                  <span className="text-slate-400">None</span>
                ) : (
                  <ul className="space-y-1">
                    {trace.errors.map((e, i) => (
                      <li key={i} className="text-xs text-rose-700">
                        <span className="font-mono">{e.node}</span> · {e.code}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function TracePanel({ turn }: { turn: Turn }) {
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setTrace(null);
    setError(null);
    try {
      setTrace(await api.trace(turn.traceId));
    } catch (err) {
      setError(toError(err));
    }
  }, [turn.traceId]);

  useEffect(() => void load(), [load]);

  return (
    <Card className="min-w-0 space-y-4" data-testid="trace-panel">
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Employee (personal details removed)</p>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {turn.userMessage}
        </p>
        <p className="text-xs font-medium text-slate-500">Assistant</p>
        <p className="rounded-lg border border-slate-200/80 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800">
          {turn.assistantMessage || <span className="text-slate-400">No reply text.</span>}
        </p>
      </div>
      {error && (
        <ErrorState
          title="Could not load the trace"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !trace && (
        <div role="status" aria-label="Loading trace" className="space-y-2">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}
      {trace && (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-400">
            <span>trace {trace.id}</span>
            <span>run {trace.graphRunId}</span>
            <span>message {trace.messageId}</span>
            <span>user {trace.userId}</span>
            <span>{time(trace.createdAt)}</span>
            {trace.restricted && <span className="text-rose-600">restricted</span>}
            {trace.isEval && <span>evaluation</span>}
          </p>
          <TraceTabs trace={trace} />
        </>
      )}
    </Card>
  );
}

function TurnTimeline({
  turns,
  selected,
  onSelect,
}: {
  turns: Turn[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="space-y-2" data-testid="turn-timeline">
      {turns.map((t, i) => {
        const s = t.traceSummary;
        const active = t.traceId === selected;
        return (
          <li key={t.traceId}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(t.traceId)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? 'border-brand-300 bg-brand-50'
                  : 'border-slate-200/80 bg-surface hover:border-slate-300'
              }`}
            >
              <span className="flex items-center gap-2 text-xs text-slate-500">
                Turn {i + 1} · {time(t.createdAt)}
                <span className="ml-auto">
                  <DecisionBadge decision={s.decision} />
                </span>
              </span>
              <span className="mt-1 line-clamp-2 block text-sm text-slate-800">
                {t.userMessage}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-1">
                {s.safetyHit && <Badge tone="danger">Safety</Badge>}
                {s.sensitiveHit && <Badge tone="danger">Sensitive</Badge>}
                {s.withdrawn && <Badge tone="warning">Withdrawn</Badge>}
                {s.citationsRejected > 0 && (
                  <Badge tone="warning">{s.citationsRejected} rejected</Badge>
                )}
                {s.errorCount > 0 && (
                  <Badge tone="danger">
                    {s.errorCount} error{s.errorCount === 1 ? '' : 's'}
                  </Badge>
                )}
                <span className="text-[11px] text-slate-400">
                  {ms(s.totalLatencyMs)} · {s.llmCallCount} call{s.llmCallCount === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function TraceViewer({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const res = await api.conversationTraces(conversationId);
      setData(res);
      setSelected(res.turns[0]?.traceId ?? null);
    } catch (err) {
      setError(toError(err));
    }
  }, [conversationId]);

  useEffect(() => void load(), [load]);

  const c = data?.conversation;
  const current = data?.turns.find((t) => t.traceId === selected) ?? null;

  return (
    <>
      <Link
        href="/admin/traces"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <Icon name="chevronLeft" className="h-4 w-4" /> All conversations
      </Link>
      <PageHeader
        eyebrow="Trace"
        title={c ? c.title || 'Untitled conversation' : 'Conversation trace'}
        description={
          c ? (
            <span className="flex flex-wrap items-center gap-2">
              {c.userName} · {STATUS_LABEL[c.status]} · {c.turnCount} turn
              {c.turnCount === 1 ? '' : 's'}
              {c.restricted && <Badge tone="danger">Confidential</Badge>}
            </span>
          ) : undefined
        }
      />
      {error && (
        <ErrorState
          title={
            error.status === 404 ? 'Conversation not found' : 'Could not load the conversation'
          }
          message={error.message}
          requestId={error.requestId}
          onRetry={error.status === 404 ? undefined : () => void load()}
        />
      )}
      {!error && !data && (
        <div
          role="status"
          aria-label="Loading conversation"
          className="grid gap-5 lg:grid-cols-[20rem_1fr]"
        >
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      )}
      {c?.ticket && (
        <Card
          className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          data-testid="trace-ticket"
        >
          <span className="font-mono font-semibold text-slate-900">{c.ticket.humanId}</span>
          <span className="text-slate-600">
            Queue <span className="font-mono text-xs">{c.ticket.queue}</span>
          </span>
          <span className="text-slate-600">
            Priority{' '}
            <span className="font-semibold text-slate-900 capitalize">{c.ticket.priority}</span>
          </span>
          <span className="text-slate-600">
            AI proposed <span className="capitalize">{c.ticket.aiUrgency}</span>
          </span>
          <span className="text-slate-600">
            Priority floor{' '}
            {c.ticket.priorityFloorApplied ? (
              <Badge tone="warning">
                <span className="font-mono">{c.ticket.priorityFloorApplied}</span>
              </Badge>
            ) : (
              'none'
            )}
          </span>
        </Card>
      )}
      {data && data.turns.length === 0 && (
        <p className="text-sm text-slate-500">This conversation has no traced turns yet.</p>
      )}
      {data && current && (
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <TurnTimeline turns={data.turns} selected={current.traceId} onSelect={setSelected} />
          <TracePanel key={current.traceId} turn={current} />
        </div>
      )}
    </>
  );
}

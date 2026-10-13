'use client';

// Trace viewer list (W4-03, playbook section 10): every conversation with
// filters kept in the URL (the overview's decision legend links here), paged
// with "Load more". Evaluation runs are never listed.
import {
  type AdminConversation,
  CONVERSATION_STATUSES,
  type ConversationStatus,
  DECISIONS,
  type Decision,
} from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DECISION_STYLE } from '@/components/admin/overview/AdminOverview';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  escalated: 'Escalated',
  handed_off: 'Handed off',
  abandoned: 'Abandoned',
};

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return <span className="text-xs text-slate-400">—</span>;
  const style = DECISION_STYLE[decision];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${style.bar}`} />
      {style.label}
    </span>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const selectClass = 'h-9 rounded-lg border border-slate-300 bg-surface px-2 text-sm';

export function ConversationTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const decision = (params.get('decision') ?? '') as Decision | '';
  const status = (params.get('status') ?? '') as ConversationStatus | '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const [items, setItems] = useState<AdminConversation[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    (after?: string) =>
      api.adminConversations({
        decision: decision || undefined,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 25,
        cursor: after,
      }),
    [decision, status, from, to],
  );

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const page = await fetchPage();
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [fetchPage]);

  useEffect(() => void load(), [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (key: string, value: string) => {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(q.toString() ? `${pathname}?${q}` : pathname);
  };
  const filtered = Boolean(decision || status || from || to);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Traces"
        description="Every conversation with a turn-by-turn explanation of each AI decision. Opening one is recorded in the audit log."
      />
      <Card className="mb-4 flex flex-wrap items-end gap-3 text-sm" data-testid="trace-filters">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Decision
          <select
            value={decision}
            onChange={(e) => setFilter('decision', e.target.value)}
            className={selectClass}
          >
            <option value="">Any</option>
            {DECISIONS.map((d) => (
              <option key={d} value={d}>
                {DECISION_STYLE[d].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Status
          <select
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            className={selectClass}
          >
            <option value="">Any</option>
            {CONVERSATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFilter('from', e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setFilter('to', e.target.value)}
            className={selectClass}
          />
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
            Clear filters
          </Button>
        )}
      </Card>

      {error && (
        <ErrorState
          title="Could not load conversations"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !items && (
        <div role="status" aria-label="Loading conversations" className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <EmptyState
          title="No conversations"
          description={
            filtered
              ? 'Nothing matches these filters. Clear them to see every conversation.'
              : 'Conversations appear here once employees use the copilot.'
          }
          icon="list"
        />
      )}
      {items && items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="conversation-table">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Conversation
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Employee
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Last decision
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Turns
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Started
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50" data-testid="conversation-row">
                  <td className="max-w-80 px-4 py-2.5">
                    <Link
                      href={`/admin/traces/${c.id}`}
                      className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700"
                    >
                      <span className="truncate">{c.title || 'Untitled conversation'}</span>
                      {c.restricted && <Badge tone="danger">Confidential</Badge>}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{c.userName}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                    {STATUS_LABEL[c.status]}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <DecisionBadge decision={c.lastDecision} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.turnCount}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-slate-500">
                    {when(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {cursor && items && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </>
  );
}

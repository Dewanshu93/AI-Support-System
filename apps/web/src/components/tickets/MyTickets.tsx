'use client';

// Request tracker (Build Contract v2.0 flow 7): the employee's requests as a
// list or a board by stage, a status filter kept in the URL (?status=) and
// "Load more" pagination.
import { TICKET_STATUSES, type TicketListResponse, type TicketStatus } from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { RequestStepper } from '@/components/workspace/RequestStepper';
import { REQUEST_FLOW } from '@/components/workspace/styles';
import { ViewToggle } from '@/components/workspace/ViewToggle';
import { api, ApiError } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from './ticketLabels';

type Item = TicketListResponse['items'][number];

const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

export function TicketRows({ items }: { items: Item[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-card">
      <div className="hidden grid-cols-[7rem_1fr_7rem_10rem_9rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-semibold text-slate-500 md:grid">
        <span>Request</span>
        <span>Summary</span>
        <span>Priority</span>
        <span>Stage</span>
        <span className="text-right">Updated</span>
      </div>
      <ul data-testid="ticket-list" className="divide-y divide-slate-100">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              href={`/tickets/${t.id}`}
              data-testid="ticket-row"
              data-human-id={t.humanId}
              className="grid grid-cols-1 gap-2 px-5 py-3.5 transition hover:bg-slate-50 md:grid-cols-[7rem_1fr_7rem_10rem_9rem] md:items-center md:gap-4"
            >
              <span className="font-mono text-sm font-semibold text-slate-900">{t.humanId}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate-800">{t.summary}</span>
                <span className="mt-1.5 block max-w-56">
                  <RequestStepper status={t.status} />
                </span>
              </span>
              <span>
                <Badge tone={PRIORITY_TONE[t.priority]}>{priorityLabel(t.priority)}</Badge>
              </span>
              <span>
                <Badge tone={STATUS_TONE[t.status]} dot>
                  {STATUS_LABEL[t.status]}
                </Badge>
              </span>
              <span className="text-xs text-slate-500 md:text-right">
                {relativeTime(t.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Board({ items }: { items: Item[] }) {
  const columns = REQUEST_FLOW.map((step) => ({
    ...step,
    items: items.filter((t) =>
      step.status === 'resolved'
        ? t.status === 'resolved' || t.status === 'closed'
        : t.status === step.status,
    ),
  }));
  return (
    <div data-testid="ticket-board" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => (
        <section
          key={col.status}
          aria-label={col.label}
          className="rounded-2xl bg-slate-100/70 p-3"
        >
          <header className="mb-3 flex items-center justify-between px-1">
            <Badge tone={STATUS_TONE[col.status]} dot>
              {col.label}
            </Badge>
            <span className="text-xs font-medium text-slate-500">{col.items.length}</span>
          </header>
          <ul className="space-y-2">
            {col.items.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="block rounded-xl border border-slate-200 bg-surface p-3.5 shadow-card transition hover:border-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-600">
                      {t.humanId}
                    </span>
                    <Badge tone={PRIORITY_TONE[t.priority]}>{priorityLabel(t.priority)}</Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium text-slate-900">
                    {t.summary}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Updated {relativeTime(t.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
            {col.items.length === 0 && (
              <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                None
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function MyTickets() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('status');
  const status = TICKET_STATUSES.find((s) => s === raw);

  const [items, setItems] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');

  const load = useCallback(async (filter: TicketStatus | undefined) => {
    setItems(null);
    setError(null);
    try {
      const page = await api.myTickets({ status: filter });
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(toError(err));
    }
  }, []);

  useEffect(() => void load(status), [load, status]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.myTickets({ status, cursor });
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(toError(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <>
      <PageHeader
        eyebrow="Requests"
        title="Request tracker"
        description="Requests raised from Copilot conversations, and where each one is."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Stage</span>
              <select
                data-testid="status-filter"
                value={status ?? ''}
                onChange={(e) => setFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-surface px-2.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none"
              >
                <option value="">All</option>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <ViewToggle value={view === 'board' ? 'board' : 'list'} onChange={setView} />
            <Link href="/chat">
              <Button variant="ai">
                <Icon name="sparkles" className="h-4 w-4" /> New request
              </Button>
            </Link>
          </>
        }
      />

      {error && (
        <ErrorState
          title="Could not load your requests"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load(status)}
        />
      )}
      {!error && items === null && (
        <div role="status" aria-label="Loading requests" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}
      {!error && items?.length === 0 && (
        <EmptyState
          title={status ? `No requests in "${STATUS_LABEL[status]}"` : 'No requests yet'}
          description="When Copilot cannot resolve something, it prepares a request for you to review."
          action={
            <Link href="/chat" className="text-sm font-medium text-brand-700 underline">
              Ask Copilot
            </Link>
          }
        />
      )}
      {!error && items && items.length > 0 && (
        <div className="space-y-4">
          {view === 'board' ? <Board items={items} /> : <TicketRows items={items} />}
          {cursor && (
            <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

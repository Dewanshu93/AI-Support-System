'use client';

// My Tickets (playbook section 10): the employee's tickets with status badges,
// a status filter kept in the URL (?status=) and "Load more" pagination.
import { TICKET_STATUSES, type TicketListResponse, type TicketStatus } from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, STATUS_LABEL, STATUS_TONE } from './ticketLabels';

type Item = TicketListResponse['items'][number];

const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

export function TicketRows({ items }: { items: Item[] }) {
  return (
    <ul
      data-testid="ticket-list"
      className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white"
    >
      {items.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tickets/${t.id}`}
            data-testid="ticket-row"
            data-human-id={t.humanId}
            className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <span className="font-mono text-sm font-semibold text-slate-900">{t.humanId}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{t.summary}</span>
            <Badge tone={PRIORITY_TONE[t.priority]}>{priorityLabel(t.priority)}</Badge>
            <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            <span className="text-xs text-slate-500">{formatDateTime(t.updatedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">My tickets</h1>
          <p className="text-sm text-slate-600">Tickets raised from your conversations.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Status
          <select
            data-testid="status-filter"
            value={status ?? ''}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <ErrorState
          title="Could not load your tickets"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load(status)}
        />
      )}
      {!error && items === null && (
        <div role="status" aria-label="Loading tickets" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}
      {!error && items?.length === 0 && (
        <EmptyState
          title={status ? `No ${STATUS_LABEL[status].toLowerCase()} tickets` : 'No tickets'}
          description="The hub resolved everything so far."
          action={
            <Link href="/chat" className="text-sm font-medium text-slate-900 underline">
              Ask a question
            </Link>
          }
        />
      )}
      {!error && items && items.length > 0 && (
        <>
          <TicketRows items={items} />
          {cursor && (
            <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

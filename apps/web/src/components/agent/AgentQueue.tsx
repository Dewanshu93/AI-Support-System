'use client';

// Agent queue (W3-07, playbook section 10): tickets in the agent's queues,
// critical first then oldest (sorted by the API), with filters kept in the URL.
import {
  type AgentTicketListResponse,
  type AuthUser,
  PRIORITIES,
  type Priority,
  TICKET_STATUSES,
  type TicketStatus,
} from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { STATUS_TONE } from '@/components/tickets/ticketLabels';
import { AGENT_STATUS_LABEL, ageLabel } from '@/lib/agentTicket';
import { api, ApiError } from '@/lib/api';
import { fieldLabel } from '@/lib/ticketDraft';

type Item = AgentTicketListResponse['items'][number];

const toError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.');

const SELECT =
  'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none';

export function QueueTable({ items }: { items: Item[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <table data-testid="queue-table" className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
            <th scope="col" className="px-4 py-2.5">
              Ticket
            </th>
            <th scope="col" className="px-4 py-2.5">
              Summary
            </th>
            <th scope="col" className="px-4 py-2.5">
              Priority
            </th>
            <th scope="col" className="px-4 py-2.5">
              Status
            </th>
            <th scope="col" className="px-4 py-2.5">
              Queue
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              Age
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((t) => (
            <tr
              key={t.id}
              data-testid="queue-row"
              data-human-id={t.humanId}
              className="hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                <Link href={`/agent/tickets/${t.id}`} className="text-slate-900 hover:underline">
                  {t.humanId}
                </Link>
                {t.restricted && (
                  <span
                    title="Confidential case"
                    className="ml-1.5 inline-block align-middle text-rose-600"
                  >
                    <Icon name="lock" className="h-3.5 w-3.5" aria-label="Confidential" />
                  </span>
                )}
              </td>
              <td className="max-w-md px-4 py-3">
                <Link
                  href={`/agent/tickets/${t.id}`}
                  className="block truncate text-slate-800 hover:underline"
                >
                  {t.summary}
                </Link>
                <span className="text-xs text-slate-500">{t.requesterName}</span>
              </td>
              <td className="px-4 py-3">
                <Badge tone={PRIORITY_TONE[t.priority]}>{priorityLabel(t.priority)}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[t.status]} dot>
                  {AGENT_STATUS_LABEL[t.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">{fieldLabel(t.queue)}</td>
              <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-slate-500">
                {ageLabel(t.ageMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = TICKET_STATUSES.find((s) => s === params.get('status')) as
    TicketStatus | undefined;
  const priority = PRIORITIES.find((p) => p === params.get('priority')) as Priority | undefined;
  const queue = params.get('queue') ?? undefined;

  const [me, setMe] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api.me().then(setMe, () => undefined);
  }, []);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const page = await api.agentQueue({ status, priority, queue });
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(toError(err));
    }
  }, [status, priority, queue]);

  useEffect(() => void load(), [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.agentQueue({ status, priority, queue, cursor });
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(toError(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const filtered = Boolean(status || priority || queue);

  return (
    <>
      <PageHeader
        eyebrow="Agent workspace"
        title="Queue"
        description="Requests in your queues, critical first, then oldest."
        actions={
          <>
            {me && me.queues.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span>Queue</span>
                <select
                  data-testid="queue-filter"
                  value={queue ?? ''}
                  onChange={(e) => setFilter('queue', e.target.value)}
                  className={SELECT}
                >
                  <option value="">All my queues</option>
                  {me.queues.map((q) => (
                    <option key={q} value={q}>
                      {fieldLabel(q)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Status</span>
              <select
                data-testid="queue-status-filter"
                value={status ?? ''}
                onChange={(e) => setFilter('status', e.target.value)}
                className={SELECT}
              >
                <option value="">All</option>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {AGENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Priority</span>
              <select
                data-testid="queue-priority-filter"
                value={priority ?? ''}
                onChange={(e) => setFilter('priority', e.target.value)}
                className={SELECT}
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {error && (
        <ErrorState
          title="Could not load the queue"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && items === null && (
        <div role="status" aria-label="Loading queue" className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      )}
      {!error && items?.length === 0 && (
        <EmptyState
          title={filtered ? 'No tickets match these filters' : 'Queue clear'}
          description={
            filtered ? 'Change or clear the filters.' : 'Nothing is waiting in your queues.'
          }
          icon="checkCircle"
        />
      )}
      {!error && items && items.length > 0 && (
        <div className="space-y-4">
          <QueueTable items={items} />
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

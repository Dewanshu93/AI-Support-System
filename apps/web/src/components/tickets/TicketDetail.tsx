'use client';

// One of the employee's tickets (playbook section 10): summary, status, the
// public timeline (team replies, status changes) and a link to the conversation.
// Internal notes and the agent brief never reach this view (API-enforced).
import type { TicketDetailResponse } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { fieldLabel, UNKNOWN } from '@/lib/ticketDraft';
import { TicketEmails } from './EmailCard';
import { EVENT_LABEL, formatDateTime, STATUS_LABEL, STATUS_TONE } from './ticketLabels';

export function TicketDetailView({ data }: { data: TicketDetailResponse }) {
  const { ticket, events } = data;
  const fields = Object.entries(ticket.fields).filter(([, v]) => v && v !== UNKNOWN);
  return (
    <article data-testid="ticket-detail" className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-sm text-slate-600" data-testid="ticket-human-id">
          {ticket.humanId}
        </p>
        <h1 className="text-lg font-semibold text-slate-900">{ticket.summary}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="ticket-status" data-status={ticket.status}>
            <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
          </span>
          <Badge tone={PRIORITY_TONE[ticket.priority]}>{priorityLabel(ticket.priority)}</Badge>
          {ticket.restricted && <Badge tone="danger">Confidential</Badge>}
        </div>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Team</dt>
          <dd className="text-slate-900">{ticket.queueLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Category</dt>
          <dd className="text-slate-900">
            {fieldLabel(ticket.category)}
            {ticket.subcategory && ` · ${fieldLabel(ticket.subcategory)}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Raised</dt>
          <dd className="text-slate-900">{formatDateTime(ticket.createdAt)}</dd>
        </div>
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-slate-500">{fieldLabel(key)}</dt>
            <dd className="break-words text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <TicketEmails emails={data.emails} />

      <section aria-labelledby="timeline-title" className="space-y-3">
        <h2 id="timeline-title" className="text-sm font-semibold text-slate-900">
          Timeline
        </h2>
        <ol data-testid="ticket-timeline" className="space-y-3 border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} data-testid="ticket-event" data-type={e.type} className="space-y-1">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{EVENT_LABEL[e.type]}</span> ·{' '}
                {formatDateTime(e.createdAt)}
              </p>
              {e.body && (
                <p
                  className={`text-sm whitespace-pre-wrap ${e.type === 'reply' ? 'rounded-md bg-white px-3 py-2 ring-1 ring-slate-200' : 'text-slate-700'}`}
                >
                  {e.body}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <Link
        href={`/chat/${ticket.conversationId}`}
        data-testid="ticket-conversation-link"
        className="inline-block text-sm font-medium text-slate-900 underline"
      >
        Open the conversation
      </Link>
    </article>
  );
}

export function TicketDetail({ id }: { id: string }) {
  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.ticket(id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [id]);

  useEffect(() => void load(), [load]);
  // A malformed ID (400) is as missing as an unknown one (404).
  const notFound = error?.status === 404 || error?.status === 400;

  return (
    <div className="space-y-4">
      <Link href="/tickets" className="text-sm text-slate-600 hover:underline">
        ← My tickets
      </Link>
      {!data && <h1 className="text-lg font-semibold text-slate-900">Ticket</h1>}
      {error && (
        <ErrorState
          title={notFound ? 'Ticket not found' : 'Could not load the ticket'}
          message={notFound ? 'Check the link, or open the ticket from My tickets.' : error.message}
          requestId={error.requestId}
          onRetry={notFound ? undefined : () => void load()}
        />
      )}
      {!error && !data && (
        <div role="status" aria-label="Loading ticket" className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {data && <TicketDetailView data={data} />}
    </div>
  );
}

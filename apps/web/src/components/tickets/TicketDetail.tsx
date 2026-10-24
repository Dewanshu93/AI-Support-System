'use client';

// One of the employee's tickets (playbook section 10): summary, status, the
// public timeline (team replies, status changes), the requester's own actions
// (comment, withdraw, reopen; UC-17) and a link to the conversation.
// Internal notes and the agent brief never reach this view (API-enforced).
import type { TicketDetailResponse } from '@sd/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PRIORITY_TONE, priorityLabel } from '@/components/chat/TicketDraftCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { fieldLabel, UNKNOWN } from '@/lib/ticketDraft';
import { TicketEmails } from './EmailCard';
import { EVENT_LABEL, formatDateTime, STATUS_LABEL, STATUS_TONE } from './ticketLabels';

/**
 * Comment, withdraw or reopen (UC-17, ADR-028). Which buttons show mirrors the API
 * rules for display only; the API enforces them.
 */
export function RequestActions({
  data,
  onChange,
}: {
  data: TicketDetailResponse;
  onChange: (data: TicketDetailResponse) => void;
}) {
  const { status, id } = data.ticket;
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  if (status === 'closed') return null;
  const open = status !== 'resolved';

  const run = async (kind: string, call: () => Promise<TicketDetailResponse>) => {
    setBusy(kind);
    setFailure(null);
    try {
      onChange(await call());
      if (kind === 'comment') setComment('');
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="request-actions-title" className="space-y-3">
      <h2 id="request-actions-title" className="text-sm font-semibold text-slate-900">
        Add to this request
      </h2>
      <label htmlFor="request-comment" className="sr-only">
        Comment for the team
      </label>
      <textarea
        id="request-comment"
        data-testid="request-comment"
        value={comment}
        maxLength={1000}
        rows={3}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write a comment for the team"
        className="block w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
      />
      {failure && (
        <p role="alert" className="text-sm text-rose-700">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          data-testid="request-comment-send"
          disabled={busy !== null || !comment.trim()}
          onClick={() => void run('comment', () => api.commentRequest(id, comment.trim()))}
        >
          {busy === 'comment' ? 'Sending…' : 'Send comment'}
        </Button>
        {open ? (
          <Button
            size="sm"
            variant="secondary"
            data-testid="request-withdraw"
            disabled={busy !== null}
            onClick={() => void run('withdraw', () => api.withdrawRequest(id))}
          >
            {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            data-testid="request-reopen"
            disabled={busy !== null}
            onClick={() => void run('reopen', () => api.reopenRequest(id))}
          >
            {busy === 'reopen' ? 'Reopening…' : 'Reopen request'}
          </Button>
        )}
      </div>
    </section>
  );
}

export function TicketDetailView({
  data,
  onChange,
}: {
  data: TicketDetailResponse;
  /** Set on the live page: the requester's actions (UC-17). */
  onChange?: (data: TicketDetailResponse) => void;
}) {
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
                  className={`text-sm whitespace-pre-wrap ${e.type === 'reply' ? 'rounded-md bg-surface px-3 py-2 ring-1 ring-slate-200' : 'text-slate-700'}`}
                >
                  {e.body}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {onChange && <RequestActions data={data} onChange={onChange} />}

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
      {data && <TicketDetailView data={data} onChange={setData} />}
    </div>
  );
}

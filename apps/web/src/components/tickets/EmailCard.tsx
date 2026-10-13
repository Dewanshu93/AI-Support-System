// An escalation email linked to a ticket (UC-07, ADR-017), shown to the
// requester and to the queue's agents. Delivery is simulated in this prototype,
// so the usual status is "Recorded (demo delivery)".
import type { TicketEmail } from '@sd/shared';
import { Badge, type Tone } from '@/components/ui/Badge';
import { formatDateTime } from './ticketLabels';

const STATUS: Record<TicketEmail['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Sending', tone: 'info' },
  recorded: { label: 'Recorded (demo delivery)', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Not delivered', tone: 'danger' },
};

export function EmailCard({
  email,
  viewer = 'employee',
}: {
  email: TicketEmail;
  viewer?: 'employee' | 'agent';
}) {
  const status = STATUS[email.status];
  const edited = email.edited.subject || email.edited.body;
  return (
    <li
      data-testid="ticket-email"
      data-status={email.status}
      className="space-y-2 rounded-md bg-surface px-3 py-3 text-sm ring-1 ring-slate-200"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium break-words text-slate-900">{email.subject}</p>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      <p className="text-xs text-slate-600">
        To {email.to.label} &lt;{email.to.address}&gt; · {formatDateTime(email.createdAt)}
        {edited && (
          <span data-testid="ticket-email-edited">
            {' '}
            · {viewer === 'employee' ? 'Edited by you' : 'Edited by the employee'}
          </span>
        )}
      </p>
      {email.status === 'failed' && (
        <p className="text-xs text-rose-700">
          {viewer === 'employee'
            ? 'Your request was still created; the team can see it.'
            : 'The request was still created.'}
        </p>
      )}
      <details open>
        <summary className="cursor-pointer text-xs font-medium text-slate-700">Email</summary>
        <pre className="mt-2 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-800">
          {email.body}
        </pre>
      </details>
    </li>
  );
}

/** The emails section of a ticket; nothing when the ticket has none. */
export function TicketEmails({
  emails,
  viewer = 'employee',
}: {
  emails: TicketEmail[];
  viewer?: 'employee' | 'agent';
}) {
  if (emails.length === 0) return null;
  return (
    <section aria-labelledby="emails-title" className="space-y-3">
      <h2 id="emails-title" className="text-sm font-semibold text-slate-900">
        Emails
      </h2>
      <ul data-testid="ticket-emails" className="space-y-3">
        {emails.map((e) => (
          <EmailCard key={e.id} email={e} viewer={viewer} />
        ))}
      </ul>
    </section>
  );
}

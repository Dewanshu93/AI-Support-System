'use client';

// The escalation email inside the ticket draft card (UC-07, ADR-017). To and
// From are set by code and read-only; the employee can edit the whole subject
// and body. Nothing is sent until the card's Send button is pressed.
import { EMAIL_LIMITS, type TicketDraft } from '@sd/shared';
import type { EmailValues } from '@/lib/ticketDraft';

const counter = (n: number, max: number) => (
  <span className={`text-xs tabular-nums ${n >= max ? 'text-rose-700' : 'text-slate-500'}`}>
    {n}/{max}
  </span>
);

export function EmailDraftSection({
  drafted,
  email,
  edited,
  disabled,
  onEdit,
  onReset,
}: {
  drafted: NonNullable<TicketDraft['email']>;
  email: EmailValues;
  edited: { subject: boolean; body: boolean };
  disabled: boolean;
  onEdit: (field: keyof EmailValues, value: string) => void;
  onReset: () => void;
}) {
  const changed = edited.subject || edited.body;
  return (
    <fieldset
      data-testid="email-draft"
      disabled={disabled}
      className="space-y-3 rounded-md border border-slate-200 bg-surface p-3"
    >
      <legend className="px-1 text-xs font-medium tracking-wide text-slate-700 uppercase">
        Email
      </legend>

      <dl className="grid gap-1 text-sm sm:grid-cols-[4rem_1fr]">
        <dt className="text-slate-500">To</dt>
        <dd data-testid="email-to" className="text-slate-900">
          {drafted.to.label} &lt;{drafted.to.address}&gt;
          <span className="ml-2 text-xs text-slate-500">set by company routing</span>
        </dd>
        <dt className="text-slate-500">From</dt>
        <dd data-testid="email-from" className="text-slate-900">
          {drafted.from.name} &lt;{drafted.from.address}&gt;
        </dd>
      </dl>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="email-subject" className="font-medium text-slate-800">
            Subject
          </label>
          {counter(email.subject.length, EMAIL_LIMITS.subject)}
        </div>
        <input
          id="email-subject"
          data-testid="email-subject"
          value={email.subject}
          maxLength={EMAIL_LIMITS.subject}
          aria-invalid={!email.subject.trim() || undefined}
          onChange={(e) => onEdit('subject', e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-surface px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="email-body" className="font-medium text-slate-800">
            Message
          </label>
          {counter(email.body.length, EMAIL_LIMITS.body)}
        </div>
        <textarea
          id="email-body"
          data-testid="email-body"
          rows={14}
          value={email.body}
          maxLength={EMAIL_LIMITS.body}
          aria-invalid={!email.body.trim() || undefined}
          onChange={(e) => onEdit('body', e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-surface px-3 py-2 font-sans leading-relaxed focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span data-testid="email-source" className="text-violet-700">
          {drafted.issueSource === 'model'
            ? 'Drafted by the assistant; figures come from your records'
            : 'Drafted from your own words'}
        </span>
        {changed && (
          <>
            <span data-testid="email-edited" className="text-slate-700">
              Edited by you
            </span>
            <button
              type="button"
              data-testid="email-reset"
              onClick={onReset}
              className="text-slate-700 underline underline-offset-2 hover:text-slate-900"
            >
              Reset to drafted text
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-600">
        Nothing is sent until you press Send. Delivery is simulated in this prototype: the email is
        stored in the outbox and shown on your request.
      </p>
    </fieldset>
  );
}

'use client';

// Ticket draft review (playbook section 10, contract flows 4 and 5): editable
// fields with "AI-filled" markers and required-missing highlights, the proposed
// priority and queue (read-only: set by code), confirm / cancel, and the
// duplicate prompt. No ticket exists until Confirm succeeds.
import type { Priority, TicketConfirmResponse, TicketDraft } from '@sd/shared';
import { useReducer } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import {
  confirmBody,
  type DraftState,
  draftedEmail,
  draftReducer,
  duplicateFrom,
  emailEdited,
  emailProblems,
  type EmailValues,
  fieldLabel,
  initialDraftState,
  isAiFilled,
  isRecordFilled,
  MAX_FIELD_LENGTH,
  missingRequired,
} from '@/lib/ticketDraft';
import { EmailDraftSection } from './EmailDraftSection';

export const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
};

export const priorityLabel = (p: Priority) => p.charAt(0).toUpperCase() + p.slice(1);

export function DuplicatePrompt({
  existing,
  busy,
  onChoose,
  onBack,
}: {
  existing: NonNullable<DraftState['duplicate']>;
  busy: boolean;
  onChoose: (decision: 'same' | 'new') => void;
  onBack: () => void;
}) {
  return (
    <div
      data-testid="duplicate-prompt"
      role="alertdialog"
      aria-labelledby="duplicate-title"
      className="space-y-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950"
    >
      <p id="duplicate-title" className="font-semibold">
        You already have an open ticket on this
      </p>
      <p>
        <span className="font-medium">{existing.humanId}</span>: {existing.summary}{' '}
        <Badge>{existing.status.replace(/_/g, ' ')}</Badge>
      </p>
      <p>Add this conversation to that ticket, or create a new one?</p>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="duplicate-same" disabled={busy} onClick={() => onChoose('same')}>
          Add to {existing.humanId}
        </Button>
        <Button
          variant="secondary"
          data-testid="duplicate-new"
          disabled={busy}
          onClick={() => onChoose('new')}
        >
          Create a new ticket
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          Back to the draft
        </Button>
      </div>
    </div>
  );
}

/** The draft as a form; state and actions come from the caller (rendered in tests). */
export function TicketDraftView({
  draft,
  state,
  onEdit,
  onConfirm,
  onCancel,
  onDuplicate,
  onBack,
  onEmailEdit = () => {},
  onEmailReset = () => {},
}: {
  draft: TicketDraft;
  state: DraftState;
  onEdit: (key: string, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDuplicate: (decision: 'same' | 'new') => void;
  onBack: () => void;
  onEmailEdit?: (field: keyof EmailValues, value: string) => void;
  onEmailReset?: () => void;
}) {
  const busy = state.phase === 'submitting' || state.phase === 'cancelling';
  const missing = missingRequired(draft, state.values);
  const keys = Object.keys(draft.fields);
  // UC-07: only drafts with an email change the wording; others read as before.
  const withEmail = Boolean(draft.email && state.email);
  const problems = emailProblems(state.email);
  return (
    <section
      data-testid="ticket-draft-card"
      aria-label={withEmail ? 'Request and email draft' : 'Ticket draft'}
      className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm"
    >
      <header className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-amber-800 uppercase">
          {withEmail ? 'Request and email · not sent yet' : 'Ticket draft · not sent yet'}
        </p>
        <p data-testid="draft-summary" className="text-base font-semibold text-slate-900">
          {draft.summary}
        </p>
        {draft.description && <p className="text-slate-700">{draft.description}</p>}
      </header>

      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Goes to</dt>
          <dd data-testid="draft-queue" className="font-medium text-slate-900">
            {draft.queue.label}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Category</dt>
          <dd className="text-slate-900">
            {fieldLabel(draft.category)}
            {draft.subcategory && ` · ${fieldLabel(draft.subcategory)}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Proposed priority</dt>
          <dd data-testid="draft-priority" data-priority={draft.priority}>
            <Badge tone={PRIORITY_TONE[draft.priority]}>{priorityLabel(draft.priority)}</Badge>
            {draft.priorityFloorApplied && (
              <span className="ml-1 text-xs text-slate-600">raised by a company rule</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-600">
        Queue and priority are set by company rules. You can correct the details below.
      </p>

      {keys.length > 0 && (
        <fieldset className="space-y-3" disabled={busy || state.phase === 'duplicate'}>
          <legend className="sr-only">Ticket details</legend>
          {keys.map((key) => {
            const id = `draft-field-${key}`;
            const isMissing = missing.includes(key);
            return (
              <div key={key} data-testid="draft-field" data-key={key} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="font-medium text-slate-800">
                    {fieldLabel(key)}
                  </label>
                  {isRecordFilled(draft, state.values, key) ? (
                    <span data-testid="record-filled" className="text-xs text-teal-700">
                      From your records
                    </span>
                  ) : (
                    isAiFilled(draft, state.values, key) && (
                      <span data-testid="ai-filled" className="text-xs text-violet-700">
                        AI-filled
                      </span>
                    )
                  )}
                  {isMissing && (
                    <span data-testid="required-missing" className="text-xs text-rose-700">
                      Needed
                    </span>
                  )}
                </div>
                <input
                  id={id}
                  value={state.values[key] ?? ''}
                  maxLength={MAX_FIELD_LENGTH}
                  aria-invalid={isMissing || undefined}
                  onChange={(e) => onEdit(key, e.target.value)}
                  placeholder={isMissing ? 'Please add this' : 'Not known'}
                  className={`w-full rounded-md border bg-surface px-3 py-2 focus:outline-none ${
                    isMissing
                      ? 'border-rose-300 focus:border-rose-500'
                      : 'border-slate-300 focus:border-slate-500'
                  }`}
                />
              </div>
            );
          })}
        </fieldset>
      )}

      {withEmail && draft.email && state.email && (
        <EmailDraftSection
          drafted={draft.email}
          email={state.email}
          edited={emailEdited(draft, state.email)}
          disabled={busy || state.phase === 'duplicate'}
          onEdit={onEmailEdit}
          onReset={onEmailReset}
        />
      )}

      {state.phase === 'duplicate' && state.duplicate && (
        <DuplicatePrompt
          existing={state.duplicate}
          busy={busy}
          onChoose={onDuplicate}
          onBack={onBack}
        />
      )}
      {state.error && (
        <p data-testid="draft-error" role="alert" className="text-rose-700">
          {state.error}
        </p>
      )}
      {state.phase !== 'duplicate' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="draft-confirm"
            disabled={busy || problems.length > 0}
            aria-describedby={problems.length > 0 ? 'email-problems' : undefined}
            onClick={onConfirm}
          >
            {withEmail
              ? state.phase === 'submitting'
                ? 'Sending…'
                : 'Send request and email'
              : state.phase === 'submitting'
                ? 'Creating…'
                : 'Confirm and create ticket'}
          </Button>
          <Button variant="secondary" data-testid="draft-cancel" disabled={busy} onClick={onCancel}>
            {withEmail ? 'Cancel (nothing is sent)' : 'Cancel'}
          </Button>
          {problems.length > 0 && (
            <span
              id="email-problems"
              data-testid="email-problems"
              className="text-xs text-rose-700"
            >
              {problems.join(' ')}
            </span>
          )}
          {missing.length > 0 && (
            <span className="text-xs text-slate-600">
              Adding the needed details helps the team act faster.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** The draft card wired to the confirm and cancel endpoints. */
export function TicketDraftCard({
  conversationId,
  draft,
  onConfirmed,
  onCancelled,
}: {
  conversationId: string;
  draft: TicketDraft;
  onConfirmed: (ticket: TicketConfirmResponse['ticket']) => void;
  onCancelled: () => void;
}) {
  const [state, dispatch] = useReducer(draftReducer, draft, initialDraftState);

  const confirm = async (duplicateDecision?: 'same' | 'new') => {
    dispatch({ type: 'submit' });
    try {
      onConfirmed(
        await api.confirmDraft(
          conversationId,
          confirmBody(draft, state.values, duplicateDecision, state.email),
        ),
      );
    } catch (err) {
      const existing = err instanceof ApiError ? duplicateFrom(err.details) : null;
      if (err instanceof ApiError && err.code === 'DUPLICATE_CANDIDATE' && existing) {
        dispatch({ type: 'duplicate', existing });
      } else {
        dispatch({ type: 'failed', message: failure(err) });
      }
    }
  };

  const cancel = async () => {
    dispatch({ type: 'cancel' });
    try {
      await api.cancelDraft(conversationId);
      onCancelled();
    } catch (err) {
      dispatch({ type: 'failed', message: failure(err) });
    }
  };

  return (
    <TicketDraftView
      draft={draft}
      state={state}
      onEdit={(key, value) => dispatch({ type: 'edit', key, value })}
      onConfirm={() => void confirm()}
      onCancel={() => void cancel()}
      onDuplicate={(decision) => void confirm(decision)}
      onBack={() => dispatch({ type: 'back' })}
      onEmailEdit={(field, value) => dispatch({ type: 'emailEdit', field, value })}
      onEmailReset={() => {
        const email = draftedEmail(draft);
        if (email) dispatch({ type: 'emailReset', email });
      }}
    />
  );
}

function failure(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.status === 404) return 'This draft is no longer waiting. Reload the conversation.';
  const id = err.requestId ? ` (request ${err.requestId})` : '';
  return `${err.message}${id}. Please try again.`;
}

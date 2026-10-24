'use client';

// Confirmation card for a copilot action (Build Contract v2.0 flow 3, rule E.4):
// timesheet entries (UC-05) or a leave request (UC-11c). Shows exactly what will
// be saved; nothing is saved until the employee presses Confirm.
import type {
  ActionResult,
  CopilotAction,
  LeaveAction,
  RequestChangeAction,
  TimesheetAction,
} from '@sd/shared';
import { type ReactNode, useState } from 'react';
import { STATUS_LABEL } from '@/components/tickets/ticketLabels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api';
import { hours, shortDate } from '@/lib/format';

export function ActionCard({
  conversationId,
  action,
  onDone,
}: {
  conversationId: string;
  action: CopilotAction;
  /** Called after confirm (with the result) or cancel (null). */
  onDone: (result: ActionResult | null) => void;
}) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'confirm' | 'cancel') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'confirm') onDone(await api.confirmAction(conversationId));
      else {
        await api.cancelAction(conversationId);
        onDone(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  const view = present(action);
  return (
    <section
      data-testid="action-card"
      data-kind={action.kind}
      aria-labelledby="action-card-title"
      className="overflow-hidden rounded-2xl border border-brand-200 bg-surface shadow-card"
    >
      <header className="flex items-center gap-3 border-b border-brand-100 bg-brand-50/60 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
          <Icon name={view.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="action-card-title" className="text-sm font-semibold text-slate-900">
            {view.title}
          </h2>
          <p className="text-xs text-slate-600">{view.subtitle}</p>
        </div>
      </header>

      {view.body}

      {error && (
        <p
          role="alert"
          className="border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <Button
          variant="secondary"
          data-testid="action-cancel"
          disabled={busy !== null}
          onClick={() => void run('cancel')}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
        </Button>
        <Button
          variant="ai"
          data-testid="action-confirm"
          disabled={busy !== null}
          onClick={() => void run('confirm')}
        >
          <Icon name="check" className="h-4 w-4" />
          {busy === 'confirm' ? 'Saving…' : view.confirm}
        </Button>
      </footer>
    </section>
  );
}

/** Title, icon, body and button words per action kind. */
function present(action: CopilotAction): {
  icon: IconName;
  title: string;
  subtitle: string;
  confirm: string;
  body: ReactNode;
} {
  switch (action.kind) {
    case 'leave_apply':
      return {
        icon: 'calendar',
        title: `Confirm ${action.typeLabel.toLowerCase()}`,
        subtitle: action.needsApproval
          ? 'Nothing is sent until you confirm.'
          : 'Nothing is saved until you confirm.',
        confirm: action.needsApproval ? 'Confirm and send' : 'Confirm and record',
        body: <LeaveBody action={action} />,
      };
    case 'request_change':
      return {
        icon: 'inbox',
        title:
          action.change === 'comment'
            ? `Add a comment to ${action.humanId}`
            : `${action.change === 'withdraw' ? 'Withdraw' : 'Reopen'} ${action.humanId}`,
        subtitle: 'Nothing changes until you confirm.',
        confirm:
          action.change === 'comment'
            ? 'Confirm and add'
            : action.change === 'withdraw'
              ? 'Confirm and withdraw'
              : 'Confirm and reopen',
        body: <RequestChangeBody action={action} />,
      };
    case 'timesheet_log':
      return {
        icon: 'clock',
        title: `Confirm timesheet ${action.entries.length === 1 ? 'entry' : 'entries'}`,
        subtitle: 'Nothing is saved until you confirm.',
        confirm: 'Confirm and save',
        body: <TimesheetBody action={action} />,
      };
  }
}

function RequestChangeBody({ action }: { action: RequestChangeAction }) {
  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <p className="text-slate-900">
        <span className="font-mono text-slate-600">{action.humanId}</span> · {action.summary}
      </p>
      {action.comment && (
        <p
          data-testid="action-comment"
          className="rounded-md bg-slate-50 px-3 py-2 whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200"
        >
          {action.comment}
        </p>
      )}
      {action.statusAfter && (
        <p className="text-xs text-slate-600">
          It will show as <span className="font-medium">{STATUS_LABEL[action.statusAfter]}</span>.
        </p>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function LeaveBody({ action }: { action: LeaveAction }) {
  const dates =
    action.startDate === action.endDate
      ? shortDate(action.startDate)
      : `${shortDate(action.startDate)} – ${shortDate(action.endDate)}`;
  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        <dt className="text-slate-500">Dates</dt>
        <dd data-testid="action-leave-dates" className="font-semibold text-slate-900">
          {dates}
        </dd>
        <dt className="text-slate-500">Working days</dt>
        <dd className="text-slate-900 tabular-nums">{action.days}</dd>
        <dt className="text-slate-500">Left after this</dt>
        <dd className="text-slate-900 tabular-nums">{plural(action.availableAfter, 'day')}</dd>
        <dt className="text-slate-500">Approval</dt>
        <dd className="text-slate-900">
          {action.needsApproval
            ? 'HR approves for your manager; you will be notified'
            : 'Recorded at once; tell your manager as well'}
        </dd>
      </dl>
      {action.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {w}
        </p>
      ))}
    </div>
  );
}

function TimesheetBody({ action }: { action: TimesheetAction }) {
  const late = action.entries.some((e) => e.late);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="px-4 py-2 font-medium">
                Day
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Project
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Hours
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Day total after
              </th>
            </tr>
          </thead>
          <tbody>
            {action.entries.map((e) => (
              <tr
                key={`${e.date}-${e.projectId}`}
                data-testid="action-entry"
                className="border-t border-slate-100"
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-900">
                  {shortDate(e.date)}
                  {e.late && (
                    <span className="ml-2">
                      <Badge tone="warning">Late entry</Badge>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2 text-slate-800">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: e.projectColor }}
                    />
                    {e.projectName}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                  {hours(e.hours)}
                  {e.previousHours > 0 && (
                    <span className="block text-xs font-normal text-slate-500">
                      replaces {hours(e.previousHours)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">
                  {hours(e.dayTotalAfter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {late && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
          A late entry belongs to a pay period that has closed. Payroll reviews late entries; ask me
          afterwards if you want a payroll request raised.
        </p>
      )}
    </>
  );
}

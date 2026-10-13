'use client';

// Confirmation card for a copilot timesheet action (UC-05; Build Contract v2.0
// flow 3, rule E.4). Shows exactly what will be saved; nothing is saved until
// the employee presses Confirm.
import type { ActionResult, TimesheetAction } from '@sd/shared';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api';
import { hours, shortDate } from '@/lib/format';

export function ActionCard({
  conversationId,
  action,
  onDone,
}: {
  conversationId: string;
  action: TimesheetAction;
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

  const late = action.entries.some((e) => e.late);
  return (
    <section
      data-testid="action-card"
      aria-labelledby="action-card-title"
      className="overflow-hidden rounded-2xl border border-brand-200 bg-surface shadow-card"
    >
      <header className="flex items-center gap-3 border-b border-brand-100 bg-brand-50/60 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
          <Icon name="clock" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="action-card-title" className="text-sm font-semibold text-slate-900">
            Confirm timesheet {action.entries.length === 1 ? 'entry' : 'entries'}
          </h2>
          <p className="text-xs text-slate-600">Nothing is saved until you confirm.</p>
        </div>
      </header>

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
          {busy === 'confirm' ? 'Saving…' : 'Confirm and save'}
        </Button>
      </footer>
    </section>
  );
}

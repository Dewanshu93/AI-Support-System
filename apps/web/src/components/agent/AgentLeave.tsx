'use client';

// Leave approvals (UC-11, ADR-025): the HR agent approves or declines leave for
// the employee's manager. Balances and working days are computed by the API.
import type { AgentLeaveRequest, LeaveStatus } from '@sd/shared';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { LEAVE_STATUS, leaveDates } from '@/components/workspace/LeavePage';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';

const TABS: { status: LeaveStatus; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Declined' },
];

export function AgentLeave() {
  const [status, setStatus] = useState<LeaveStatus>('pending');
  const { state, reload } = useApi(() => api.agentLeave(status), status);

  return (
    <>
      <PageHeader
        eyebrow="HR"
        title="Leave approvals"
        description="Approve or decline leave for the employee's manager. The employee is notified in the Employee Hub."
      />
      <div role="tablist" aria-label="Status" className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            type="button"
            aria-selected={status === t.status}
            onClick={() => setStatus(t.status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${status === t.status ? 'bg-ink text-on-ink' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {state.kind === 'error' && !state.data ? (
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      ) : !state.data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : state.data.items.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title={status === 'pending' ? 'Nothing waiting' : 'No requests'}
          description={
            status === 'pending' ? 'New leave requests appear here.' : 'Nothing with this status.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {state.data.items.map((r) => (
            <LeaveRow key={r.id} request={r} onDecided={() => void reload()} />
          ))}
        </ul>
      )}
    </>
  );
}

export function LeaveRow({
  request: r,
  onDecided,
}: {
  request: AgentLeaveRequest;
  onDecided: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setFailure(null);
    try {
      await api.decideLeave(r.id, { decision, ...(note.trim() && { note: note.trim() }) });
      onDecided();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not save the decision');
      setBusy(false);
    }
  };

  return (
    <li data-testid="agent-leave-request">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {r.employee.name}{' '}
              <span className="font-normal text-slate-500">
                · {r.employee.department} · {r.employee.country}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              {r.typeLabel} · {leaveDates(r)} · {r.days} working day{r.days === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {r.reason ? `“${r.reason}” · ` : ''}requested {relativeTime(r.createdAt)} ·{' '}
              {r.availableAfter} {r.availableAfter === 1 ? 'day' : 'days'} left after this
            </p>
            {r.decisionNote && (
              <p className="mt-0.5 text-xs text-slate-500">Note: {r.decisionNote}</p>
            )}
          </div>
          <Badge tone={LEAVE_STATUS[r.status].tone} dot>
            {LEAVE_STATUS[r.status].label}
          </Badge>
        </div>
        {r.status === 'pending' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor={`note-${r.id}`} className="sr-only">
              Note to the employee
            </label>
            <input
              id={`note-${r.id}`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note to the employee (needed to decline)"
              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
            />
            <Button size="sm" disabled={busy} onClick={() => void decide('approve')}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !note.trim()}
              onClick={() => void decide('reject')}
            >
              Decline
            </Button>
          </div>
        )}
        {failure && (
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {failure}
          </p>
        )}
      </Card>
    </li>
  );
}

'use client';

// Leave (UC-11): balances, the apply form and the employee's requests. Days,
// balances and every rule come from the API (code, config/workday.yaml); the
// form only shows the server's checks next to the fields.
import {
  LEAVE_TYPES,
  type LeaveOverviewResponse,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '@sd/shared';
import { type FormEvent, useState } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/lib/api';
import { shortDate } from '@/lib/format';

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const leaveDates = (r: Pick<LeaveRequest, 'startDate' | 'endDate'>) =>
  r.startDate === r.endDate
    ? shortDate(r.startDate)
    : `${shortDate(r.startDate)} – ${shortDate(r.endDate)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function LeavePage() {
  const { state, reload, set } = useApi(api.leave);
  const header = (
    <PageHeader
      eyebrow="Leave"
      title="Leave"
      description="Your balances for this year, and your requests. Balances and days are counted by HR rules, not by AI."
    />
  );

  if (state.kind === 'error' && !state.data) {
    return (
      <>
        {header}
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      </>
    );
  }
  if (!state.data) {
    return (
      <>
        {header}
        <div className="space-y-6" role="status" aria-label="Loading leave">
          <div className="grid gap-4 sm:grid-cols-3">
            {LEAVE_TYPES.map((t) => (
              <Skeleton key={t} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </>
    );
  }
  return (
    <>
      {header}
      <LeaveView data={state.data} onChange={set} />
    </>
  );
}

export function LeaveView({
  data,
  onChange,
}: {
  data: LeaveOverviewResponse;
  onChange: (data: LeaveOverviewResponse) => void;
}) {
  if (!data.eligible) {
    return (
      <>
        <EmptyState
          icon="calendar"
          title="Your time off is agreed with your agency"
          description="Contractors do not have company leave balances. Agree time off with your manager and your agency at least 5 business days ahead."
        />
        <RequestList data={data} onChange={onChange} />
      </>
    );
  }
  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-3" aria-label="Leave balances">
        {data.balances.map((b) => (
          <li
            key={b.type}
            data-testid="leave-balance"
            data-type={b.type}
            className="rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card"
          >
            <p className="text-xs font-medium text-slate-500">{b.label}</p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {b.available}
              <span className="text-base font-medium text-slate-500"> / {b.entitlement} days</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {b.used} used{b.pending > 0 ? ` · ${b.pending} waiting for approval` : ''}
            </p>
          </li>
        ))}
      </ul>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
        <ApplyForm data={data} onChange={onChange} />
        <RequestList data={data} onChange={onChange} />
      </div>
    </div>
  );
}

type Field = 'type' | 'startDate' | 'endDate';

function ApplyForm({
  data,
  onChange,
}: {
  data: LeaveOverviewResponse;
  onChange: (data: LeaveOverviewResponse) => void;
}) {
  const [type, setType] = useState<LeaveType>('annual');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; warnings: string[] } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFailure(null);
    setDone(null);
    try {
      const res = await api.applyLeave({
        type,
        startDate,
        endDate: endDate || startDate,
        ...(reason.trim() && { reason: reason.trim() }),
      });
      onChange(res.overview);
      setDone({
        text:
          res.request.status === 'pending'
            ? `Sent for approval: ${leaveDates(res.request)} (${plural(res.request.days, 'working day')}).`
            : `Recorded: ${leaveDates(res.request)} (${plural(res.request.days, 'working day')}).`,
        warnings: res.warnings,
      });
      setStart('');
      setEnd('');
      setReason('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const issues =
          (err.details as { issues?: { path: string; message: string }[] })?.issues ?? [];
        const next: Partial<Record<Field, string>> = {};
        for (const issue of issues) {
          const field = (['type', 'startDate', 'endDate'] as const).find((f) =>
            issue.path.endsWith(f),
          );
          if (field) next[field] = next[field] ? `${next[field]}; ${issue.message}` : issue.message;
        }
        setErrors(next);
        if (Object.keys(next).length === 0) setFailure(err.message);
      } else {
        setFailure(err instanceof Error ? err.message : 'Could not send the request');
      }
    } finally {
      setBusy(false);
    }
  };

  const sick = type === 'sick';
  const min = sick ? data.rules.earliestSickDate : data.today;
  const max = sick ? data.today : data.rules.latestDate;
  const input =
    'mt-1 block h-9 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none aria-[invalid=true]:border-rose-400';
  const fieldError = (f: Field) =>
    errors[f] && (
      <p id={`leave-${f}-error`} className="mt-1 text-xs text-rose-700">
        {errors[f]}
      </p>
    );

  return (
    <Card>
      <CardHeader
        icon={<Icon name="plus" className="h-4.5 w-4.5" />}
        title="Request leave"
        subtitle={sick ? 'Sick leave is recorded at once' : 'HR approves for your manager'}
      />
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="leave-type" className="text-xs font-medium text-slate-700">
            Type
          </label>
          <select
            id="leave-type"
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            className={input}
            aria-invalid={Boolean(errors.type)}
            aria-describedby={errors.type ? 'leave-type-error' : undefined}
          >
            {data.balances.map((b) => (
              <option key={b.type} value={b.type}>
                {b.label} ({b.available} left)
              </option>
            ))}
          </select>
          {fieldError('type')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="leave-start" className="text-xs font-medium text-slate-700">
              From
            </label>
            <input
              id="leave-start"
              type="date"
              required
              min={min}
              max={max}
              value={startDate}
              onChange={(e) => setStart(e.target.value)}
              className={input}
              aria-invalid={Boolean(errors.startDate)}
              aria-describedby={errors.startDate ? 'leave-startDate-error' : undefined}
            />
            {fieldError('startDate')}
          </div>
          <div>
            <label htmlFor="leave-end" className="text-xs font-medium text-slate-700">
              To
            </label>
            <input
              id="leave-end"
              type="date"
              min={startDate || min}
              max={max}
              value={endDate}
              onChange={(e) => setEnd(e.target.value)}
              className={input}
              aria-invalid={Boolean(errors.endDate)}
              aria-describedby={errors.endDate ? 'leave-endDate-error' : undefined}
            />
            {fieldError('endDate')}
          </div>
        </div>
        <div>
          <label htmlFor="leave-reason" className="text-xs font-medium text-slate-700">
            Note for HR <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="leave-reason"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={input}
          />
        </div>
        {failure && (
          <p role="alert" className="text-sm text-rose-700">
            {failure}
          </p>
        )}
        {done && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900"
          >
            <p className="flex gap-2">
              <Icon name="checkCircle" className="mt-0.5 h-4 w-4 text-emerald-600" />
              {done.text}
            </p>
            {done.warnings.map((w) => (
              <p key={w} className="mt-1.5 text-xs text-amber-800">
                {w}
              </p>
            ))}
          </div>
        )}
        <Button type="submit" disabled={busy || !startDate} data-testid="leave-submit">
          {busy ? 'Sending…' : sick ? 'Record sick leave' : 'Send for approval'}
        </Button>
      </form>
    </Card>
  );
}

function RequestList({
  data,
  onChange,
}: {
  data: LeaveOverviewResponse;
  onChange: (data: LeaveOverviewResponse) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const label = (t: LeaveType) => data.balances.find((b) => b.type === t)?.label ?? t;

  const cancel = async (id: string) => {
    setBusy(id);
    setFailure(null);
    try {
      onChange(await api.cancelLeave(id));
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not cancel the request');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Icon name="calendar" className="h-4.5 w-4.5" />}
        title="My requests"
        subtitle={`${data.year}`}
      />
      {failure && (
        <p role="alert" className="mb-3 text-sm text-rose-700">
          {failure}
        </p>
      )}
      {data.requests.length === 0 ? (
        <p className="text-sm text-slate-500">No leave this year yet.</p>
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">
          {data.requests.map((r) => (
            <li
              key={r.id}
              data-testid="leave-request"
              data-status={r.status}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {label(r.type)} · {leaveDates(r)}
                </p>
                <p className="text-xs text-slate-500">
                  {plural(r.days, 'working day')}
                  {r.reason ? ` · ${r.reason}` : ''}
                  {r.decisionNote ? ` · HR: ${r.decisionNote}` : ''}
                </p>
              </div>
              <Badge tone={LEAVE_STATUS[r.status].tone} dot>
                {LEAVE_STATUS[r.status].label}
              </Badge>
              {r.cancellable && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === r.id}
                  onClick={() => void cancel(r.id)}
                >
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

'use client';

// Unified employee dashboard (Build Contract v2.0 flow 1): greeting with the
// copilot, key numbers, the week's timesheet, tasks, payroll, requests and
// notifications. Every figure comes from GET /api/dashboard.
import type { DashboardResponse } from '@sd/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { COPILOT_SUGGESTIONS, copilotHref } from '@/lib/copilot';
import { dateSpan, fullDate, greeting, hours, money, relativeTime, shortDate } from '@/lib/format';
import { NotificationIcon } from './NotificationIcon';
import { RequestStepper } from './RequestStepper';
import { REQUEST_TONE } from './styles';
import { TaskRow } from './TaskRow';
import { WeekStrip } from './WeekStrip';

export function Dashboard() {
  const { state, reload } = useApi(api.dashboard);

  if (state.kind === 'error' && !state.data) {
    return (
      <div className="pt-6">
        <h1 className="sr-only">Dashboard</h1>
        <ErrorState
          title="Could not load your dashboard"
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      </div>
    );
  }
  if (!state.data) return <DashboardSkeleton />;
  const d = state.data;

  return (
    <div className="space-y-6 pt-4">
      <Hero data={d} />
      <Stats data={d} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <TimesheetCard data={d} />
          <TasksCard data={d} />
        </div>
        <div className="min-w-0 space-y-6">
          <PayrollCard data={d} />
          <RequestsCard data={d} />
          <NotificationsCard data={d} onChange={() => void reload()} />
        </div>
      </div>
    </div>
  );
}

// --- hero with the copilot -------------------------------------------------------

function Hero({ data }: { data: DashboardResponse }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) router.push(copilotHref(text.trim()));
  };
  const lop = data.payroll?.latest?.lopAmount ?? 0;
  const chips = [
    ...(lop > 0 ? ['Why was my salary reduced last month?'] : []),
    ...(data.timesheet.missingDays.length > 0
      ? [`Log 8 hours for ${shortDate(data.timesheet.missingDays.at(-1)!)}`]
      : []),
    ...COPILOT_SUGGESTIONS.map((s) => s.text),
  ]
    .filter((v, i, all) => all.indexOf(v) === i)
    .slice(0, 4);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-surface shadow-card">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_minmax(0,32rem)] lg:items-center lg:p-7">
        <div>
          <p className="text-sm text-slate-500">{fullDate(data.today)}</p>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            {greeting()}, {data.profile.firstName}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {data.profile.jobTitle} · {data.profile.department}
          </p>
        </div>

        <div>
          <form
            onSubmit={submit}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-surface p-1.5 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10"
          >
            <span className="ml-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name="sparkles" className="h-4.5 w-4.5" />
            </span>
            <label htmlFor="hero-ask" className="sr-only">
              Ask Copilot
            </label>
            <input
              id="hero-ask"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Copilot about your timesheet, pay, policies or requests"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
            />
            <Button type="submit" size="md" disabled={!text.trim()}>
              Ask
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested questions">
            {chips.map((c) => (
              <Link
                key={c}
                href={copilotHref(c)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {data.timesheet.missingDays.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-amber-50/60 px-6 py-2.5 text-sm text-amber-900 lg:px-7">
          <Icon name="alert" className="h-4 w-4 text-amber-600" />
          <span>
            {data.timesheet.missingDays.length} working day
            {data.timesheet.missingDays.length === 1 ? ' has' : 's have'} no hours logged.
          </span>
          <Link
            href="/timesheets"
            className="font-medium text-amber-900 underline underline-offset-2"
          >
            Review timesheet
          </Link>
        </div>
      )}
    </section>
  );
}

// --- stats ---------------------------------------------------------------------

function Stat({
  icon,
  label,
  value,
  hint,
  tone = 'slate',
  href,
  children,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'slate' | 'rose' | 'brand' | 'emerald' | 'amber';
  href: string;
  children?: ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    rose: 'bg-rose-50 text-rose-600',
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <Link
      href={href}
      className="card-hover group rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card"
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} className="h-4.5 w-4.5" />
        </span>
        <Icon
          name="arrowUpRight"
          className="h-4 w-4 text-slate-300 transition group-hover:text-slate-500"
        />
      </div>
      <p className="mt-4 text-xs font-medium text-slate-500">{label}</p>
      <p className="font-display mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      {children}
    </Link>
  );
}

function Stats({ data }: { data: DashboardResponse }) {
  const { loggedHours, requiredHours, missingDays } = data.timesheet;
  const pct =
    requiredHours > 0 ? Math.min(100, Math.round((loggedHours / requiredHours) * 100)) : 100;
  const waiting = data.requests.items.filter((r) => r.status === 'waiting_on_employee').length;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat
        icon="clock"
        label="Hours this week"
        value={
          <>
            {hours(loggedHours)}
            <span className="text-base font-medium text-slate-500"> / {hours(requiredHours)}</span>
          </>
        }
        tone="brand"
        href="/timesheets"
      >
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Stat>
      <Stat
        icon="alert"
        label="Days without hours"
        value={missingDays.length}
        hint={missingDays.length > 0 ? missingDays.map(shortDate).join(', ') : 'All caught up'}
        tone={missingDays.length > 0 ? 'rose' : 'emerald'}
        href="/timesheets"
      />
      <Stat
        icon="checklist"
        label="Open tasks"
        value={data.tasks.open}
        hint={
          data.tasks.dueSoon > 0
            ? `${data.tasks.dueSoon} due in the next 3 days`
            : 'Nothing due soon'
        }
        tone="amber"
        href="/tasks"
      />
      <Stat
        icon="inbox"
        label="Active requests"
        value={data.requests.active}
        hint={waiting > 0 ? `${waiting} waiting for you` : 'Nothing needs you'}
        tone={waiting > 0 ? 'amber' : 'slate'}
        href="/tickets"
      />
    </div>
  );
}

// --- cards ---------------------------------------------------------------------

function TimesheetCard({ data }: { data: DashboardResponse }) {
  const { days, weekStart, missingDays } = data.timesheet;
  const latestMissing = missingDays.at(-1);
  return (
    <Card>
      <CardHeader
        icon={<Icon name="calendar" className="h-4.5 w-4.5" />}
        title="Timesheet"
        subtitle={`Week of ${dateSpan(weekStart, days.at(-1)!.date)}`}
        action={
          <Link href="/timesheets">
            <Button variant="secondary" size="sm">
              Open timesheet
            </Button>
          </Link>
        }
      />
      <WeekStrip days={days} />
      {latestMissing && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex min-w-0 flex-1 gap-3 text-sm text-rose-900">
            <Icon name="alert" className="mt-0.5 h-4.5 w-4.5 text-rose-600" />
            <span>
              <span className="font-semibold">
                {missingDays.length === 1 ? shortDate(latestMissing) : `${missingDays.length} days`}
              </span>{' '}
              {missingDays.length === 1 ? 'has' : 'have'} no hours logged. Days left empty at the
              payroll cutoff can become Loss of Pay.
            </span>
          </p>
          <div className="flex gap-2">
            <Link href={copilotHref(`Log 8 hours for ${shortDate(latestMissing)}`)}>
              <Button variant="ai" size="sm">
                <Icon name="sparkles" className="h-3.5 w-3.5" /> Log with Copilot
              </Button>
            </Link>
            <Link href={`/timesheets?date=${latestMissing}`}>
              <Button variant="secondary" size="sm">
                Log manually
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function TasksCard({ data }: { data: DashboardResponse }) {
  return (
    <Card>
      <CardHeader
        icon={<Icon name="checklist" className="h-4.5 w-4.5" />}
        title="My work"
        subtitle={`${data.tasks.open} open task${data.tasks.open === 1 ? '' : 's'} from the project tracker`}
        action={
          <Link href="/tasks" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            View board →
          </Link>
        }
      />
      {data.tasks.items.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="No open tasks"
          description="Nice — nothing assigned right now."
        />
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">
          {data.tasks.items.map((t) => (
            <TaskRow key={t.id} task={t} today={data.today} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PayrollCard({ data }: { data: DashboardResponse }) {
  const payroll = data.payroll;
  if (!payroll) return null;
  const slip = payroll.latest;
  return (
    <Card className="relative overflow-hidden">
      <CardHeader
        icon={<Icon name="wallet" className="h-4.5 w-4.5" />}
        title="Pay"
        subtitle={slip ? `Paid ${shortDate(slip.payDate)}` : undefined}
        action={
          slip && (
            <Link
              href="/payroll"
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Payslips →
            </Link>
          )
        }
      />
      {payroll.paidByAgency ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          As a contractor you are paid by your agency. Ask your agency about payslips.
        </p>
      ) : !slip ? (
        <p className="text-sm text-slate-500">No payslips yet.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Net pay · {dateSpan(slip.periodStart, slip.periodEnd)}
          </p>
          <p className="font-display mt-0.5 text-3xl font-semibold tracking-tight text-slate-900">
            {money(slip.net, slip.currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Gross {money(slip.gross, slip.currency)} · Deductions{' '}
            {money(slip.totalDeductions, slip.currency)}
          </p>
          {slip.lopAmount > 0 && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-linear-to-br from-rose-50 to-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <Icon name="trendDown" className="h-4 w-4" />
                Loss of Pay −{money(slip.lopAmount, slip.currency)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-700/90">
                A working day had no timesheet or attendance record at the payroll cutoff.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={copilotHref('Why was my salary reduced last month?')}>
                  <Button variant="ai" size="sm">
                    <Icon name="sparkles" className="h-3.5 w-3.5" /> Ask why
                  </Button>
                </Link>
                <Link href={`/payroll?id=${slip.id}`}>
                  <Button variant="secondary" size="sm">
                    View payslip
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function RequestsCard({ data }: { data: DashboardResponse }) {
  return (
    <Card>
      <CardHeader
        icon={<Icon name="inbox" className="h-4.5 w-4.5" />}
        title="Requests"
        subtitle={`${data.requests.active} active`}
        action={
          <Link href="/tickets" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Tracker →
          </Link>
        }
      />
      {data.requests.items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No requests yet. If Copilot cannot solve something, it prepares one for you.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.requests.items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/tickets/${r.id}`}
                className="block rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.summary}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{r.humanId}</span> · {r.department}
                    </p>
                  </div>
                  <Badge tone={REQUEST_TONE[r.status]}>{r.stage}</Badge>
                </div>
                <div className="mt-2.5">
                  <RequestStepper status={r.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NotificationsCard({ data, onChange }: { data: DashboardResponse; onChange: () => void }) {
  return (
    <Card>
      <CardHeader
        icon={<Icon name="bell" className="h-4.5 w-4.5" />}
        title="Notifications"
        subtitle={
          data.notifications.unread > 0 ? `${data.notifications.unread} unread` : 'All read'
        }
        action={
          data.notifications.unread > 0 && (
            <button
              type="button"
              onClick={() => void api.markNotificationsRead().then(onChange, () => undefined)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Mark all read
            </button>
          )
        }
      />
      <ul className="-mx-2 space-y-1">
        {data.notifications.items.slice(0, 4).map((n) => (
          <li key={n.id}>
            <Link
              href={n.link ?? '#'}
              className="flex gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
            >
              <NotificationIcon kind={n.kind} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${n.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}
                >
                  {n.title}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {relativeTime(n.createdAt)}
                </span>
              </span>
              {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pt-4" role="status" aria-label="Loading dashboard">
      <h1 className="sr-only">Dashboard</h1>
      <Skeleton className="h-52 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

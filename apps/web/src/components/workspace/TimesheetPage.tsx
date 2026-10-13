'use client';

// Weekly timesheet (Build Contract v2.0 flows 3–4): a project × day grid with
// day statuses from the API. Every rule (dates, own projects, steps, day
// totals) is enforced by the API; this page shows the errors on the cells.
import type { TimesheetCell, TimesheetWeekResponse } from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/lib/api';
import { copilotHref } from '@/lib/copilot';
import { addDays, dateSpan, dayOfMonth, hours, shortDate, weekday } from '@/lib/format';
import { DAY_STYLE } from './styles';

const cellKey = (date: string, projectId: string) => `${date}|${projectId}`;
const parse = (v: string) => (v.trim() === '' ? 0 : Number(v));

function initialGrid(week: TimesheetWeekResponse): Record<string, string> {
  return Object.fromEntries(
    week.entries.map((e) => [cellKey(e.date, e.projectId), String(e.hours)]),
  );
}

export function TimesheetPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const date = params.get('date') ?? undefined;
  const { state, reload, set } = useApi(() => api.timesheetWeek(date), date ?? '');

  const week = state.data;
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (week) {
      setGrid(initialGrid(week));
      setErrors({});
    }
  }, [week]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const original = useMemo(() => (week ? initialGrid(week) : {}), [week]);
  const changed = useMemo(() => {
    if (!week) return [];
    const keys = new Set([...Object.keys(original), ...Object.keys(grid)]);
    return [...keys].filter((k) => parse(grid[k] ?? '') !== parse(original[k] ?? ''));
  }, [grid, original, week]);

  const go = (d: string) => router.replace(`${pathname}?date=${d}`, { scroll: false });

  if (state.kind === 'error' && !week) {
    return (
      <>
        <PageHeader title="Timesheet" />
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      </>
    );
  }

  // Locked while a week loads, so nothing typed into the previous week is lost.
  const loading = state.kind === 'loading';
  const editable = (d: string) =>
    !!week && !loading && d <= week.today && d >= week.rules.earliestDate;
  const dayTotal = (d: string) =>
    week ? week.projects.reduce((s, p) => s + (parse(grid[cellKey(d, p.id)] ?? '') || 0), 0) : 0;
  const rowTotal = (projectId: string) =>
    week
      ? week.days.reduce((s, d) => s + (parse(grid[cellKey(d.date, projectId)] ?? '') || 0), 0)
      : 0;
  const weekTotal = week ? week.days.reduce((s, d) => s + dayTotal(d.date), 0) : 0;

  const fillDay = (d: string) => {
    if (!week || week.projects.length === 0) return;
    const missing = Math.max(0, 8 - dayTotal(d));
    if (missing === 0) return;
    const first = week.projects[0]!.id;
    const current = parse(grid[cellKey(d, first)] ?? '') || 0;
    setGrid((g) => ({ ...g, [cellKey(d, first)]: String(current + missing) }));
  };

  const save = async () => {
    if (!week || changed.length === 0) return;
    const cells: TimesheetCell[] = changed.map((k) => {
      const [d, projectId] = k.split('|') as [string, string];
      return { date: d, projectId, hours: parse(grid[k] ?? '') || 0 };
    });
    const invalid = cells.find((c) => Number.isNaN(c.hours));
    if (invalid) {
      setErrors({ [cellKey(invalid.date, invalid.projectId)]: 'Enter a number' });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.saveTimesheet({ cells });
      set(result.week);
      setToast(
        `Saved ${result.saved} entr${result.saved === 1 ? 'y' : 'ies'}${result.removed ? `, removed ${result.removed}` : ''}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const issues =
          (err.details as { issues?: { path: string; message: string }[] })?.issues ?? [];
        const next: Record<string, string> = {};
        for (const issue of issues) {
          const index = Number(issue.path.split('.')[1]);
          const cell = cells[index];
          if (cell) next[cellKey(cell.date, cell.projectId)] = issue.message;
        }
        setErrors(next);
        setSaveError('Some entries need fixing before they can be saved.');
      } else {
        setSaveError(err instanceof Error ? err.message : 'Could not save.');
      }
    } finally {
      setSaving(false);
    }
  };

  const required = week?.requiredHours ?? 0;
  const pct = required > 0 ? Math.min(100, Math.round((weekTotal / required) * 100)) : 0;

  return (
    <div className="pb-20">
      <PageHeader
        eyebrow="Timesheets"
        title={week ? `Week of ${dateSpan(week.weekStart, week.weekEnd)}` : 'Timesheet'}
        description="Log hours per project. Empty past working days can become Loss of Pay at the payroll cutoff."
        actions={
          <>
            <Link href={copilotHref('Log 8 hours for the Banking Module yesterday')}>
              <Button variant="ai" size="md">
                <Icon name="sparkles" className="h-4 w-4" /> Log with Copilot
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-slate-200/80 bg-surface p-1 shadow-card">
          <button
            type="button"
            aria-label="Previous week"
            disabled={!week}
            onClick={() => week && go(addDays(week.weekStart, -7))}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!week}
            onClick={() => week && go(week.today)}
            className="h-8 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            This week
          </button>
          <button
            type="button"
            aria-label="Next week"
            disabled={!week || (!!week && week.weekEnd >= week.today)}
            onClick={() => week && go(addDays(week.weekStart, 7))}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
        {week && (
          <div className="flex min-w-60 flex-1 items-center gap-3 rounded-xl border border-slate-200/80 bg-surface px-4 py-2.5 shadow-card sm:flex-none">
            <span className="text-sm text-slate-500">Logged</span>
            <span className="font-display text-lg font-semibold text-slate-900">
              {hours(weekTotal)}
              <span className="text-sm font-medium text-slate-500"> / {hours(required)}</span>
            </span>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        <Legend />
      </div>

      {!week ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface shadow-card">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th
                  scope="col"
                  className="w-64 px-5 py-3 text-left text-xs font-semibold text-slate-500"
                >
                  Project
                </th>
                {week.days.map((d) => {
                  const style = DAY_STYLE[d.status];
                  const isToday = d.date === week.today;
                  const short =
                    d.requiredHours > 0 && dayTotal(d.date) < d.requiredHours && editable(d.date);
                  return (
                    <th
                      key={d.date}
                      scope="col"
                      className={`px-2 py-3 text-center ${d.status === 'weekend' ? 'bg-slate-50/70' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`text-[11px] font-semibold tracking-wide uppercase ${isToday ? 'text-brand-600' : 'text-slate-500'}`}
                        >
                          {weekday(d.date)}
                        </span>
                        <span
                          className={`font-display grid h-8 w-8 place-items-center rounded-full text-base font-semibold ${isToday ? 'bg-brand-600 text-white' : 'text-slate-900'}`}
                        >
                          {dayOfMonth(d.date)}
                        </span>
                        <span
                          data-testid={`day-status-${d.date}`}
                          data-status={d.status}
                          title={d.label ?? style.label}
                          className={`max-w-24 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}
                        >
                          {d.label ?? style.label}
                        </span>
                        {short && (
                          <button
                            type="button"
                            onClick={() => fillDay(d.date)}
                            className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                          >
                            + Fill to 8h
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-500"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {week.projects.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="px-5 py-2 text-left font-normal">
                    <span className="flex items-center gap-3">
                      <span
                        className="h-8 w-1.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {p.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {p.code}
                          {p.client ? ` · ${p.client}` : ''}
                        </span>
                      </span>
                    </span>
                  </th>
                  {week.days.map((d) => {
                    const key = cellKey(d.date, p.id);
                    const value = grid[key] ?? '';
                    const error = errors[key];
                    const dirty = parse(value) !== parse(original[key] ?? '');
                    const entry = week.entries.find(
                      (e) => e.date === d.date && e.projectId === p.id,
                    );
                    const canEdit = editable(d.date);
                    return (
                      <td
                        key={d.date}
                        className={`px-1.5 py-2 text-center ${d.status === 'weekend' ? 'bg-slate-50/70' : ''}`}
                      >
                        <div className="relative mx-auto w-16">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={week.rules.maxHoursPerDay}
                            step={week.rules.hourStep}
                            value={value}
                            disabled={!canEdit}
                            aria-label={`${p.name}, ${shortDate(d.date)}`}
                            aria-invalid={!!error}
                            title={error ?? (canEdit ? undefined : 'Not editable')}
                            placeholder={canEdit ? '–' : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setGrid((g) => ({ ...g, [key]: v }));
                              setErrors(({ [key]: _gone, ...rest }) => rest);
                            }}
                            className={`h-10 w-16 rounded-lg border text-center text-sm font-medium tabular-nums transition outline-none placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300 ${
                              error
                                ? 'border-rose-400 bg-rose-50 text-rose-700'
                                : dirty
                                  ? 'border-brand-300 bg-brand-50/60 text-brand-800'
                                  : value
                                    ? 'border-slate-200 bg-surface text-slate-900'
                                    : 'border-transparent bg-slate-50 text-slate-900 hover:border-slate-200'
                            }`}
                          />
                          {entry?.late && !dirty && (
                            <span
                              title="Logged after the pay period closed"
                              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-slate-500 ring-2 ring-surface"
                            />
                          )}
                          {entry?.source === 'copilot' && !dirty && (
                            <span
                              title="Logged by Copilot"
                              className="absolute -bottom-1 -right-1 text-brand-500"
                            >
                              <Icon name="sparkles" className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                    {rowTotal(p.id) ? hours(rowTotal(p.id)) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <th
                  scope="row"
                  className="px-5 py-3 text-left text-xs font-semibold text-slate-500"
                >
                  Day total
                </th>
                {week.days.map((d) => {
                  const total = dayTotal(d.date);
                  const over = total > week.rules.maxHoursPerDay;
                  return (
                    <td
                      key={d.date}
                      className="px-2 py-3 text-center text-sm font-semibold tabular-nums"
                    >
                      <span
                        className={
                          over
                            ? 'text-rose-600'
                            : d.requiredHours > 0 && total >= d.requiredHours
                              ? 'text-emerald-600'
                              : total > 0
                                ? 'text-slate-700'
                                : 'text-slate-300'
                        }
                      >
                        {total ? hours(total) : '–'}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">
                  {hours(weekTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          {Object.keys(errors).length > 0 && (
            <ul className="space-y-1 border-t border-rose-100 bg-rose-50/60 px-5 py-3 text-xs text-rose-700">
              {Object.entries(errors).map(([k, message]) => {
                const [d, projectId] = k.split('|');
                const project = week.projects.find((p) => p.id === projectId);
                return (
                  <li key={k}>
                    <span className="font-semibold">
                      {project?.name ?? 'Project'}, {shortDate(d!)}:
                    </span>{' '}
                    {message}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Sticky save bar when there are unsaved changes. */}
      {(changed.length > 0 || saveError) && week && (
        <div className="fixed inset-x-0 bottom-0 z-30 animate-rise px-4 pb-4 lg:pl-72">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl dark:bg-slate-200 dark:ring-1 dark:ring-slate-300">
            <Icon
              name={saveError ? 'alert' : 'info'}
              className={`h-5 w-5 ${saveError ? 'text-rose-300' : 'text-brand-300'}`}
            />
            <p className="min-w-0 flex-1 text-sm">
              {saveError ?? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-300 hover:bg-white/10 hover:text-white dark:text-slate-600"
              onClick={() => {
                setGrid(initialGrid(week));
                setErrors({});
                setSaveError(null);
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="bg-surface text-slate-900 hover:bg-brand-50"
              disabled={saving || changed.length === 0}
              onClick={() => void save()}
              data-testid="save-timesheet"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-40 flex animate-slide-in items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lift"
        >
          <Icon name="checkCircle" className="h-4.5 w-4.5" /> {toast}
        </div>
      )}
    </div>
  );
}

function Legend() {
  const items = ['complete', 'partial', 'missing', 'holiday', 'leave'] as const;
  return (
    <div className="ml-auto hidden flex-wrap items-center gap-3 text-xs text-slate-500 xl:flex">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${DAY_STYLE[s].chip.split(' ')[0]}`} />
          {DAY_STYLE[s].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Late entry
      </span>
    </div>
  );
}

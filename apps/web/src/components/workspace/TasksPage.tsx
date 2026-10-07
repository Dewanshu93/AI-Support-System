'use client';

// My work: tasks assigned in the (mock) project tracker, as a board or a list.
import { TASK_STATUSES, type Task, type TaskStatus } from '@sd/shared';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { dueLabel } from '@/lib/format';
import { ViewToggle } from './ViewToggle';
import { PRIORITY_DOT, TASK_STATUS } from './styles';
import { ProjectChip, TaskRow } from './TaskRow';

const BOARD_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export function TasksPage() {
  const { state, reload } = useApi(() => api.myTasks('all'));
  const today = state.data?.today ?? '';
  const [view, setView] = useState<'board' | 'list'>('board');
  const [project, setProject] = useState<string | null>(null);

  const tasks = (state.data?.items ?? []).filter((t) => !project || t.project.id === project);
  const projects = [
    ...new Map((state.data?.items ?? []).map((t) => [t.project.id, t.project])).values(),
  ];

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Tasks"
        description="Work assigned to you in the project tracker."
        actions={<ViewToggle value={view} onChange={setView} />}
      />
      {state.kind === 'error' && !state.data ? (
        <ErrorState
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      ) : !state.data ? (
        <div className="grid gap-4 md:grid-cols-4">
          {BOARD_ORDER.map((s) => (
            <Skeleton key={s} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : state.data.items.length === 0 ? (
        <EmptyState
          icon="checklist"
          title="No tasks assigned"
          description="Tasks assigned to you appear here."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by project">
            <FilterChip active={!project} onClick={() => setProject(null)}>
              All projects
            </FilterChip>
            {projects.map((p) => (
              <FilterChip key={p.id} active={project === p.id} onClick={() => setProject(p.id)}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </FilterChip>
            ))}
          </div>
          {view === 'board' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {BOARD_ORDER.map((status) => (
                <Column
                  key={status}
                  status={status}
                  tasks={tasks.filter((t) => t.status === status)}
                  today={today}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white px-5 shadow-card">
              <ul className="divide-y divide-slate-100">
                {[...tasks]
                  .sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status))
                  .map((t) => (
                    <TaskRow key={t.id} task={t} today={today} />
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function Column({ status, tasks, today }: { status: TaskStatus; tasks: Task[]; today: string }) {
  const meta = TASK_STATUS[status];
  return (
    <section aria-label={meta.label} className="flex flex-col rounded-2xl bg-slate-100/70 p-3">
      <header className="mb-3 flex items-center justify-between px-1">
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
        <span className="text-xs font-medium text-slate-500">{tasks.length}</span>
      </header>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const due = dueLabel(t.dueDate, today);
          return (
            <li
              key={t.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-medium text-slate-500">{t.key}</span>
                <span
                  role="img"
                  aria-label={`${t.priority} priority`}
                  title={`${t.priority} priority`}
                  className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority]}`}
                />
              </div>
              <p
                className={`mt-1.5 text-sm font-medium ${t.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-900'}`}
              >
                {t.title}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <ProjectChip project={t.project} />
                {due && t.status !== 'done' && (
                  <span
                    className={`text-[11px] ${due.overdue ? 'font-medium text-rose-600' : 'text-slate-500'}`}
                  >
                    {due.text}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
            Nothing here
          </li>
        )}
      </ul>
    </section>
  );
}

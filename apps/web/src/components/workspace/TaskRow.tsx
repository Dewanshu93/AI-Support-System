import type { Task } from '@sd/shared';
import { Badge } from '@/components/ui/Badge';
import { dueLabel } from '@/lib/format';
import { PRIORITY_DOT, TASK_STATUS } from './styles';

export function ProjectChip({
  project,
}: {
  project: Pick<Task['project'], 'code' | 'name' | 'color'>;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: project.color }}
      />
      <span className="truncate">{project.name}</span>
    </span>
  );
}

export function TaskRow({ task, today }: { task: Task; today: string }) {
  const due = dueLabel(task.dueDate, today);
  const status = TASK_STATUS[task.status];
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        role="img"
        aria-label={`${task.priority} priority`}
        className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-medium whitespace-nowrap text-slate-500">
            {task.key}
          </span>
          <span className="truncate text-sm font-medium text-slate-900">{task.title}</span>
        </p>
        <div className="mt-0.5 flex items-center gap-3">
          <ProjectChip project={task.project} />
          {due && (
            <span
              className={`text-xs ${due.overdue ? 'font-medium text-rose-600' : 'text-slate-500'}`}
            >
              {due.text}
            </span>
          )}
        </div>
      </div>
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
    </li>
  );
}

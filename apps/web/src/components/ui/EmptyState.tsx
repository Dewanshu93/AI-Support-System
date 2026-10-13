import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Empty state with a next action (playbook section 10). */
export function EmptyState({
  title,
  description,
  action,
  icon = 'inbox',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-surface/60 px-6 py-10 text-center">
      <span className="mb-1 grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon name={icon} />
      </span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <div className="max-w-md text-sm text-slate-500">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

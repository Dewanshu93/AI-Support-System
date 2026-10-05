import type { ReactNode } from 'react';

/** Empty state with a next action (playbook section 10). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <div className="max-w-md text-sm text-slate-600">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

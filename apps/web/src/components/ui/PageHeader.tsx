import type { ReactNode } from 'react';

/** Page title (the page's only h1), description and actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

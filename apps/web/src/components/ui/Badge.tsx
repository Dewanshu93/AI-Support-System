import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200/80',
  info: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200/80',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200/80',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200/80',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/80',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  brand: 'bg-brand-500',
  violet: 'bg-violet-500',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

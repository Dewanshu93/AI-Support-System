// Visual vocabulary for workspace statuses, shared by the dashboard and pages.
import type { DayStatus, TaskStatus, TicketStatus } from '@sd/shared';
import type { Tone } from '@/components/ui/Badge';
import type { IconName } from '@/components/ui/Icon';

export const DAY_STYLE: Record<
  DayStatus,
  { label: string; icon: IconName | null; tile: string; chip: string }
> = {
  complete: {
    label: 'Complete',
    icon: 'check',
    tile: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
    chip: 'bg-emerald-500 text-white',
  },
  partial: {
    label: 'Partial',
    icon: 'alert',
    tile: 'border-amber-200 bg-amber-50/80 text-amber-700',
    chip: 'bg-amber-500 text-white',
  },
  missing: {
    label: 'Missing',
    icon: 'alert',
    tile: 'border-rose-200 bg-rose-50/80 text-rose-700',
    chip: 'bg-rose-500 text-white',
  },
  today: {
    label: 'Today',
    icon: 'clock',
    tile: 'border-brand-300 bg-surface text-brand-700 ring-2 ring-brand-500/20',
    chip: 'bg-brand-600 text-white',
  },
  future: {
    label: 'Upcoming',
    icon: null,
    tile: 'border-dashed border-slate-200 bg-surface text-slate-400',
    chip: 'bg-slate-200 text-slate-500',
  },
  weekend: {
    label: 'Weekend',
    icon: null,
    tile: 'border-transparent bg-slate-100/70 text-slate-400',
    chip: 'bg-slate-200 text-slate-500',
  },
  holiday: {
    label: 'Holiday',
    icon: 'sparkles',
    tile: 'border-violet-200 bg-violet-50/80 text-violet-700',
    chip: 'bg-violet-500 text-white',
  },
  leave: {
    label: 'Leave',
    icon: 'calendar',
    tile: 'border-sky-200 bg-sky-50/80 text-sky-700',
    chip: 'bg-sky-500 text-white',
  },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  in_progress: { label: 'In progress', tone: 'brand' },
  in_review: { label: 'In review', tone: 'violet' },
  todo: { label: 'To do', tone: 'neutral' },
  done: { label: 'Done', tone: 'success' },
};

export const PRIORITY_DOT: Record<'low' | 'medium' | 'high', string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

/** Employee-facing request stages in order (Build Contract v2.0, section G). */
export const REQUEST_FLOW: { status: TicketStatus; label: string }[] = [
  { status: 'new', label: 'Escalated' },
  { status: 'in_progress', label: 'Under review' },
  { status: 'waiting_on_employee', label: 'Waiting for you' },
  { status: 'resolved', label: 'Resolved' },
];

export const REQUEST_TONE: Record<TicketStatus, Tone> = {
  new: 'info',
  in_progress: 'brand',
  waiting_on_employee: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

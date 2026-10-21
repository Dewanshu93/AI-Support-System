import type { NotificationKind } from '@sd/shared';
import { Icon, type IconName } from '@/components/ui/Icon';

const STYLE: Record<NotificationKind, { icon: IconName; className: string }> = {
  payroll: { icon: 'wallet', className: 'bg-rose-50 text-rose-600' },
  timesheet: { icon: 'clock', className: 'bg-amber-50 text-amber-600' },
  request: { icon: 'inbox', className: 'bg-sky-50 text-sky-600' },
  task: { icon: 'checklist', className: 'bg-violet-50 text-violet-600' },
  leave: { icon: 'calendar', className: 'bg-emerald-50 text-emerald-600' },
  system: { icon: 'info', className: 'bg-slate-100 text-slate-600' },
};

export function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const { icon, className } = STYLE[kind];
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${className}`}>
      <Icon name={icon} className="h-4.5 w-4.5" />
    </span>
  );
}

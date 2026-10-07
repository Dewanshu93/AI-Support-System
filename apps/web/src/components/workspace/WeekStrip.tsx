import type { TimesheetDay } from '@sd/shared';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { dayOfMonth, hours, shortDate, weekday } from '@/lib/format';
import { DAY_STYLE } from './styles';

/** Seven day tiles (Mon–Sun) with the status of each day; links to the timesheet. */
export function WeekStrip({ days }: { days: TimesheetDay[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="This week">
      {days.map((d) => {
        const style = DAY_STYLE[d.status];
        return (
          <li key={d.date}>
            <Link
              href={`/timesheets?date=${d.date}`}
              data-status={d.status}
              title={`${shortDate(d.date)}: ${d.label ?? style.label}${d.hours ? `, ${hours(d.hours)}` : ''}`}
              className={`group flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition hover:shadow-card sm:py-3 ${style.tile}`}
            >
              <span className="text-[11px] font-medium tracking-wide uppercase opacity-80">
                {weekday(d.date)}
              </span>
              <span className="font-display text-lg leading-none font-semibold text-slate-900 sm:text-xl">
                {dayOfMonth(d.date)}
              </span>
              <span className="flex h-5 items-center gap-1 text-[11px] font-medium">
                {style.icon && (
                  <Icon name={style.icon} className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
                <span className="hidden sm:inline">
                  {d.hours > 0
                    ? hours(d.hours)
                    : d.status === 'future' || d.status === 'weekend'
                      ? '–'
                      : style.label}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

import type { TicketStatus } from '@sd/shared';
import { REQUEST_FLOW } from './styles';

/** Compact progress through the employee-facing request stages. */
export function RequestStepper({ status }: { status: TicketStatus }) {
  const current =
    status === 'closed'
      ? REQUEST_FLOW.length - 1
      : REQUEST_FLOW.findIndex((s) => s.status === status);
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`Stage ${current + 1} of ${REQUEST_FLOW.length}`}
    >
      {REQUEST_FLOW.map((step, i) => (
        <span
          key={step.status}
          title={step.label}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < current
              ? 'bg-brand-500'
              : i === current
                ? status === 'resolved' || status === 'closed'
                  ? 'bg-emerald-500'
                  : status === 'waiting_on_employee'
                    ? 'bg-amber-400'
                    : 'bg-brand-500'
                : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

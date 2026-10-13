'use client';

import type { TicketStatus } from '@sd/shared';
import { AGENT_STATUS_LABEL } from '@/lib/agentTicket';

/**
 * The ticket's status with the moves the workflow allows from it (from the API).
 * A closed ticket allows none, so the selector is read-only.
 */
export function StatusSelector({
  status,
  allowed,
  busy,
  onChange,
}: {
  status: TicketStatus;
  allowed: TicketStatus[];
  busy: boolean;
  onChange: (next: TicketStatus) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>Status</span>
      <select
        data-testid="status-select"
        value={status}
        disabled={busy || allowed.length === 0}
        onChange={(e) => onChange(e.target.value as TicketStatus)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
      >
        <option value={status}>{AGENT_STATUS_LABEL[status]}</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            → {AGENT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

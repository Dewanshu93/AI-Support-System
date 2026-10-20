// "Needs your attention" (UC-12): what the employee should act on, most urgent
// first. The items and their order come from GET /api/dashboard (code, no
// model); this card only words them and links to the action.
import type { AttentionItem } from '@sd/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { copilotHref } from '@/lib/copilot';
import { hours, shortDate } from '@/lib/format';

const SHOWN = 5;

interface Action {
  label: string;
  href: string;
  ai?: boolean;
}

export interface AttentionText {
  key: string;
  title: string;
  detail: string;
  actions: Action[];
}

/** The words and links for one item. Pure, so it is unit-tested. */
export function attentionText(item: AttentionItem): AttentionText {
  switch (item.kind) {
    case 'lop_risk': {
      const day = shortDate(item.date);
      return {
        key: `lop:${item.date}`,
        title: `${day} may be deducted as Loss of Pay`,
        detail: `It had no timesheet or attendance record at the payroll cutoff (${shortDate(item.cutoff)}). Log the hours as a late entry and ask Payroll for a Loss of Pay review.`,
        actions: [
          { label: 'Log hours', href: `/timesheets?date=${item.date}` },
          {
            label: 'Contact Payroll',
            href: copilotHref(`Contact payroll about Loss of Pay for ${day}`),
            ai: true,
          },
        ],
      };
    }
    case 'timesheet_gap': {
      const day = shortDate(item.date);
      const logged =
        item.hours === 0
          ? 'Nothing logged.'
          : `${hours(item.hours)} of ${hours(item.requiredHours)} logged.`;
      const detail = item.lopCutoff
        ? `No timesheet or attendance record. Log it by ${shortDate(item.lopCutoff)} (payroll cutoff) or it counts as Loss of Pay.`
        : logged;
      const manual = { label: 'Log manually', href: `/timesheets?date=${item.date}` };
      return {
        key: `gap:${item.date}`,
        title: `Log hours for ${day}`,
        detail,
        actions:
          item.hours === 0
            ? [
                {
                  label: 'Log with Copilot',
                  href: copilotHref(`Log ${item.requiredHours} hours for ${day}`),
                  ai: true,
                },
                manual,
              ]
            : [manual],
      };
    }
    case 'request_waiting':
      return {
        key: `req:${item.request.id}`,
        title: `${item.request.humanId} is waiting for your reply`,
        detail: item.request.summary,
        actions: [{ label: 'Open request', href: `/tickets/${item.request.id}` }],
      };
  }
}

export function AttentionCard({ items }: { items: AttentionItem[] }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const urgent = items.filter((i) => i.severity === 'urgent').length;
  const hidden = items.length - SHOWN;
  return (
    <Card data-testid="attention-card">
      <CardHeader
        icon={<Icon name="alert" className="h-4.5 w-4.5" />}
        title="Needs your attention"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}${urgent > 0 ? ` · ${urgent} urgent` : ''}`}
      />
      <ul className="-my-3 divide-y divide-slate-100">
        {(all ? items : items.slice(0, SHOWN)).map((item) => {
          const t = attentionText(item);
          return (
            <li
              key={t.key}
              data-testid="attention-item"
              data-kind={item.kind}
              data-severity={item.severity}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {t.title}
                  {item.severity === 'urgent' && (
                    <Badge tone="danger" dot>
                      Urgent
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{t.detail}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {t.actions.map((a) => (
                  <Link key={a.label} href={a.href}>
                    <Button variant={a.ai ? 'ai' : 'secondary'} size="sm">
                      {a.ai && <Icon name="sparkles" className="h-3.5 w-3.5" />} {a.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {all ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </Card>
  );
}

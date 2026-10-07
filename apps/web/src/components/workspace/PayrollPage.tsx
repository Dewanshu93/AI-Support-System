'use client';

// Payslips (Build Contract v2.0 flow 5): list and statement. Loss of Pay lines
// are highlighted with their dates and link to the copilot and to the timesheet.
import type { Payslip, PayslipSummary } from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { copilotHref } from '@/lib/copilot';
import { dateSpan, longDate, money, shortDate } from '@/lib/format';

export function PayrollPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const list = useApi(api.payslips);
  const items = list.state.data?.items ?? [];
  const selectedId = params.get('id') ?? items[0]?.id ?? null;
  const detail = useApi(
    () => (selectedId ? api.payslip(selectedId) : Promise.resolve(null)),
    selectedId ?? '',
  );

  const header = (
    <PageHeader
      eyebrow="Payroll"
      title="Payslips"
      description="Your pay statements. Deductions are calculated by payroll rules, not by AI."
    />
  );

  if (list.state.kind === 'error' && !list.state.data) {
    return (
      <>
        {header}
        <ErrorState
          message={list.state.error.message}
          requestId={list.state.error.requestId}
          onRetry={() => void list.reload()}
        />
      </>
    );
  }
  if (!list.state.data) {
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </>
    );
  }
  if (list.state.data.paidByAgency) {
    return (
      <>
        {header}
        <EmptyState
          icon="briefcase"
          title="You are paid by your agency"
          description="Contractors receive payslips from their agency. Company payroll does not hold pay records for you."
        />
      </>
    );
  }
  if (items.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="wallet"
          title="No payslips yet"
          description="Payslips appear here after each pay date."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <nav aria-label="Payslips" className="space-y-2">
          {items.map((p) => (
            <PayslipListItem
              key={p.id}
              slip={p}
              active={p.id === selectedId}
              onSelect={() => router.replace(`${pathname}?id=${p.id}`, { scroll: false })}
            />
          ))}
        </nav>
        <div>
          {detail.state.kind === 'error' ? (
            <ErrorState
              message={detail.state.error.message}
              requestId={detail.state.error.requestId}
              onRetry={() => void detail.reload()}
            />
          ) : detail.state.data ? (
            <Statement slip={detail.state.data} />
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          )}
        </div>
      </div>
    </>
  );
}

function PayslipListItem({
  slip,
  active,
  onSelect,
}: {
  slip: PayslipSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
        active
          ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-300'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {dateSpan(slip.periodStart, slip.periodEnd)}
        </span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {money(slip.net, slip.currency)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Paid {shortDate(slip.payDate)}</span>
        {slip.lopAmount > 0 && (
          <Badge tone="danger">LOP −{money(slip.lopAmount, slip.currency)}</Badge>
        )}
      </div>
    </button>
  );
}

function Statement({ slip }: { slip: Payslip }) {
  const lop = slip.deductions.filter((d) => d.code === 'lop');
  const lopDates = lop.flatMap((d) => d.dates);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Pay period {longDate(slip.periodStart)} – {longDate(slip.periodEnd)}
          </p>
          <h2 className="font-display mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {money(slip.net, slip.currency)}
          </h2>
          <p className="text-sm text-slate-500">Net pay, paid {longDate(slip.payDate)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <dt className="text-slate-500">Gross</dt>
          <dd className="text-right font-medium text-slate-900 tabular-nums">
            {money(slip.gross, slip.currency)}
          </dd>
          <dt className="text-slate-500">Deductions</dt>
          <dd className="text-right font-medium text-slate-900 tabular-nums">
            −{money(slip.totalDeductions, slip.currency)}
          </dd>
        </dl>
      </div>

      {lop.length > 0 && (
        <div className="border-b border-rose-100 bg-rose-50/60 px-6 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-100 text-rose-700">
              <Icon name="trendDown" className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-900">
                Loss of Pay deducted for {lopDates.map(shortDate).join(', ')}
              </p>
              <p className="mt-0.5 text-sm text-rose-800">
                {(
                  lop[0]!.note ?? 'No timesheet or attendance record at the payroll cutoff'
                ).replace(/\.?$/, '.')}{' '}
                If you worked that day, log the hours and ask payroll to review the deduction.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={copilotHref(`Why was my salary reduced for ${shortDate(lopDates[0]!)}?`)}
                >
                  <Button variant="ai" size="sm">
                    <Icon name="sparkles" className="h-3.5 w-3.5" /> Ask Copilot why
                  </Button>
                </Link>
                <Link href={`/timesheets?date=${lopDates[0]}`}>
                  <Button variant="secondary" size="sm">
                    Open timesheet for {shortDate(lopDates[0]!)}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-8 p-6 md:grid-cols-2">
        <section aria-labelledby="earnings">
          <h3
            id="earnings"
            className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
          >
            Earnings
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {slip.earnings.map((e) => (
                <tr key={e.code} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 text-slate-700">{e.label}</td>
                  <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">
                    {money(e.amount, slip.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <th scope="row" className="py-2.5 text-left font-semibold text-slate-900">
                  Gross pay
                </th>
                <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  {money(slip.gross, slip.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
        <section aria-labelledby="deductions">
          <h3
            id="deductions"
            className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
          >
            Deductions
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {slip.deductions.map((d) => (
                <tr
                  key={`${d.code}-${d.label}`}
                  className={`border-b border-slate-100 last:border-0 ${d.code === 'lop' ? 'bg-rose-50/70' : ''}`}
                >
                  <td
                    className={`py-2.5 ${d.code === 'lop' ? 'pl-2 font-medium text-rose-800' : 'text-slate-700'}`}
                  >
                    {d.label}
                    {d.dates.length > 0 && (
                      <span className="block text-xs font-normal text-rose-700">
                        {d.dates.map(longDate).join(', ')}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2.5 pr-2 text-right font-medium tabular-nums ${d.code === 'lop' ? 'text-rose-800' : 'text-slate-900'}`}
                  >
                    −{money(d.amount, slip.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <th scope="row" className="py-2.5 text-left font-semibold text-slate-900">
                  Total deductions
                </th>
                <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  −{money(slip.totalDeductions, slip.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>
      <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
        Questions about this payslip? Ask Copilot, or raise a payroll request from the chat.
      </p>
    </Card>
  );
}

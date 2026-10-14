'use client';

// Knowledge base (W4-04, playbook section 10): every document version with its
// status, audience, version and ingest status; filters in the URL; upload.
import {
  type AdminDocument,
  COUNTRIES,
  type Country,
  DOCUMENT_STATUSES,
  type DocumentStatus,
  DOMAINS,
  type Domain,
} from '@sd/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { EMPLOYMENT_LABEL } from '@/lib/roles';
import { UploadDialog } from './UploadDialog';

export const STATUS_TONE = {
  active: 'success',
  superseded: 'neutral',
  inactive: 'warning',
} as const;
export const INGEST_TONE = { indexed: 'success', pending: 'info', failed: 'danger' } as const;

export function audienceLabel(d: AdminDocument): string {
  const who = d.employmentTypes.map((t) => EMPLOYMENT_LABEL[t]).join(' & ');
  return `${d.countries.join(', ')} · ${who}${d.accessLevel === 'manager' ? ' · managers' : ''}`;
}

const selectClass = 'h-9 rounded-lg border border-slate-300 bg-surface px-2 text-sm';

export function DocumentTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const domain = (params.get('domain') ?? '') as Domain | '';
  const status = (params.get('status') ?? '') as DocumentStatus | '';
  const country = (params.get('country') ?? '') as Country | '';

  const [items, setItems] = useState<AdminDocument[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      setItems(
        await api.adminDocuments({
          domain: domain || undefined,
          status: status || undefined,
          country: country || undefined,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [domain, status, country]);

  useEffect(() => void load(), [load]);

  const setFilter = (key: string, value: string) => {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(q.toString() ? `${pathname}?${q}` : pathname);
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Documents"
        description="The policies the copilot answers from. Each version shows who can see it and whether it is indexed."
        actions={
          <Button onClick={() => setUploading(true)}>
            <Icon name="plus" className="h-4 w-4" /> Upload policy
          </Button>
        }
      />
      <Card className="mb-4 flex flex-wrap items-end gap-3" data-testid="document-filters">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Domain
          <select
            className={selectClass}
            value={domain}
            onChange={(e) => setFilter('domain', e.target.value)}
          >
            <option value="">Any</option>
            {DOMAINS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Status
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">Any</option>
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Country
          <select
            className={selectClass}
            value={country}
            onChange={(e) => setFilter('country', e.target.value)}
          >
            <option value="">Any</option>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </Card>

      {error && (
        <ErrorState
          title="Could not load documents"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      )}
      {!error && !items && (
        <div role="status" aria-label="Loading documents" className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <EmptyState
          title="No documents"
          description={
            domain || status || country
              ? 'Nothing matches these filters.'
              : 'Run "npm run ingest" to load the corpus, or upload a policy.'
          }
          icon="file"
        />
      )}
      {items && items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="document-table">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                {['Document', 'Version', 'Status', 'Audience', 'Chunks', 'Index'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50" data-testid="document-row">
                  <td className="max-w-96 px-4 py-2.5">
                    <Link
                      href={`/admin/documents/${d.id}`}
                      className="block font-medium text-slate-900 hover:text-brand-700"
                    >
                      <span className="block truncate">{d.title}</span>
                      <span className="block truncate font-mono text-[11px] font-normal text-slate-400">
                        {d.domain} · {d.slug}
                        {d.sourceType === 'pdf' && ' · PDF'}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                    v{d.version}
                    <span className="block text-[11px] text-slate-400">from {d.effectiveDate}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                    {audienceLabel(d)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.chunkCount}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={INGEST_TONE[d.ingestStatus]}>{d.ingestStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {uploading && (
        <UploadDialog
          onClose={() => setUploading(false)}
          onUploaded={(doc) => {
            setUploading(false);
            router.push(`/admin/documents/${doc.id}`);
          }}
        />
      )}
    </>
  );
}

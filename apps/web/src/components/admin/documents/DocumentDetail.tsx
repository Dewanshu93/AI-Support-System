'use client';

// One document version (W4-04): metadata, audience, index state, its chunks, and
// the admin actions (re-index, activate / deactivate, upload a new version).
import type { AdminDocumentDetailResponse, DocumentStatus } from '@sd/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { audienceLabel, INGEST_TONE, STATUS_TONE } from './DocumentTable';
import { UploadDialog } from './UploadDialog';

type Data = AdminDocumentDetailResponse;

export function DocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [newVersion, setNewVersion] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.adminDocument(id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK', 'Cannot reach the service.'),
      );
    }
  }, [id]);

  useEffect(() => void load(), [load]);

  const act = async (label: string, run: () => Promise<unknown>, done: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await run();
      await load();
      setNotice({ tone: 'ok', text: done });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'The action failed.',
      });
    } finally {
      setBusy(null);
    }
  };

  const d = data?.document;
  const setStatus = (status: DocumentStatus, done: string) =>
    act(status, () => api.setDocumentStatus(id, status), done);

  return (
    <>
      <Link
        href="/admin/documents"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <Icon name="chevronLeft" className="h-4 w-4" /> All documents
      </Link>
      <PageHeader
        eyebrow={d ? `${d.domain} · ${d.slug}` : 'Document'}
        title={d ? `${d.title} v${d.version}` : 'Document'}
        actions={
          d && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setNewVersion(true)}
                disabled={busy !== null}
              >
                <Icon name="plus" className="h-4 w-4" /> New version
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null || d.ingestStatus === 'pending'}
                onClick={() =>
                  void act(
                    'reindex',
                    () => api.reindexDocument(id),
                    'Re-indexed from the source file.',
                  )
                }
              >
                <Icon
                  name="refresh"
                  className={`h-4 w-4 ${busy === 'reindex' ? 'animate-spin' : ''}`}
                />
                {busy === 'reindex' ? 'Re-indexing…' : 'Re-index'}
              </Button>
              {d.status === 'active' ? (
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() =>
                    void setStatus(
                      'inactive',
                      'Deactivated: the copilot no longer uses this version.',
                    )
                  }
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    void setStatus('active', 'Activated: the copilot can use this version again.')
                  }
                >
                  Activate
                </Button>
              )}
            </div>
          )
        }
      />
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {notice.text}
        </p>
      )}
      {error && (
        <ErrorState
          title={error.status === 404 ? 'Document not found' : 'Could not load the document'}
          message={error.message}
          requestId={error.requestId}
          onRetry={error.status === 404 ? undefined : () => void load()}
        />
      )}
      {!error && !data && (
        <div
          role="status"
          aria-label="Loading document"
          className="grid gap-5 lg:grid-cols-[22rem_1fr]"
        >
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      )}
      {d && data && (
        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card className="space-y-3 self-start text-sm" data-testid="document-meta">
            {(
              [
                [
                  'Status',
                  <Badge key="s" tone={STATUS_TONE[d.status]}>
                    {d.status}
                  </Badge>,
                ],
                [
                  'Index',
                  <span key="i" className="flex flex-wrap items-center gap-2">
                    <Badge tone={INGEST_TONE[d.ingestStatus]}>{d.ingestStatus}</Badge>
                    <span className="text-slate-500">{d.chunkCount} chunks</span>
                  </span>,
                ],
                ['Audience', audienceLabel(d)],
                ['Effective from', d.effectiveDate],
                ['Owner', d.owner],
                ['Source', d.sourceType === 'pdf' ? 'PDF upload' : 'Markdown'],
                ['Updated', new Date(d.updatedAt).toLocaleString()],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-slate-500">{k}</span>
                <span className="text-right text-slate-800">{v}</span>
              </div>
            ))}
            {d.supersededBy && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Replaced by a newer version.{' '}
                <Link
                  href={`/admin/documents/${d.supersededBy}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Open it
                </Link>
              </p>
            )}
            {d.ingestError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                Indexing failed: {d.ingestError}
              </p>
            )}
          </Card>

          <Card className="space-y-3" data-testid="chunk-list">
            <p className="text-sm font-semibold text-slate-900">Chunks</p>
            {data.chunks.length === 0 ? (
              <p className="text-sm text-slate-500">No chunks stored. Re-index to rebuild them.</p>
            ) : (
              <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
                {data.chunks.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">#{c.ordinal + 1}</span>
                      <span className="truncate">
                        {c.sectionPath.join(' › ') || 'Introduction'}
                      </span>
                      <span className="ml-auto tabular-nums">{c.tokenCount} tokens</span>
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{c.preview}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {newVersion && d && (
        <UploadDialog
          supersede={d}
          onClose={() => setNewVersion(false)}
          onUploaded={(doc) => {
            setNewVersion(false);
            router.push(`/admin/documents/${doc.id}`);
          }}
        />
      )}
    </>
  );
}

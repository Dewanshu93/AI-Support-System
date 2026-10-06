'use client';

// Source viewer (playbook section 10): the cited passage with its document
// context; step to neighbouring chunks. A 404 means the caller may not read it.
import type { SourceChunkResponse } from '@sd/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';

export function SourceDrawer({
  chunkId,
  sectionPath,
  onNavigate,
  onClose,
}: {
  chunkId: string;
  sectionPath?: string[];
  onNavigate: (chunkId: string) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ok'; data: SourceChunkResponse }
    | { kind: 'error'; notFound: boolean }
  >({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    api.source(chunkId).then(
      (data) => live && setState({ kind: 'ok', data }),
      (err: unknown) =>
        live &&
        setState({ kind: 'error', notFound: err instanceof ApiError && err.status === 404 }),
    );
    return () => {
      live = false;
    };
  }, [chunkId]);

  return (
    <aside
      data-testid="source-drawer"
      role="dialog"
      aria-label="Source"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Source</p>
        <Button variant="ghost" onClick={onClose} aria-label="Close source">
          Close
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {state.kind === 'loading' && <Spinner label="Loading source" />}
        {state.kind === 'error' && (
          <p data-testid="source-unavailable" className="text-slate-700">
            {state.notFound
              ? 'Source not available.'
              : 'The source could not be loaded. Try again.'}
          </p>
        )}
        {state.kind === 'ok' && (
          <>
            <div className="space-y-1">
              <p data-testid="source-title" className="text-base font-semibold text-slate-900">
                {state.data.document.title}
              </p>
              <p className="text-xs text-slate-600">
                Version {state.data.document.version} · effective{' '}
                {state.data.document.effectiveDate.slice(0, 10)} · owner {state.data.document.owner}
              </p>
              <p className="text-xs text-slate-500">
                {(sectionPath ?? state.data.chunk.sectionPath).join(' › ')}
              </p>
            </div>
            <blockquote
              data-testid="source-text"
              className="rounded-md border-l-4 border-sky-400 bg-sky-50 px-3 py-2 whitespace-pre-wrap text-slate-900"
            >
              {state.data.chunk.text}
            </blockquote>
            <div className="flex justify-between">
              <Button
                variant="secondary"
                disabled={!state.data.neighbours[0]}
                onClick={() => onNavigate(state.data.neighbours[0]!)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!state.data.neighbours[1]}
                onClick={() => onNavigate(state.data.neighbours[1]!)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

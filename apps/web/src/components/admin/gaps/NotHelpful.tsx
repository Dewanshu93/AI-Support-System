'use client';

// Answers employees rated "Not helpful" (UC-16, ADR-029), with their reason and the
// trace, so the team can fix the knowledge base, and turn a case into a draft
// golden-set line to review and paste into evals/golden. Nothing is written here.
import type { AdminFeedback } from '@sd/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';

/**
 * A draft golden case (evals/golden, schema in evals/runner/schema.ts). The id, the
 * category and the expected decision are placeholders for a person to decide: the
 * rating says the answer was wrong, not what the right one is.
 */
export function draftGoldenCase(f: AdminFeedback): string {
  return JSON.stringify({
    id: 'HR-ANS-XXX',
    category: 'answerable',
    tags: [],
    userEmail: f.userEmail ?? 'priya.shah@example.com',
    turns: [{ role: 'user', content: f.question ?? '' }],
    expected: { decision: 'ANSWER', docSlugs: [], forbiddenDocSlugs: [], keyFacts: [] },
    notes: `From a "Not helpful" rating${f.comment ? ` (${f.comment})` : ''}; was ${f.decision ?? 'unknown'}${f.reasonCode ? ` ${f.reasonCode}` : ''}. Set id, category, decision, documents and key facts.`,
  });
}

export function NotHelpful() {
  const { state, reload } = useApi(() => api.adminFeedback('down'));
  return (
    <Card className="mt-6" data-testid="not-helpful">
      <CardHeader
        icon={<Icon name="alert" className="h-4.5 w-4.5" />}
        title="Rated not helpful"
        subtitle="Answers employees marked “Not helpful”, newest first. Questions are redacted; confidential ones stay in the trace viewer."
      />
      {state.kind === 'error' && !state.data ? (
        <ErrorState
          title="Could not load ratings"
          message={state.error.message}
          requestId={state.error.requestId}
          onRetry={() => void reload()}
        />
      ) : !state.data ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : state.data.items.length === 0 ? (
        <p className="text-sm text-slate-500">No answer has been rated not helpful yet.</p>
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">
          {state.data.items.map((f) => (
            <FeedbackRow key={f.id} item={f} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FeedbackRow({ item: f }: { item: AdminFeedback }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draftGoldenCase(f));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li data-testid="feedback-row" className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
          {f.question ?? <span className="text-slate-500">(confidential or not traced)</span>}
        </p>
        {f.decision && <Badge>{f.decision}</Badge>}
        {f.profile && (
          <Badge tone="neutral">
            {f.profile.country} ·{' '}
            {f.profile.employmentType === 'full_time' ? 'Full-time' : 'Contractor'}
          </Badge>
        )}
      </div>
      {f.comment && (
        <p className="text-sm text-rose-800">
          <span className="font-medium">Reason:</span> {f.comment}
        </p>
      )}
      {f.answerExcerpt && <p className="line-clamp-2 text-xs text-slate-600">{f.answerExcerpt}</p>}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500">{relativeTime(f.createdAt)}</span>
        {f.traceId && (
          <Link
            href={`/admin/traces/${f.conversationId}`}
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Open trace →
          </Link>
        )}
        {f.question && (
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy as golden case'}
          </Button>
        )}
      </div>
    </li>
  );
}

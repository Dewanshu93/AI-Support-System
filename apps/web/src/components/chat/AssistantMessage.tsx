'use client';

// One assistant reply: answer text with citation chips, decision badge and the
// cards for safety, handoff and ticket drafts. Used for live and stored turns.
import type { CitationDto, Decision } from '@sd/shared';
import { Badge } from '@/components/ui/Badge';
import { splitMarkers } from '@/lib/chatTurn';
import { HandoffCard } from './HandoffCard';
import { TicketDraftCard } from './TicketDraftCard';

export interface AssistantView {
  text: string;
  citations: CitationDto[];
  /** False while markers are still waiting for the citations event. */
  citationsResolved: boolean;
  decision: Decision | null;
  reasonCode: string | null;
  withdrawn: boolean;
  failed?: boolean;
  handoff?: {
    kind: 'sensitive' | 'out_of_scope';
    contact?: string;
    offerPrivateContact?: boolean;
  } | null;
  ticketDraft?: Record<string, unknown> | null;
}

const DECISION_LABEL: Record<
  Decision,
  { label: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  ANSWER: { label: 'Answer', tone: 'success' },
  PARTIAL: { label: 'Partial answer', tone: 'warning' },
  CLARIFY: { label: 'Question for you', tone: 'info' },
  ESCALATE: { label: 'Escalation', tone: 'warning' },
  OUT_OF_SCOPE: { label: 'Out of scope', tone: 'neutral' },
  SENSITIVE_HANDOFF: { label: 'Handed to HR', tone: 'danger' },
};

export function AssistantMessage({
  view,
  onCitation,
  footer,
}: {
  view: AssistantView;
  onCitation: (citation: CitationDto) => void;
  footer?: React.ReactNode;
}) {
  const byMarker = new Map(view.citations.map((c) => [c.marker, c]));
  const safety = view.decision === 'ESCALATE' && view.reasonCode === 'SAFETY';

  if (view.handoff) {
    return (
      <HandoffCard
        kind={view.handoff.kind}
        text={view.text}
        contact={view.handoff.contact}
        offer={!!view.handoff.offerPrivateContact}
      />
    );
  }

  return (
    <div data-testid="assistant-message" data-decision={view.decision ?? ''} className="space-y-2">
      {safety && (
        <div
          data-testid="safety-notice"
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Safety first: follow these steps now. A ticket is being prepared so a person can help.
        </div>
      )}
      <div
        className={`rounded-lg border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          view.failed
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : view.withdrawn
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {splitMarkers(view.text).map((part, i) => {
          if (part.kind === 'text') return <span key={i}>{part.text}</span>;
          const citation = byMarker.get(part.marker);
          if (citation) {
            return (
              <button
                key={i}
                type="button"
                data-testid="citation-chip"
                onClick={() => onCitation(citation)}
                title={`${citation.docTitle} › ${citation.sectionPath.join(' › ')}`}
                className="mx-0.5 inline-flex items-center rounded bg-sky-100 px-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-200"
              >
                {part.marker}
              </button>
            );
          }
          // Not (yet) resolved: pending while streaming, hidden once validated.
          return view.citationsResolved ? null : (
            <span
              key={i}
              data-testid="citation-pending"
              className="mx-0.5 inline-flex animate-pulse rounded bg-slate-100 px-1.5 text-xs text-slate-500"
            >
              {part.marker}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view.decision && (
          <Badge tone={DECISION_LABEL[view.decision].tone}>
            {DECISION_LABEL[view.decision].label}
          </Badge>
        )}
        {view.withdrawn && <Badge tone="warning">Answer withdrawn</Badge>}
        {view.citations.length > 0 && (
          <span className="text-xs text-slate-500">
            Sources: {[...new Set(view.citations.map((c) => c.docTitle))].join(', ')}
          </span>
        )}
      </div>
      {view.ticketDraft && <TicketDraftCard draft={view.ticketDraft} />}
      {footer}
    </div>
  );
}

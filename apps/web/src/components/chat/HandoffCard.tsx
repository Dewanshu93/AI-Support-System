'use client';

// Templated replies: sensitive handoff (with the private-contact offer) and
// out of scope. No AI text and no sources are ever shown here. "Yes" confirms
// the restricted HR case the graph prepared; "No thanks" cancels it (ADR-013).
import { Button } from '@/components/ui/Button';

export interface PrivateContactOffer {
  busy: boolean;
  error: string | null;
  onAnswer: (yes: boolean) => void;
}

export function HandoffCard({
  kind,
  text,
  contact,
  offer,
}: {
  kind: 'sensitive' | 'out_of_scope';
  text: string;
  contact?: string;
  /** The open private-contact offer; null once answered (or while the turn streams). */
  offer: PrivateContactOffer | null;
}) {
  const sensitive = kind === 'sensitive';
  return (
    <div
      data-testid="handoff-card"
      data-kind={kind}
      className={`space-y-3 rounded-lg border px-4 py-3 text-sm ${
        sensitive
          ? 'border-violet-200 bg-violet-50 text-violet-950'
          : 'border-slate-200 bg-slate-50 text-slate-800'
      }`}
    >
      <p className="font-semibold">
        {sensitive ? 'This needs a person, in confidence' : 'Outside what I can help with'}
      </p>
      <p className="whitespace-pre-wrap">{text}</p>
      {contact && (
        <p className="text-xs">
          Contact: <span className="font-medium">{contact}</span>
        </p>
      )}
      {sensitive && offer && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="private-contact-yes"
              disabled={offer.busy}
              onClick={() => offer.onAnswer(true)}
            >
              Yes, contact me privately
            </Button>
            <Button
              variant="secondary"
              data-testid="private-contact-no"
              disabled={offer.busy}
              onClick={() => offer.onAnswer(false)}
            >
              No thanks
            </Button>
          </div>
          <p className="text-xs text-violet-800">Only the HR case team sees a private request.</p>
          {offer.error && (
            <p data-testid="private-contact-error" role="alert" className="text-xs text-rose-700">
              {offer.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

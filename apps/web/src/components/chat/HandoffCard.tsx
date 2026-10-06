'use client';

// Templated replies: sensitive handoff (with the private-contact offer) and
// out of scope. No AI text and no sources are ever shown here.
import { Button } from '@/components/ui/Button';

export function HandoffCard({
  kind,
  text,
  contact,
  offer,
}: {
  kind: 'sensitive' | 'out_of_scope';
  text: string;
  contact?: string;
  offer: boolean;
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Creating the restricted HR case on "Yes" arrives with W3-03. */}
          <Button data-testid="private-contact-yes" disabled title="Available in the next build">
            Yes, contact me privately
          </Button>
          <span className="text-xs text-violet-800">
            Private HR contact requests open in the next build.
          </span>
        </div>
      )}
    </div>
  );
}

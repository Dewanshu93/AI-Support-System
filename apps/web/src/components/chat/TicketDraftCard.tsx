// Ticket draft (stub until week 3): shows the draft the graph prepared. Editing,
// confirming and cancelling arrive with the ticket tasks (W3-02/W3-04).
import { Card } from '@/components/ui/Card';

export function TicketDraftCard({ draft }: { draft: Record<string, unknown> }) {
  const summary = typeof draft.summary === 'string' ? draft.summary : 'Ticket draft';
  const category = typeof draft.category === 'string' ? draft.category : null;
  return (
    <Card data-testid="ticket-draft-card" className="space-y-1 border-amber-200 bg-amber-50">
      <p className="text-sm font-semibold text-amber-950">Ticket draft ready</p>
      <p className="text-sm text-amber-950">{summary}</p>
      {category && <p className="text-xs text-amber-900">Category: {category}</p>}
      <p className="text-xs text-amber-800">
        Reviewing and confirming tickets arrives in the next build; your draft is saved with this
        conversation.
      </p>
    </Card>
  );
}

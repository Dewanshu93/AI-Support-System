// Loads the rows the admin overview is computed from (W4-01): non-eval records
// created in [start, end). The numbers themselves are computed in
// domain/metrics.ts, so their definitions are tested in one place.
import type { Collection } from 'mongodb';
import type {
  ConversationDoc,
  FeedbackDoc,
  TicketDoc,
  TicketEventDoc,
  TurnTraceDoc,
} from '../../db/schemas';
import type { MetricRows } from '../../domain/metrics';

export interface MetricsRepository {
  loadRows(range: { start: Date; end: Date }): Promise<MetricRows>;
}

export function mongoMetricsRepository(c: {
  conversations: Collection<ConversationDoc>;
  turnTraces: Collection<TurnTraceDoc>;
  tickets: Collection<TicketDoc>;
  ticketEvents: Collection<TicketEventDoc>;
  feedback: Collection<FeedbackDoc>;
}): MetricsRepository {
  return {
    async loadRows({ start, end }) {
      const createdAt = { $gte: start, $lt: end };
      const [conversations, turns, tickets, feedback] = await Promise.all([
        c.conversations
          .find(
            { isEval: false, createdAt },
            { projection: { _id: 1, ticketId: 1, resolution: 1 } },
          )
          .toArray(),
        c.turnTraces
          .find(
            { isEval: false, createdAt },
            {
              projection: {
                conversationId: 1,
                'decision.value': 1,
                totalLatencyMs: 1,
                ttftMs: 1,
                totalCostUsd: 1,
              },
            },
          )
          .toArray(),
        c.tickets
          .find({ isEval: false, createdAt }, { projection: { _id: 1, category: 1 } })
          .toArray(),
        c.feedback.find({ createdAt }, { projection: { rating: 1 } }).toArray(),
      ]);
      const ticketIds = tickets.map((t) => t._id);
      const overridden =
        ticketIds.length === 0
          ? []
          : await c.ticketEvents.distinct('ticketId', {
              type: 'classification_correction',
              ticketId: { $in: ticketIds },
            });
      return {
        conversations: conversations.map((v) => ({
          id: v._id.toHexString(),
          ticketId: v.ticketId?.toHexString() ?? null,
          resolutionConfirmed: v.resolution?.confirmed === true,
        })),
        turns: turns.map((t) => ({
          conversationId: t.conversationId.toHexString(),
          decision: t.decision?.value ?? null,
          totalLatencyMs: t.totalLatencyMs,
          ttftMs: t.ttftMs,
          costUsd: t.totalCostUsd,
        })),
        tickets: tickets.map((t) => ({ id: t._id.toHexString(), category: t.category })),
        overriddenTicketIds: overridden.map((id) => id.toHexString()),
        feedback: feedback.map((f) => ({ rating: f.rating })),
      };
    },
  };
}

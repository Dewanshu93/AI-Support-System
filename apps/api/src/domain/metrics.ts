// Service desk and AI health metrics (W4-01, playbook section 4 "Metrics").
// Pure: the repository loads the non-eval rows of a date range, this computes
// every number with the fixed definitions below. Tested on a hand-computed fixture.
import { type Decision, DECISIONS } from '@sd/shared';

/** Fixed definitions (shown as tooltips in the admin overview). */
export const METRIC_DEFINITIONS = {
  conversations: 'Conversations started in the range (evaluation runs excluded).',
  decisionDistribution: 'Assistant turns in the range, by the decision the rules made.',
  confirmedResolutionRate:
    'Conversations the employee marked solved ÷ conversations with at least one ANSWER or PARTIAL reply.',
  escalationRate: 'Conversations that led to a ticket ÷ all conversations.',
  escalationByCategory: 'Tickets created in the range, by category; rate = share of all tickets.',
  sensitiveHandoffs: 'Turns handed to the confidential HR route (SENSITIVE_HANDOFF).',
  overrideRate:
    'Tickets an agent re-classified at least once (category, subcategory or priority) ÷ tickets created.',
  thumbsDownRate: 'Thumbs-down ÷ all thumbs ratings given in the range.',
  latency:
    'Time to first token (streamed answers) and total turn time, 50th and 90th percentile, nearest rank.',
  costPerConversationUsd: 'LLM cost of all turns in the range ÷ conversations in the range.',
} as const;

export interface MetricRows {
  conversations: {
    id: string;
    ticketId: string | null;
    resolutionConfirmed: boolean;
  }[];
  /** One per assistant turn. */
  turns: {
    conversationId: string;
    decision: Decision | null;
    totalLatencyMs: number;
    ttftMs: number | null;
    costUsd: number;
  }[];
  tickets: { id: string; category: string }[];
  /** IDs of the tickets above with at least one classification correction. */
  overriddenTicketIds: string[];
  feedback: { rating: 'up' | 'down' }[];
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

/** Nearest-rank percentile; null for no values. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function computeOverview(rows: MetricRows) {
  const conversations = rows.conversations.length;
  const answered = new Set(
    rows.turns
      .filter((t) => t.decision === 'ANSWER' || t.decision === 'PARTIAL')
      .map((t) => t.conversationId),
  );
  const resolved = rows.conversations.filter(
    (c) => c.resolutionConfirmed && answered.has(c.id),
  ).length;

  const byCategory = new Map<string, number>();
  for (const t of rows.tickets) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
  const overridden = new Set(rows.overriddenTicketIds);

  const ttfts = rows.turns.flatMap((t) => (t.ttftMs === null ? [] : [t.ttftMs]));
  const totals = rows.turns.map((t) => t.totalLatencyMs);
  const cost = rows.turns.reduce((n, t) => n + t.costUsd, 0);

  return {
    conversations,
    decisionDistribution: DECISIONS.map((decision) => ({
      decision,
      count: rows.turns.filter((t) => t.decision === decision).length,
    })),
    confirmedResolutionRate: ratio(
      resolved,
      rows.conversations.filter((c) => answered.has(c.id)).length,
    ),
    escalationRate: ratio(
      rows.conversations.filter((c) => c.ticketId !== null).length,
      conversations,
    ),
    escalationByCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count, rate: ratio(count, rows.tickets.length) }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    sensitiveHandoffs: rows.turns.filter((t) => t.decision === 'SENSITIVE_HANDOFF').length,
    overrideRate: ratio(
      rows.tickets.filter((t) => overridden.has(t.id)).length,
      rows.tickets.length,
    ),
    thumbsDownRate: ratio(
      rows.feedback.filter((f) => f.rating === 'down').length,
      rows.feedback.length,
    ),
    latency: {
      ttftP50: percentile(ttfts, 50),
      ttftP90: percentile(ttfts, 90),
      totalP50: percentile(totals, 50),
      totalP90: percentile(totals, 90),
    },
    costPerConversationUsd: Math.round(ratio(cost, conversations) * 100_000) / 100_000,
  };
}

const DAY_MS = 86_400_000;

/** The query's whole-day range as [from 00:00, to + 1 day 00:00) UTC; default the last 7 days. */
export function overviewRange(
  query: { from?: string; to?: string },
  today: string,
): { from: string; to: string; start: Date; end: Date } {
  const to = query.to ?? today;
  const from =
    query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  return {
    from,
    to,
    start: new Date(`${from}T00:00:00Z`),
    end: new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS),
  };
}

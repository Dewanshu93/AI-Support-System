import { computeOverview, type MetricRows, overviewRange, percentile } from './metrics';

// A hand-computed fixture (W4-01 acceptance): every expected number is worked out below.
const ROWS: MetricRows = {
  conversations: [
    { id: 'c1', ticketId: null, resolutionConfirmed: true }, // answered, solved
    { id: 'c2', ticketId: null, resolutionConfirmed: false }, // answered, not solved
    { id: 'c3', ticketId: 't1', resolutionConfirmed: false }, // escalated
    { id: 'c4', ticketId: 't2', resolutionConfirmed: false }, // sensitive → confidential case
    { id: 'c5', ticketId: null, resolutionConfirmed: true }, // "solved" without an answer: not counted
  ],
  turns: [
    {
      conversationId: 'c1',
      decision: 'ANSWER',
      totalLatencyMs: 4000,
      ttftMs: 1000,
      costUsd: 0.002,
    },
    {
      conversationId: 'c2',
      decision: 'PARTIAL',
      totalLatencyMs: 6000,
      ttftMs: 2000,
      costUsd: 0.003,
    },
    {
      conversationId: 'c3',
      decision: 'ESCALATE',
      totalLatencyMs: 8000,
      ttftMs: null,
      costUsd: 0.004,
    },
    {
      conversationId: 'c4',
      decision: 'SENSITIVE_HANDOFF',
      totalLatencyMs: 500,
      ttftMs: null,
      costUsd: 0,
    },
    {
      conversationId: 'c5',
      decision: 'CLARIFY',
      totalLatencyMs: 2000,
      ttftMs: null,
      costUsd: 0.001,
    },
  ],
  tickets: [
    { id: 't1', category: 'hardware' },
    { id: 't2', category: 'employee_relations' },
    { id: 't3', category: 'hardware' }, // a ticket whose conversation started before the range
  ],
  overriddenTicketIds: ['t3'],
  feedback: [{ rating: 'up' }, { rating: 'up' }, { rating: 'down' }, { rating: 'up' }],
};

describe('computeOverview (hand-computed fixture)', () => {
  const m = computeOverview(ROWS);

  it('conversations and decision distribution', () => {
    expect(m.conversations).toBe(5);
    expect(Object.fromEntries(m.decisionDistribution.map((d) => [d.decision, d.count]))).toEqual({
      ANSWER: 1,
      PARTIAL: 1,
      CLARIFY: 1,
      ESCALATE: 1,
      SENSITIVE_HANDOFF: 1,
      OUT_OF_SCOPE: 0,
    });
  });

  it('confirmed resolution: solved ÷ conversations with an ANSWER/PARTIAL = 1/2', () => {
    expect(m.confirmedResolutionRate).toBe(0.5);
  });

  it('escalation: conversations with a ticket ÷ all = 2/5; by category over tickets', () => {
    expect(m.escalationRate).toBe(0.4);
    expect(m.escalationByCategory).toEqual([
      { category: 'hardware', count: 2, rate: 2 / 3 },
      { category: 'employee_relations', count: 1, rate: 1 / 3 },
    ]);
  });

  it('sensitive handoffs, override rate 1/3, thumbs-down 1/4', () => {
    expect(m.sensitiveHandoffs).toBe(1);
    expect(m.overrideRate).toBeCloseTo(1 / 3);
    expect(m.thumbsDownRate).toBe(0.25);
  });

  it('latency percentiles (nearest rank) and cost per conversation = 0.010 / 5', () => {
    expect(m.latency).toEqual({ ttftP50: 1000, ttftP90: 2000, totalP50: 4000, totalP90: 8000 });
    expect(m.costPerConversationUsd).toBe(0.002);
  });

  it('an empty range gives zeros and no latency', () => {
    const empty = computeOverview({
      conversations: [],
      turns: [],
      tickets: [],
      overriddenTicketIds: [],
      feedback: [],
    });
    expect(empty).toMatchObject({
      conversations: 0,
      confirmedResolutionRate: 0,
      escalationRate: 0,
      overrideRate: 0,
      thumbsDownRate: 0,
      latency: { ttftP50: null, totalP90: null },
      costPerConversationUsd: 0,
    });
  });
});

describe('percentile', () => {
  it('nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 90)).toBe(5);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('overviewRange', () => {
  it('defaults to the last 7 days ending today, as whole UTC days', () => {
    expect(overviewRange({}, '2026-10-13')).toEqual({
      from: '2026-10-07',
      to: '2026-10-13',
      start: new Date('2026-10-07T00:00:00Z'),
      end: new Date('2026-10-14T00:00:00Z'),
    });
  });

  it('uses the given dates; to is inclusive', () => {
    const r = overviewRange({ from: '2026-10-01', to: '2026-10-01' }, '2026-10-13');
    expect([r.start, r.end]).toEqual([
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-02T00:00:00Z'),
    ]);
  });
});

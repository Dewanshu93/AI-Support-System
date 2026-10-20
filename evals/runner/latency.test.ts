import { LATENCY_SCRIPT, latencyReport, summarizeLatency, type TurnTiming } from './latency';

const timing = (over: Partial<TurnTiming>): TurnTiming => ({
  turn: LATENCY_SCRIPT[0]!,
  ttftMs: 1_000,
  totalMs: 4_000,
  decision: 'ANSWER',
  costUsd: 0.002,
  error: null,
  ...over,
});

describe('latency script and summary (W4-09)', () => {
  it('has 30 single-turn questions from the demo personas', () => {
    expect(LATENCY_SCRIPT).toHaveLength(30);
    expect(new Set(LATENCY_SCRIPT.map((t) => t.email)).size).toBe(5);
    for (const t of LATENCY_SCRIPT) expect(t.message.length).toBeLessThanOrEqual(2000);
  });

  it('nearest-rank p50 / p90, cost mean, and the targets met or missed', () => {
    const timings = Array.from({ length: 10 }, (_, i) =>
      timing({ ttftMs: (i + 1) * 1_000, totalMs: (i + 1) * 4_000, costUsd: 0.001 * (i + 1) }),
    );
    const s = summarizeLatency(timings);
    expect(s).toMatchObject({
      turns: 10,
      errors: 0,
      ttftP50: 5_000,
      ttftP90: 9_000,
      totalP50: 20_000,
      totalP90: 36_000,
      met: { ttft: true, total: false, cost: true },
    });
    expect(s.costPerTurnUsd).toBeCloseTo(0.0055);
  });

  it('errors are counted but not timed; turns without streamed text have no first-word time', () => {
    const s = summarizeLatency([
      timing({ error: 'HTTP 503', totalMs: 99_000 }),
      timing({ ttftMs: null, totalMs: 2_000, costUsd: null }),
    ]);
    expect(s).toMatchObject({ errors: 1, ttftP50: null, totalP90: 2_000, met: { ttft: null } });
  });

  it('renders a Markdown report with the target table', () => {
    const md = latencyReport({
      startedAt: new Date('2026-10-20T10:00:00Z'),
      apiUrl: 'http://localhost:4000',
      models: 'local: dolphin3:latest',
      timings: [timing({})],
    });
    expect(md).toContain('| First word, p50 | 1.0 s | ≤ 10 s (NFR-1) | met |');
    expect(md).toContain('| 1 | priya.shah | policy | ANSWER |');
  });
});

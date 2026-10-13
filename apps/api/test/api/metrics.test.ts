// W4-01: GET /api/admin/metrics/overview — admin only, date range, definitions.
import request from 'supertest';
import type { MetricRows } from '../../src/domain/metrics';
import { buildTestApp, loginCookie } from '../helpers/app';

const URL = '/api/admin/metrics/overview';
const ROWS: MetricRows = {
  conversations: [
    { id: 'c1', ticketId: null, resolutionConfirmed: true },
    { id: 'c2', ticketId: 't1', resolutionConfirmed: false },
  ],
  turns: [
    { conversationId: 'c1', decision: 'ANSWER', totalLatencyMs: 3000, ttftMs: 900, costUsd: 0.002 },
    {
      conversationId: 'c2',
      decision: 'ESCALATE',
      totalLatencyMs: 5000,
      ttftMs: null,
      costUsd: 0.002,
    },
  ],
  tickets: [{ id: 't1', category: 'hardware' }],
  overriddenTicketIds: [],
  feedback: [{ rating: 'down' }],
};

function setup() {
  const ranges: { start: Date; end: Date }[] = [];
  const ctx = buildTestApp({
    clock: () => new Date('2026-10-13T12:00:00Z'),
    metrics: {
      loadRows: async (range) => {
        ranges.push(range);
        return ROWS;
      },
    },
  });
  return { ctx, ranges };
}

describe('GET /api/admin/metrics/overview', () => {
  it('admin: the metrics with their definitions, last 7 days by default', async () => {
    const { ctx, ranges } = setup();
    const res = await request(ctx.app)
      .get(URL)
      .set('Cookie', await loginCookie(ctx.app, 'alex.morgan@example.com'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      range: { from: '2026-10-07', to: '2026-10-13' },
      conversations: 2,
      confirmedResolutionRate: 1,
      escalationRate: 0.5,
      escalationByCategory: [{ category: 'hardware', count: 1, rate: 1 }],
      thumbsDownRate: 1,
      latency: { ttftP50: 900, totalP90: 5000 },
      costPerConversationUsd: 0.002,
    });
    expect(res.body.definitions.escalationRate).toContain('÷');
    expect(ranges[0]).toEqual({
      start: new Date('2026-10-07T00:00:00Z'),
      end: new Date('2026-10-14T00:00:00Z'),
    });
  });

  it('uses the given range (to inclusive)', async () => {
    const { ctx, ranges } = setup();
    await request(ctx.app)
      .get(`${URL}?from=2026-10-01&to=2026-10-02`)
      .set('Cookie', await loginCookie(ctx.app, 'alex.morgan@example.com'));
    expect(ranges[0]).toEqual({
      start: new Date('2026-10-01T00:00:00Z'),
      end: new Date('2026-10-03T00:00:00Z'),
    });
  });

  it('400 for an invalid range; 403 for agents and employees; 401 signed out', async () => {
    const { ctx } = setup();
    const alex = await loginCookie(ctx.app, 'alex.morgan@example.com');
    expect(
      (await request(ctx.app).get(`${URL}?from=2026-10-09&to=2026-10-01`).set('Cookie', alex))
        .status,
    ).toBe(400);
    expect((await request(ctx.app).get(`${URL}?from=yesterday`).set('Cookie', alex)).status).toBe(
      400,
    );
    const hana = await loginCookie(ctx.app, 'hana.kim@example.com');
    const priya = await loginCookie(ctx.app, 'priya.shah@example.com');
    expect((await request(ctx.app).get(URL).set('Cookie', hana)).status).toBe(403);
    expect((await request(ctx.app).get(URL).set('Cookie', priya)).status).toBe(403);
    expect((await request(ctx.app).get(URL)).status).toBe(401);
  });
});

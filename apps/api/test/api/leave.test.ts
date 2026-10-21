// Leave endpoints (UC-11, ADR-025): balances, apply, cancel and HR approval.
// Employees see only their own requests; approval is for agents of the leave queue.
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { buildMockHrData, buildMockRequests } from '../../src/modules/workspace/seed';
import { buildTestApp, loginCookie, seededUsers, type TestContext } from '../helpers/app';
import { VALID_ENV } from '../helpers/config';
import { memoryTicketsRepository } from '../helpers/tickets';
import { type MemoryWorkspace, memoryWorkspaceRepository } from '../helpers/workspace';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const OLIVIA = 'olivia.bennett@example.com';
const SAM = 'sam.patel@example.com'; // IT agent
const HANA = 'hana.kim@example.com'; // HR agent: approves leave
const ADMIN = 'alex.morgan@example.com';
const TODAY = '2026-10-07'; // Wednesday
const config = loadConfig(VALID_ENV);

type Ctx = TestContext & { ws: MemoryWorkspace };

async function setup(): Promise<Ctx> {
  const users = seededUsers();
  const data = buildMockHrData({ users, today: TODAY, workday: config.workday });
  const requests = buildMockRequests({ users, today: TODAY, routing: config.routing });
  const tickets = memoryTicketsRepository();
  for (const t of requests.tickets) await tickets.insert(t);
  const ws = memoryWorkspaceRepository(data);
  const ctx = await buildTestApp({
    users,
    tickets,
    workspace: ws,
    clock: () => new Date(`${TODAY}T12:00:00Z`),
  });
  return { ...ctx, ws };
}

const as = async (ctx: Ctx, email: string) => {
  const cookie = await loginCookie(ctx.app, email);
  return {
    get: (path: string) => request(ctx.app).get(path).set('Cookie', cookie),
    post: (path: string, body: object = {}) =>
      request(ctx.app).post(path).set('Cookie', cookie).send(body),
  };
};

const userId = (ctx: Ctx, email: string) => ctx.users.find((u) => u.email === email)!._id;
const priyaCasual = (ctx: Ctx) => ctx.ws.data.leaveRequests.find((r) => r.type === 'casual')!;

describe('access', () => {
  it.each([
    ['get', '/api/leave'],
    ['post', '/api/leave/requests'],
    ['post', '/api/leave/requests/6a1f00000000000000000099/cancel'],
  ] as const)(
    '%s %s is employee-only',
    async (method, path) => {
      const ctx = await setup();
      expect((await request(ctx.app)[method](path).send({})).status).toBe(401);
      for (const email of [HANA, ADMIN]) {
        expect((await (await as(ctx, email))[method](path)).status).toBe(403);
      }
    },
    20_000,
  ); // the first test also pays for building the app

  it.each([
    ['get', '/api/agent/leave'],
    ['post', '/api/agent/leave/6a1f00000000000000000099/decision'],
  ] as const)(
    '%s %s is for agents of the leave queue only',
    async (method, path) => {
      const ctx = await setup();
      expect((await request(ctx.app)[method](path).send({})).status).toBe(401);
      for (const email of [PRIYA, ADMIN]) {
        const res = await (await as(ctx, email))[method](path, { decision: 'approve' });
        expect(res.status).toBe(403);
      }
    },
    20_000,
  );

  it('shows an agent outside the leave queue nothing, like ticket queues', async () => {
    const ctx = await setup();
    const sam = await as(ctx, SAM);
    expect((await sam.get('/api/agent/leave')).body).toEqual({ items: [] });
    const id = priyaCasual(ctx)._id.toHexString();
    const res = await sam.post(`/api/agent/leave/${id}/decision`, { decision: 'approve' });
    expect(res.status).toBe(404);
    expect(priyaCasual(ctx).status).toBe('pending');
  });
});

describe('GET /api/leave', () => {
  it("shows Priya's balances and requests", async () => {
    const ctx = await setup();
    const res = await (await as(ctx, PRIYA)).get('/api/leave');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ year: 2026, today: TODAY, eligible: true });
    expect(res.body.balances).toEqual([
      {
        type: 'annual',
        label: 'Annual leave',
        entitlement: 15,
        used: 3,
        pending: 0,
        available: 12,
      },
      { type: 'sick', label: 'Sick leave', entitlement: 10, used: 0, pending: 0, available: 10 },
      { type: 'casual', label: 'Casual leave', entitlement: 6, used: 0, pending: 1, available: 5 },
    ]);
    expect(
      res.body.requests.map(
        (r: { type: string; status: string; startDate: string; cancellable: boolean }) => [
          r.type,
          r.status,
          r.startDate,
          r.cancellable,
        ],
      ),
    ).toEqual([
      ['casual', 'pending', '2026-10-14', true],
      ['annual', 'approved', '2026-07-27', false],
    ]);
    expect(res.body.rules).toEqual({ earliestSickDate: '2026-09-07', latestDate: '2026-12-31' });
  });

  it('shows contractors no balances, and refuses their requests', async () => {
    const ctx = await setup();
    const tom = await as(ctx, TOM);
    expect((await tom.get('/api/leave')).body).toMatchObject({ eligible: false, balances: [] });
    const res = await tom.post('/api/leave/requests', {
      type: 'annual',
      startDate: '2026-10-26',
      endDate: '2026-10-26',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0]).toMatchObject({ path: 'type' });
  });
});

describe('POST /api/leave/requests', () => {
  it('sends annual leave for approval, notifies and audits it', async () => {
    const ctx = await setup();
    const res = await (
      await as(ctx, PRIYA)
    ).post('/api/leave/requests', {
      type: 'annual',
      startDate: '2026-10-26',
      endDate: '2026-10-27',
      reason: 'Wedding',
    });
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      type: 'annual',
      status: 'pending',
      days: 2,
      source: 'form',
      reason: 'Wedding',
      cancellable: true,
    });
    expect(res.body.warnings).toEqual([]);
    expect(res.body.overview.balances[0]).toMatchObject({ pending: 2, available: 10 });
    // Nothing on the attendance record until it is approved.
    expect(ctx.ws.data.attendance.some((a) => a.date === '2026-10-26')).toBe(false);
    const notification = ctx.ws.data.notifications.at(-1)!;
    expect(notification).toMatchObject({
      kind: 'leave',
      title: 'Annual leave request sent for approval',
      link: '/leave',
    });
    expect(notification.userId.equals(userId(ctx, PRIYA))).toBe(true);
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'leave.apply',
      targetType: 'leave_request',
      metadata: { days: 2, status: 'pending', triggeredBy: 'form', approvedBy: 'employee' },
    });
  });

  it('returns policy warnings without blocking', async () => {
    const ctx = await setup();
    const res = await (
      await as(ctx, PRIYA)
    ).post('/api/leave/requests', {
      type: 'annual',
      startDate: '2026-10-12',
      endDate: '2026-10-13',
    });
    expect(res.status).toBe(201);
    const longer = await (
      await as(ctx, PRIYA)
    ).post('/api/leave/requests', {
      type: 'annual',
      startDate: '2026-10-19',
      endDate: '2026-10-22',
    });
    expect(longer.status).toBe(201);
    expect(longer.body.warnings[0]).toMatch(/needs 10 working days' notice/);
  });

  it('records sick leave at once and marks the day as leave, so it is no longer missing', async () => {
    const ctx = await setup();
    const priya = await as(ctx, PRIYA);
    // Tue 6 Oct has no timesheet yet (the seeded missing day).
    expect((await priya.get('/api/dashboard')).body.timesheet.missingDays).toEqual(['2026-10-06']);
    const res = await priya.post('/api/leave/requests', {
      type: 'sick',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
    });
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ status: 'approved', cancellable: false });
    expect(res.body.overview.balances[1]).toMatchObject({ used: 1, available: 9 });
    const dashboard = (await priya.get('/api/dashboard')).body;
    expect(dashboard.timesheet.missingDays).toEqual([]);
    expect(dashboard.timesheet.days[1]).toMatchObject({ date: '2026-10-06', status: 'leave' });
  });

  it('rejects an overlap, with the field and the reason', async () => {
    const ctx = await setup();
    const res = await (
      await as(ctx, PRIYA)
    ).post('/api/leave/requests', {
      type: 'annual',
      startDate: '2026-10-13',
      endDate: '2026-10-15',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues).toEqual([
      { location: 'body', path: 'startDate', message: 'you already have leave on 2026-10-14' },
    ]);
    expect(ctx.ws.data.leaveRequests).toHaveLength(4); // the seeded ones only
  });

  it('validates the request shape', async () => {
    const ctx = await setup();
    const res = await (
      await as(ctx, PRIYA)
    ).post('/api/leave/requests', {
      type: 'vacation',
      startDate: '2026-10-27',
      endDate: '2026-10-26',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/leave/requests/:id/cancel', () => {
  it('cancels a waiting request once; others cannot see it', async () => {
    const ctx = await setup();
    const id = priyaCasual(ctx)._id.toHexString();
    expect((await (await as(ctx, OLIVIA)).post(`/api/leave/requests/${id}/cancel`)).status).toBe(
      404,
    );
    const priya = await as(ctx, PRIYA);
    const res = await priya.post(`/api/leave/requests/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.balances[2]).toMatchObject({ pending: 0, available: 6 });
    expect(priyaCasual(ctx).status).toBe('cancelled');
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'leave.cancel',
      metadata: { previousStatus: 'pending' },
    });
    expect((await priya.post(`/api/leave/requests/${id}/cancel`)).status).toBe(409);
  });

  it('refuses leave that has already started', async () => {
    const ctx = await setup();
    const past = ctx.ws.data.leaveRequests.find(
      (r) => r.type === 'annual' && r.userId.equals(userId(ctx, PRIYA)),
    )!;
    const res = await (
      await as(ctx, PRIYA)
    ).post(`/api/leave/requests/${past._id.toHexString()}/cancel`);
    expect(res.status).toBe(409);
  });
});

describe('HR approval', () => {
  it('lists waiting requests with the employee and the balance after approval', async () => {
    const ctx = await setup();
    const res = await (await as(ctx, HANA)).get('/api/agent/leave');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        type: 'casual',
        status: 'pending',
        startDate: '2026-10-14',
        employee: expect.objectContaining({ name: 'Priya Shah', country: 'US' }),
        availableAfter: 5,
      }),
    ]);
    const approved = await (await as(ctx, HANA)).get('/api/agent/leave?status=approved');
    expect(approved.body.items).toHaveLength(3);
  });

  it('approves: the days become leave, the employee is notified, the decision is audited', async () => {
    const ctx = await setup();
    const id = priyaCasual(ctx)._id.toHexString();
    const hana = await as(ctx, HANA);
    const res = await hana.post(`/api/agent/leave/${id}/decision`, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ status: 'approved', decisionNote: null });
    const day = ctx.ws.data.attendance.find(
      (a) => a.date === '2026-10-14' && a.userId.equals(userId(ctx, PRIYA)),
    );
    expect(day).toMatchObject({ status: 'leave', note: 'Casual leave' });
    expect(ctx.ws.data.notifications.at(-1)).toMatchObject({
      kind: 'leave',
      title: 'Casual leave approved',
    });
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'leave.decide',
      metadata: { decision: 'approve' },
    });
    expect(
      (await hana.post(`/api/agent/leave/${id}/decision`, { decision: 'reject', note: 'x' }))
        .status,
    ).toBe(409);

    // Approved and not started: Priya can still cancel, which clears the attendance record.
    const cancel = await (await as(ctx, PRIYA)).post(`/api/leave/requests/${id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(
      ctx.ws.data.attendance.some(
        (a) => a.date === '2026-10-14' && a.userId.equals(userId(ctx, PRIYA)),
      ),
    ).toBe(false);
  });

  it('needs a reason to reject, and passes it to the employee', async () => {
    const ctx = await setup();
    const id = priyaCasual(ctx)._id.toHexString();
    const hana = await as(ctx, HANA);
    expect(
      (await hana.post(`/api/agent/leave/${id}/decision`, { decision: 'reject' })).status,
    ).toBe(400);
    const res = await hana.post(`/api/agent/leave/${id}/decision`, {
      decision: 'reject',
      note: 'Team release that day',
    });
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({
      status: 'rejected',
      decisionNote: 'Team release that day',
    });
    expect(ctx.ws.data.notifications.at(-1)!.body).toContain('Team release that day');
  });

  it('answers 404 for an unknown request', async () => {
    const ctx = await setup();
    const res = await (
      await as(ctx, HANA)
    ).post('/api/agent/leave/6a1f00000000000000000099/decision', {
      decision: 'approve',
    });
    expect(res.status).toBe(404);
  });
});

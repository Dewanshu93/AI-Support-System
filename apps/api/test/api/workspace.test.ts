// Employee workspace endpoints (UC-02): dashboard, tasks, timesheets, payroll,
// attendance and notifications. Employee-only; each employee sees only their own data.
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { buildMockHrData, buildMockRequests, seedId } from '../../src/modules/workspace/seed';
import { buildTestApp, loginCookie, seededUsers, type TestContext } from '../helpers/app';
import { VALID_ENV } from '../helpers/config';
import { memoryTicketsRepository } from '../helpers/tickets';
import { memoryWorkspaceRepository } from '../helpers/workspace';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const SAM = 'sam.patel@example.com';
const ADMIN = 'alex.morgan@example.com';
const TODAY = '2026-10-07';
const config = loadConfig(VALID_ENV);
const BANK = seedId('project:BANK').toHexString();
const BRAND = seedId('project:BRAND').toHexString();

/** `now` moves the clock past the seeded data (which ends the day before TODAY). */
async function setup(now = TODAY): Promise<TestContext> {
  const users = seededUsers();
  const data = buildMockHrData({ users, today: TODAY, workday: config.workday });
  const requests = buildMockRequests({ users, today: TODAY, routing: config.routing });
  const tickets = memoryTicketsRepository();
  for (const t of requests.tickets) await tickets.insert(t);
  for (const e of requests.ticketEvents) await tickets.insertEvent(e);
  return buildTestApp({
    users,
    tickets,
    workspace: memoryWorkspaceRepository({
      ...data,
      notifications: [...data.notifications, ...requests.notifications],
    }),
    clock: () => new Date(`${now}T12:00:00Z`),
  });
}

const get = (ctx: TestContext, cookie: string, path: string) =>
  request(ctx.app).get(path).set('Cookie', cookie);
const post = (ctx: TestContext, cookie: string, path: string, body: object) =>
  request(ctx.app).post(path).set('Cookie', cookie).send(body);

describe('access', () => {
  const routes = [
    ['get', '/api/dashboard'],
    ['get', '/api/projects/mine'],
    ['get', '/api/tasks/mine'],
    ['get', '/api/timesheets/week'],
    ['post', '/api/timesheets/entries'],
    ['get', '/api/attendance?from=2026-10-01&to=2026-10-07'],
    ['get', '/api/payslips/mine'],
    ['get', '/api/notifications'],
    ['post', '/api/notifications/read'],
  ] as const;

  it.each(routes)('%s %s requires a session', async (method, path) => {
    const ctx = await setup();
    expect((await request(ctx.app)[method](path).send({})).status).toBe(401);
  });

  it.each(routes)('%s %s is employee-only (agent and admin get 403)', async (method, path) => {
    const ctx = await setup();
    for (const email of [SAM, ADMIN]) {
      const cookie = await loginCookie(ctx.app, email);
      expect((await request(ctx.app)[method](path).set('Cookie', cookie).send({})).status).toBe(
        403,
      );
    }
  });
});

describe('GET /api/dashboard', () => {
  it("summarises Priya's tasks, week, requests, payroll and notifications", async () => {
    const ctx = await setup();
    const res = await get(ctx, await loginCookie(ctx.app, PRIYA), '/api/dashboard');
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.profile).toMatchObject({ firstName: 'Priya', country: 'US' });
    expect(d.today).toBe(TODAY);
    // Four open tasks (PROJ-124 is done), in progress first.
    expect(d.tasks.open).toBe(4);
    expect(d.tasks.items[0].key).toBe('PROJ-123');
    // This week: Mon complete, Tue missing (no timesheet yet), Wed today.
    expect(d.timesheet.weekStart).toBe('2026-10-05');
    expect(d.timesheet.days.map((x: { status: string }) => x.status)).toEqual([
      'complete',
      'missing',
      'today',
      'future',
      'future',
      'weekend',
      'weekend',
    ]);
    expect(d.timesheet.missingDays).toEqual(['2026-10-06']);
    // VPN request open; parental leave resolved, shown after it.
    expect(d.requests.active).toBe(1);
    expect(
      d.requests.items.map((r: { humanId: string; stage: string }) => [r.humanId, r.stage]),
    ).toEqual([
      ['IT-9001', 'Under review'],
      ['HR-9001', 'Resolved'],
    ]);
    expect(d.requests.items[0].department).toBe('IT Access');
    expect(d.payroll.latest).toMatchObject({ payDate: '2026-09-30', lopAmount: 400 });
    expect(d.notifications.unread).toBeGreaterThanOrEqual(2);
    // Tue 6 Oct was attended (badge-in) but has no hours: a reminder, not a Loss of Pay risk.
    // The LOP day itself (11 Sep) is on a payslip already and outside the window.
    expect(d.attention).toEqual([
      {
        kind: 'timesheet_gap',
        severity: 'normal',
        date: '2026-10-06',
        hours: 0,
        requiredHours: 8,
        lopCutoff: null,
      },
    ]);
  });

  it('shows contractors as paid by their agency', async () => {
    const ctx = await setup();
    const res = await get(ctx, await loginCookie(ctx.app, TOM), '/api/dashboard');
    expect(res.body.payroll).toEqual({ latest: null, paidByAgency: true });
    expect(res.body.requests.items[0]).toMatchObject({
      humanId: 'HR-9002',
      stage: 'Waiting for you',
    });
    // Half a day on Wed 30 Sep, and the request waiting for Tom; never a Loss of Pay warning.
    expect(res.body.attention).toEqual([
      expect.objectContaining({
        kind: 'timesheet_gap',
        date: '2026-09-30',
        hours: 4,
        lopCutoff: null,
      }),
      {
        kind: 'request_waiting',
        severity: 'normal',
        request: expect.objectContaining({ humanId: 'HR-9002' }),
      },
    ]);
  });

  it('flags Loss of Pay risks around the payroll cutoff, most urgent first', async () => {
    // Nine days later, with nothing logged or recorded since 7 Oct.
    const ctx = await setup('2026-10-16');
    const res = await get(ctx, await loginCookie(ctx.app, PRIYA), '/api/dashboard');
    expect(res.status).toBe(200);
    expect(
      res.body.attention.map((i: { kind: string; severity: string; date: string }) => [
        i.kind,
        i.severity,
        i.date,
      ]),
    ).toEqual([
      ['lop_risk', 'urgent', '2026-10-07'], // cutoff 14 Oct has passed
      ['lop_risk', 'urgent', '2026-10-08'],
      ['timesheet_gap', 'urgent', '2026-10-09'], // cutoff is today
      ['timesheet_gap', 'urgent', '2026-10-12'],
      ['timesheet_gap', 'urgent', '2026-10-13'],
      ['timesheet_gap', 'normal', '2026-10-06'], // attended: reminder only
      ['timesheet_gap', 'normal', '2026-10-14'],
      ['timesheet_gap', 'normal', '2026-10-15'],
    ]);
    expect(res.body.attention[0]).toMatchObject({ cutoff: '2026-10-14' });
    expect(res.body.attention[2]).toMatchObject({ lopCutoff: '2026-10-16' });
  });
});

describe('timesheets', () => {
  it('returns the week with day statuses, entries and only the employee projects', async () => {
    const ctx = await setup();
    const res = await get(
      ctx,
      await loginCookie(ctx.app, PRIYA),
      '/api/timesheets/week?date=2026-09-09',
    );
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe('2026-09-07');
    const days = Object.fromEntries(
      res.body.days.map((x: { date: string; status: string }) => [x.date, x.status]),
    );
    expect(days['2026-09-07']).toBe('holiday'); // Labor Day
    expect(days['2026-09-11']).toBe('missing'); // the LOP day
    expect(res.body.projects.map((p: { code: string }) => p.code).sort()).toEqual([
      'API',
      'BANK',
      'INT',
    ]);
    expect(res.body.requiredHours).toBe(32); // 4 working days
    expect(res.body.rules.earliestDate).toBe('2026-08-08');
  });

  it('logs the missing LOP day as a late entry and audits it', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await post(ctx, cookie, '/api/timesheets/entries', {
      cells: [{ date: '2026-09-11', projectId: BANK, hours: 8, note: 'Worked on reconciliation' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ saved: 1, removed: 0 });
    const day = res.body.week.days.find((x: { date: string }) => x.date === '2026-09-11');
    expect(day).toMatchObject({ status: 'complete', hours: 8 });
    const entry = res.body.week.entries.find((e: { date: string }) => e.date === '2026-09-11');
    expect(entry).toMatchObject({ source: 'form', late: true, note: 'Worked on reconciliation' });
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'timesheet.save',
      metadata: { triggeredBy: 'form', approvedBy: 'employee' },
    });
  });

  it('updates and removes cells (hours 0 removes)', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await post(ctx, cookie, '/api/timesheets/entries', {
      cells: [{ date: '2026-10-06', projectId: BANK, hours: 6 }],
    });
    const res = await post(ctx, cookie, '/api/timesheets/entries', {
      cells: [
        { date: '2026-10-06', projectId: BANK, hours: 0 },
        { date: '2026-10-06', projectId: seedId('project:API').toHexString(), hours: 3.5 },
      ],
    });
    expect(res.body).toMatchObject({ saved: 1, removed: 1 });
    expect(res.body.week.days[1]).toMatchObject({
      date: '2026-10-06',
      hours: 3.5,
      status: 'partial',
    });
  });

  it('rejects future dates, foreign projects and day totals over the maximum', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await post(ctx, cookie, '/api/timesheets/entries', {
      cells: [
        { date: '2026-10-08', projectId: BANK, hours: 8 },
        { date: '2026-10-05', projectId: BRAND, hours: 2 },
        { date: '2026-10-02', projectId: BANK, hours: 11.5 },
      ],
    });
    expect(res.status).toBe(400);
    const messages = res.body.error.details.issues.map(
      (i: { path: string; message: string }) => `${i.path}: ${i.message}`,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^cells\.0\.date: .*future/),
        expect.stringMatching(/^cells\.1\.projectId: is not one of your projects/),
        expect.stringMatching(/^cells\.2\.hours: .*total 12.5/),
      ]),
    );
    // Nothing was written.
    expect(ctx.audit.some((a) => a.action === 'timesheet.save')).toBe(false);
  });

  it('validates the request shape', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    expect((await post(ctx, cookie, '/api/timesheets/entries', { cells: [] })).status).toBe(400);
    expect(
      (
        await post(ctx, cookie, '/api/timesheets/entries', {
          cells: [{ date: '2026-02-30', projectId: BANK, hours: 1 }],
        })
      ).status,
    ).toBe(400);
    expect((await get(ctx, cookie, '/api/timesheets/week?date=yesterday')).status).toBe(400);
  });
});

describe('tasks, payroll, attendance', () => {
  it('lists only the employee tasks, filtered to open ones', async () => {
    const ctx = await setup();
    const res = await get(ctx, await loginCookie(ctx.app, PRIYA), '/api/tasks/mine?view=open');
    expect(res.body.items.map((t: { key: string }) => t.key)).toEqual([
      'PROJ-123',
      'PROJ-127',
      'PROJ-131',
      'PROJ-135',
    ]);
    expect(res.body.items[0].project).toMatchObject({ code: 'BANK', name: 'Banking Module' });
  });

  it("lists payslips newest first and hides another employee's payslip", async () => {
    const ctx = await setup();
    const priya = await loginCookie(ctx.app, PRIYA);
    const list = await get(ctx, priya, '/api/payslips/mine');
    expect(list.body.paidByAgency).toBe(false);
    expect(list.body.items.map((p: { payDate: string }) => p.payDate)).toEqual([
      '2026-09-30',
      '2026-09-15',
      '2026-08-31',
      '2026-08-14',
    ]);
    const lopId = list.body.items[0].id;
    const detail = await get(ctx, priya, `/api/payslips/${lopId}`);
    expect(
      detail.body.payslip.deductions.find((d: { code: string }) => d.code === 'lop'),
    ).toMatchObject({
      amount: 400,
      dates: ['2026-09-11'],
    });
    // Olivia cannot open Priya's payslip: not found, never forbidden.
    const olivia = await loginCookie(ctx.app, 'olivia.bennett@example.com');
    expect((await get(ctx, olivia, `/api/payslips/${lopId}`)).status).toBe(404);
  });

  it('returns attendance for a bounded range', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const res = await get(ctx, cookie, '/api/attendance?from=2026-09-10&to=2026-09-11');
    expect(res.body.items).toEqual([
      { date: '2026-09-10', status: 'present', note: null },
      { date: '2026-09-11', status: 'absent', note: 'No badge-in or timesheet recorded' },
    ]);
    expect((await get(ctx, cookie, '/api/attendance?from=2026-01-01&to=2026-10-01')).status).toBe(
      400,
    );
    expect((await get(ctx, cookie, '/api/attendance?from=2026-10-02&to=2026-10-01')).status).toBe(
      400,
    );
  });
});

describe('notifications', () => {
  it('lists, then marks one and then all as read', async () => {
    const ctx = await setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const list = await get(ctx, cookie, '/api/notifications?unread=true');
    const unread = list.body.unreadCount;
    expect(unread).toBe(list.body.items.length);
    expect(list.body.items.every((n: { read: boolean }) => !n.read)).toBe(true);

    const one = await post(ctx, cookie, '/api/notifications/read', {
      ids: [list.body.items[0].id],
    });
    expect(one.body).toEqual({ updated: 1, unreadCount: unread - 1 });
    const all = await post(ctx, cookie, '/api/notifications/read', {});
    expect(all.body).toEqual({ updated: unread - 1, unreadCount: 0 });
  });

  it("cannot mark another employee's notification", async () => {
    const ctx = await setup();
    const tom = await loginCookie(ctx.app, TOM);
    const priya = await loginCookie(ctx.app, PRIYA);
    const priyaFirst = (await get(ctx, priya, '/api/notifications')).body.items[0].id;
    expect(
      (await post(ctx, tom, '/api/notifications/read', { ids: [priyaFirst] })).body.updated,
    ).toBe(0);
  });
});

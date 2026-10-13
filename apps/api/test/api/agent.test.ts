// W3-05: agent ticket API — role matrix, queue scoping (ownership), restricted
// visibility, status transitions, classification corrections and the override rate.
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { MessageDoc, TicketDoc } from '../../src/db/schemas';
import { buildTestApp, loginCookie, type TestContext, userByEmail } from '../helpers/app';
import type { MemoryTickets } from '../helpers/tickets';
import type { MemoryWorkspace } from '../helpers/workspace';

const SAM = 'sam.patel@example.com'; // IT queues
const HANA = 'hana.kim@example.com'; // hr_general + hr_payroll + hr_case
const ALEX = 'alex.morgan@example.com'; // admin
const PRIYA = 'priya.shah@example.com'; // employee, requester of every fixture

const BASE = '/api/agent/tickets';
const MINUTE = 60_000;
const T0 = new Date(Date.now() - 600 * MINUTE);

function fixture(ctx: TestContext, over: Partial<TicketDoc> & { humanId: string }): TicketDoc {
  const priya = userByEmail(ctx.users, PRIYA);
  return {
    _id: new ObjectId(),
    conversationId: new ObjectId(),
    requesterId: priya._id,
    requesterSnapshot: {
      name: priya.name,
      email: priya.email,
      country: priya.country,
      employmentType: priya.employmentType,
      department: priya.department,
    },
    domain: 'IT',
    category: 'hardware',
    subcategory: 'laptop_fault',
    queue: 'it_hardware',
    priority: 'medium',
    aiUrgency: 'medium',
    priorityFloorApplied: null,
    status: 'new',
    summary: `Ticket ${over.humanId}`,
    agentBrief: 'Brief for the agent',
    agentAssist: null,
    fields: { device_model: 'Dell Latitude 7440' },
    aiFilledFields: ['device_model'],
    articlesShown: [],
    restricted: false,
    duplicateOf: null,
    isEval: false,
    createdAt: T0,
    updatedAt: T0,
    resolvedAt: null,
    ...over,
  };
}

/** Seeds: IT tickets (mixed priorities/ages), an HR ticket, a restricted case, an eval ticket. */
async function seed(ctx: TestContext) {
  const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE);
  const t = {
    itLowOld: fixture(ctx, { humanId: 'IT-0001', priority: 'low', createdAt: at(0) }),
    itCritical: fixture(ctx, { humanId: 'IT-0002', priority: 'critical', createdAt: at(10) }),
    itHighNew: fixture(ctx, { humanId: 'IT-0003', priority: 'high', createdAt: at(30) }),
    itHighOld: fixture(ctx, {
      humanId: 'IT-0004',
      priority: 'high',
      createdAt: at(20),
      category: 'access',
      subcategory: 'new_access',
      queue: 'it_access',
    }),
    hr: fixture(ctx, {
      humanId: 'HR-0001',
      domain: 'HR',
      category: 'leave',
      subcategory: 'annual_leave',
      queue: 'hr_general',
      fields: { leave_type: 'annual', question: 'How many days remain?' },
    }),
    restricted: fixture(ctx, {
      humanId: 'HR-0002',
      domain: 'HR',
      category: 'employee_relations',
      subcategory: null,
      queue: 'hr_case',
      priority: 'high',
      restricted: true,
      summary: 'Confidential HR contact request',
      fields: {},
      aiFilledFields: [],
    }),
    evalTicket: fixture(ctx, { humanId: 'IT-0099', isEval: true, priority: 'critical' }),
  };
  for (const ticket of Object.values(t)) await ctx.deps.tickets.insert(ticket);
  return t;
}

async function setup() {
  const ctx = buildTestApp();
  const tickets = await seed(ctx);
  const [sam, hana, alex, priya] = await Promise.all([
    loginCookie(ctx.app, SAM),
    loginCookie(ctx.app, HANA),
    loginCookie(ctx.app, ALEX),
    loginCookie(ctx.app, PRIYA),
  ]);
  return { ctx, t: tickets, cookies: { sam, hana, alex, priya } };
}

const id = (t: TicketDoc) => t._id.toHexString();
const memory = (ctx: TestContext) => ctx.deps.tickets as MemoryTickets;

describe('role matrix: agent endpoints are for agents and admins only', () => {
  const endpoints = (ticketId: string) =>
    [
      ['get', BASE, undefined],
      ['get', `${BASE}/${ticketId}`, undefined],
      ['post', `${BASE}/${ticketId}/replies`, { body: 'Hello' }],
      ['post', `${BASE}/${ticketId}/notes`, { body: 'Note' }],
      ['patch', `${BASE}/${ticketId}/status`, { status: 'in_progress' }],
      ['patch', `${BASE}/${ticketId}/classification`, { priority: 'high' }],
    ] as const;

  it('401 without a session, 403 for employees, allowed for agents and admins', async () => {
    const { ctx, t, cookies } = await setup();
    for (const [method, path, body] of endpoints(id(t.itLowOld))) {
      const anon = await request(ctx.app)[method](path).send(body);
      expect([path, anon.status]).toEqual([path, 401]);
      const employee = await request(ctx.app)[method](path).set('Cookie', cookies.priya).send(body);
      expect([path, employee.status, employee.body.error.code]).toEqual([path, 403, 'FORBIDDEN']);
    }
    for (const cookie of [cookies.sam, cookies.alex]) {
      for (const [method, path, body] of endpoints(id(t.itLowOld))) {
        const res = await request(ctx.app)[method](path).set('Cookie', cookie).send(body);
        // Access is granted (the second pass may meet a 409 for a repeated status change).
        expect([path, [401, 403].includes(res.status)]).toEqual([path, false]);
      }
    }
  });
});

describe('queue scoping and restricted visibility', () => {
  it('Sam sees only IT queues, in priority order (critical first), then oldest first', async () => {
    const { ctx, cookies } = await setup();
    const res = await request(ctx.app).get(BASE).set('Cookie', cookies.sam);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { humanId: string }) => i.humanId)).toEqual([
      'IT-0002', // critical
      'IT-0004', // high, older
      'IT-0003', // high, newer
      'IT-0001', // low
    ]);
    expect(res.body.items[0]).toMatchObject({
      queue: 'it_hardware',
      requesterName: 'Priya Shah',
      restricted: false,
      category: 'hardware',
    });
    expect(res.body.items[3].ageMinutes).toBeGreaterThanOrEqual(599);
  });

  it('Sam cannot see HR tickets: list 403 for an HR queue, 404 on every HR ticket action', async () => {
    const { ctx, t, cookies } = await setup();
    const forbidden = await request(ctx.app)
      .get(`${BASE}?queue=hr_general`)
      .set('Cookie', cookies.sam);
    expect(forbidden.status).toBe(403);
    for (const ticket of [t.hr, t.restricted]) {
      const calls = [
        request(ctx.app).get(`${BASE}/${id(ticket)}`),
        request(ctx.app)
          .post(`${BASE}/${id(ticket)}/replies`)
          .send({ body: 'x' }),
        request(ctx.app)
          .post(`${BASE}/${id(ticket)}/notes`)
          .send({ body: 'x' }),
        request(ctx.app)
          .patch(`${BASE}/${id(ticket)}/status`)
          .send({ status: 'in_progress' }),
        request(ctx.app)
          .patch(`${BASE}/${id(ticket)}/classification`)
          .send({ priority: 'low' }),
      ];
      for (const call of calls) {
        const res = await call.set('Cookie', cookies.sam);
        expect(res.status).toBe(404);
      }
    }
    expect(memory(ctx).events).toHaveLength(0);
  });

  it('Hana sees HR tickets including the restricted case; viewing it is audited', async () => {
    const { ctx, t, cookies } = await setup();
    const list = await request(ctx.app).get(BASE).set('Cookie', cookies.hana);
    expect(list.body.items.map((i: { humanId: string }) => i.humanId)).toEqual([
      'HR-0002',
      'HR-0001',
    ]);
    expect(list.body.items[0].restricted).toBe(true);
    expect(
      (
        await request(ctx.app)
          .get(`${BASE}/${id(t.itLowOld)}`)
          .set('Cookie', cookies.hana)
      ).status,
    ).toBe(404);

    const detail = await request(ctx.app)
      .get(`${BASE}/${id(t.restricted)}`)
      .set('Cookie', cookies.hana);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket).toMatchObject({
      humanId: 'HR-0002',
      restricted: true,
      queue: 'hr_case',
    });
    expect(ctx.audit.filter((a) => a.action === 'ticket.view')).toEqual([
      expect.objectContaining({ targetId: id(t.restricted), actorRole: 'agent' }),
    ]);
    // Non-restricted views are not audited.
    await request(ctx.app)
      .get(`${BASE}/${id(t.hr)}`)
      .set('Cookie', cookies.hana);
    expect(ctx.audit.filter((a) => a.action === 'ticket.view')).toHaveLength(1);
  });

  it('admins see every queue (eval tickets excluded) and may filter by any queue', async () => {
    const { ctx, cookies } = await setup();
    const all = await request(ctx.app).get(BASE).set('Cookie', cookies.alex);
    expect(all.body.items).toHaveLength(6);
    expect(all.body.items.map((i: { humanId: string }) => i.humanId)).not.toContain('IT-0099');
    const hrCase = await request(ctx.app).get(`${BASE}?queue=hr_case`).set('Cookie', cookies.alex);
    expect(hrCase.body.items.map((i: { humanId: string }) => i.humanId)).toEqual(['HR-0002']);
  });

  it('filters by status, priority and category, and pages with a cursor', async () => {
    const { ctx, cookies } = await setup();
    const get = (q: string) => request(ctx.app).get(`${BASE}?${q}`).set('Cookie', cookies.sam);
    const humanIds = (res: request.Response) =>
      res.body.items.map((i: { humanId: string }) => i.humanId);
    expect(humanIds(await get('priority=high'))).toEqual(['IT-0004', 'IT-0003']);
    expect(humanIds(await get('category=access'))).toEqual(['IT-0004']);
    expect(humanIds(await get('queue=it_access'))).toEqual(['IT-0004']);
    expect(humanIds(await get('status=resolved'))).toEqual([]);

    const first = await get('limit=2');
    expect(humanIds(first)).toEqual(['IT-0002', 'IT-0004']);
    const second = await get(`limit=2&cursor=${first.body.nextCursor}`);
    expect(humanIds(second)).toEqual(['IT-0003', 'IT-0001']);
    expect(second.body.nextCursor).toBeNull();
    expect((await get('priority=urgent')).status).toBe(400);
  });
});

describe('ticket detail', () => {
  it('returns the full ticket, all events, the transcript and the citations shown', async () => {
    const { ctx, t, cookies } = await setup();
    const docId = new ObjectId();
    const chunkId = new ObjectId();
    const message = (over: Partial<MessageDoc>): MessageDoc => ({
      _id: new ObjectId(),
      conversationId: t.itLowOld.conversationId,
      role: 'user',
      content: 'My laptop will not start',
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: T0,
      ...over,
    });
    await ctx.deps.conversations.insertMessage(message({}));
    await ctx.deps.conversations.insertMessage(
      message({
        role: 'assistant',
        content: 'Hold the power button for 15 seconds [S1].',
        decision: 'ANSWER',
        reasonCode: 'GROUNDED',
        citations: [
          {
            marker: 'S1',
            chunkId,
            documentId: docId,
            docTitle: 'Laptop troubleshooting',
            sectionPath: ['Power'],
            effectiveDate: new Date('2026-01-01'),
          },
        ],
        createdAt: new Date(T0.getTime() + 1000),
      }),
    );
    await request(ctx.app)
      .post(`${BASE}/${id(t.itLowOld)}/notes`)
      .set('Cookie', cookies.sam)
      .send({ body: 'Checked stock' });
    await request(ctx.app)
      .post(`${BASE}/${id(t.itLowOld)}/replies`)
      .set('Cookie', cookies.sam)
      .send({ body: 'Please bring it in' });

    const res = await request(ctx.app)
      .get(`${BASE}/${id(t.itLowOld)}`)
      .set('Cookie', cookies.sam);
    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({
      humanId: 'IT-0001',
      agentBrief: 'Brief for the agent',
      agentAssist: null,
      queueLabel: 'IT Hardware',
      requester: { name: 'Priya Shah', email: PRIYA },
    });
    expect(res.body.aiFilledFields).toEqual(['device_model']);
    expect(
      res.body.events.map((e: { type: string; visibility: string }) => [e.type, e.visibility]),
    ).toEqual([
      ['note', 'internal'],
      ['reply', 'public'],
    ]);
    expect(res.body.transcript.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(res.body.citationsShown).toEqual([
      expect.objectContaining({
        chunkId: chunkId.toHexString(),
        docTitle: 'Laptop troubleshooting',
      }),
    ]);
  });

  it('W3-07: carries the allowed next statuses and the category options for the editors', async () => {
    const { ctx, t, cookies } = await setup();
    const res = await request(ctx.app)
      .get(`${BASE}/${id(t.itLowOld)}`)
      .set('Cookie', cookies.sam);
    expect(res.body.allowedStatuses).toEqual(['in_progress', 'waiting_on_employee', 'resolved']);
    const ids = res.body.categoryOptions.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['hardware', 'access', 'payroll']));
    expect(res.body.categoryOptions.find((c: { id: string }) => c.id === 'hardware')).toMatchObject(
      {
        domain: 'IT',
        subcategories: expect.arrayContaining([{ id: 'battery', label: 'Battery or power' }]),
      },
    );
  });

  it('W3-07: a confidential case offers only its own category', async () => {
    const { ctx, t, cookies } = await setup();
    const res = await request(ctx.app)
      .get(`${BASE}/${id(t.restricted)}`)
      .set('Cookie', cookies.hana);
    expect(res.body.categoryOptions.map((c: { id: string }) => c.id)).toEqual([
      'employee_relations',
    ]);
  });
});

describe('replies and notes', () => {
  it('a reply is public (the employee sees it) and audited; a note is internal', async () => {
    const { ctx, t, cookies } = await setup();
    const reply = await request(ctx.app)
      .post(`${BASE}/${id(t.itLowOld)}/replies`)
      .set('Cookie', cookies.sam)
      .send({ body: '  Please bring the laptop to the IT desk.  ', usedAiDraft: true });
    expect(reply.status).toBe(201);
    expect(reply.body.event).toMatchObject({
      type: 'reply',
      visibility: 'public',
      body: 'Please bring the laptop to the IT desk.',
    });
    expect(ctx.audit.filter((a) => a.action === 'ticket.reply')).toEqual([
      expect.objectContaining({
        targetId: id(t.itLowOld),
        metadata: expect.objectContaining({ usedAiDraft: true }),
      }),
    ]);

    const note = await request(ctx.app)
      .post(`${BASE}/${id(t.itLowOld)}/notes`)
      .set('Cookie', cookies.sam)
      .send({ body: 'Internal only' });
    expect(note.body.event).toMatchObject({ type: 'note', visibility: 'internal' });

    const employeeView = await request(ctx.app)
      .get(`/api/tickets/${id(t.itLowOld)}`)
      .set('Cookie', cookies.priya);
    expect(employeeView.body.events.map((e: { type: string }) => e.type)).toEqual(['reply']);
  });

  it('notifies the requester of a reply and a status change, never of a note (UC-08)', async () => {
    const { ctx, t, cookies } = await setup();
    const ticketUrl = `${BASE}/${id(t.hr)}`;
    await request(ctx.app)
      .post(`${ticketUrl}/replies`)
      .set('Cookie', cookies.hana)
      .send({ body: 'You have 12 days left.\nPlease confirm the dates you need.' });
    await request(ctx.app)
      .post(`${ticketUrl}/notes`)
      .set('Cookie', cookies.hana)
      .send({ body: 'Internal: checked the leave balance' });
    const status = await request(ctx.app)
      .patch(`${ticketUrl}/status`)
      .set('Cookie', cookies.hana)
      .send({ status: 'waiting_on_employee' });
    expect(status.status).toBe(200);

    const notes = (ctx.deps.workspace as MemoryWorkspace).data.notifications;
    expect(notes.map((n) => [n.kind, n.title, n.body, n.link, n.readAt])).toEqual([
      [
        'request',
        'The team replied on HR-0001',
        'You have 12 days left. Please confirm the dates you need.',
        `/tickets/${id(t.hr)}`,
        null,
      ],
      [
        'request',
        'HR-0001 needs your reply',
        `${t.hr.summary} · now Waiting for you`,
        `/tickets/${id(t.hr)}`,
        null,
      ],
    ]);
    expect(notes.every((n) => n.userId.equals(t.hr.requesterId))).toBe(true);

    // The requester's bell shows them, newest first.
    const requester = ctx.users.find((u) => u._id.equals(t.hr.requesterId))!;
    const bell = await request(ctx.app)
      .get('/api/notifications')
      .set('Cookie', await loginCookie(ctx.app, requester.email));
    expect(bell.status).toBe(200);
    expect(bell.body.unreadCount).toBe(2);
    expect(bell.body.items[0].title).toBe('HR-0001 needs your reply');
  });

  it('a refused status change (409) notifies nobody', async () => {
    const { ctx, t, cookies } = await setup();
    const res = await request(ctx.app)
      .patch(`${BASE}/${id(t.hr)}/status`)
      .set('Cookie', cookies.hana)
      .send({ status: 'closed' });
    expect(res.status).toBe(409);
    expect((ctx.deps.workspace as MemoryWorkspace).data.notifications).toEqual([]);
  });

  it('rejects empty bodies (400) and replies on closed tickets (409)', async () => {
    const { ctx, t, cookies } = await setup();
    const empty = await request(ctx.app)
      .post(`${BASE}/${id(t.itLowOld)}/replies`)
      .set('Cookie', cookies.sam)
      .send({ body: '   ' });
    expect(empty.status).toBe(400);
    memory(ctx).tickets.find((x) => x._id.equals(t.itCritical._id))!.status = 'closed';
    const closed = await request(ctx.app)
      .post(`${BASE}/${id(t.itCritical)}/replies`)
      .set('Cookie', cookies.sam)
      .send({ body: 'Hello' });
    expect([closed.status, closed.body.error.code]).toEqual([409, 'CONFLICT']);
    // Notes are still allowed on closed tickets.
    expect(
      (
        await request(ctx.app)
          .post(`${BASE}/${id(t.itCritical)}/notes`)
          .set('Cookie', cookies.sam)
          .send({ body: 'post-mortem' })
      ).status,
    ).toBe(201);
  });
});

describe('status changes', () => {
  it('valid transitions update the ticket, add a public event and an audit entry', async () => {
    const { ctx, t, cookies } = await setup();
    const patch = (status: string) =>
      request(ctx.app)
        .patch(`${BASE}/${id(t.itLowOld)}/status`)
        .set('Cookie', cookies.sam)
        .send({ status });

    const started = await patch('in_progress');
    expect(started.status).toBe(200);
    expect(started.body.ticket).toMatchObject({ status: 'in_progress', resolvedAt: null });
    const resolved = await patch('resolved');
    expect(resolved.body.ticket.resolvedAt).not.toBeNull();
    const reopened = await patch('in_progress');
    expect(reopened.body.ticket.resolvedAt).toBeNull();

    const events = memory(ctx).events.filter((e) => e.type === 'status_change');
    expect(events.map((e) => [e.oldValue, e.newValue, e.visibility])).toEqual([
      ['new', 'in_progress', 'public'],
      ['in_progress', 'resolved', 'public'],
      ['resolved', 'in_progress', 'public'],
    ]);
    expect(ctx.audit.filter((a) => a.action === 'ticket.status_change')).toHaveLength(3);
  });

  it.each([
    ['new', 'closed'],
    ['new', 'new'],
    ['in_progress', 'new'],
    ['closed', 'in_progress'],
  ])('invalid transition %s → %s is 409 and changes nothing', async (from, to) => {
    const { ctx, t, cookies } = await setup();
    const stored = memory(ctx).tickets.find((x) => x._id.equals(t.itLowOld._id))!;
    stored.status = from as TicketDoc['status'];
    const res = await request(ctx.app)
      .patch(`${BASE}/${id(t.itLowOld)}/status`)
      .set('Cookie', cookies.sam)
      .send({ status: to });
    expect([res.status, res.body.error.code]).toEqual([409, 'CONFLICT']);
    expect(res.body.error.details).toEqual({ from, to });
    expect(stored.status).toBe(from);
    expect(memory(ctx).events).toHaveLength(0);
  });

  it('a stale update (someone else changed the ticket) is refused', async () => {
    const { ctx, t } = await setup();
    const stale = { ...t.itLowOld, status: 'in_progress' as const, updatedAt: new Date() };
    expect(await ctx.deps.agentTickets.update(stale, new Date(0))).toBe(false);
    expect(await ctx.deps.agentTickets.update(stale, t.itLowOld.updatedAt)).toBe(true);
  });
});

describe('classification corrections', () => {
  it('a category change re-routes, records one event per changed field with old/new, and is audited', async () => {
    const { ctx, t, cookies } = await setup();
    const res = await request(ctx.app)
      .patch(`${BASE}/${id(t.itLowOld)}/classification`)
      .set('Cookie', cookies.sam)
      .send({ category: 'payroll', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({
      category: 'payroll',
      subcategory: null,
      priority: 'high',
      queue: 'hr_payroll',
      domain: 'HR',
    });
    const events = memory(ctx).events.filter((e) => e.type === 'classification_correction');
    expect(events.map((e) => [e.field, e.oldValue, e.newValue, e.visibility])).toEqual([
      ['category', 'hardware', 'payroll', 'internal'],
      ['subcategory', 'laptop_fault', null, 'internal'],
      ['priority', 'low', 'high', 'internal'],
    ]);
    expect(events[0]!.body).toBe('Re-routed to Payroll');
    expect(ctx.audit.filter((a) => a.action === 'ticket.classification')).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          changed: ['category', 'subcategory', 'priority'],
          rerouted: true,
          queue: 'hr_payroll',
        }),
      }),
    ]);
    // Re-routed out of Sam's queues: he no longer sees it; Hana does.
    expect(
      (
        await request(ctx.app)
          .get(`${BASE}/${id(t.itLowOld)}`)
          .set('Cookie', cookies.sam)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(ctx.app)
          .get(`${BASE}/${id(t.itLowOld)}`)
          .set('Cookie', cookies.hana)
      ).status,
    ).toBe(200);
  });

  it('rejects values outside the taxonomy (400) and category changes on restricted cases', async () => {
    const { ctx, t, cookies } = await setup();
    const patch = (ticket: TicketDoc, body: object, cookie = cookies.sam) =>
      request(ctx.app)
        .patch(`${BASE}/${id(ticket)}/classification`)
        .set('Cookie', cookie)
        .send(body);
    for (const body of [
      { category: 'printers' },
      { subcategory: 'vpn' },
      {},
      { priority: 'urgent' },
    ]) {
      const res = await patch(t.itLowOld, body);
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
    const restricted = await patch(t.restricted, { category: 'leave' }, cookies.hana);
    expect(restricted.status).toBe(400);
    expect(restricted.body.error.details).toEqual({ reason: 'restricted_category' });
    const priority = await patch(t.restricted, { priority: 'critical' }, cookies.hana);
    expect(priority.body.ticket).toMatchObject({ priority: 'critical', queue: 'hr_case' });
    expect(memory(ctx).events.map((e) => e.field)).toEqual(['priority']);
  });

  it('a request that changes nothing records nothing', async () => {
    const { ctx, t, cookies } = await setup();
    const res = await request(ctx.app)
      .patch(`${BASE}/${id(t.itLowOld)}/classification`)
      .set('Cookie', cookies.sam)
      .send({ category: 'hardware', priority: 'low' });
    expect(res.status).toBe(200);
    expect(memory(ctx).events).toHaveLength(0);
    expect(ctx.audit.filter((a) => a.action === 'ticket.classification')).toHaveLength(0);
  });
});

describe('override rate', () => {
  it('= tickets with at least one correction ÷ tickets created (eval tickets excluded)', async () => {
    const { ctx, t, cookies } = await setup();
    expect(await ctx.deps.agentTickets.overrideRate()).toEqual({
      created: 6,
      overridden: 0,
      rate: 0,
    });
    // Two corrections on one ticket count once; a status change is not a correction.
    const correct = (ticket: TicketDoc, body: object, cookie: string) =>
      request(ctx.app)
        .patch(`${BASE}/${id(ticket)}/classification`)
        .set('Cookie', cookie)
        .send(body);
    await correct(t.itLowOld, { priority: 'medium' }, cookies.sam);
    await correct(t.itLowOld, { subcategory: 'battery' }, cookies.sam);
    await correct(t.hr, { category: 'benefits' }, cookies.hana);
    await request(ctx.app)
      .patch(`${BASE}/${id(t.itCritical)}/status`)
      .set('Cookie', cookies.sam)
      .send({ status: 'in_progress' });
    expect(await ctx.deps.agentTickets.overrideRate()).toEqual({
      created: 6,
      overridden: 2,
      rate: 2 / 6,
    });
    // Range on ticket creation time.
    const after = new Date(T0.getTime() + 15 * MINUTE);
    expect(await ctx.deps.agentTickets.overrideRate({ from: after })).toEqual({
      created: 2,
      overridden: 0,
      rate: 0,
    });
    expect(
      await ctx.deps.agentTickets.overrideRate({ from: new Date(Date.now() + MINUTE) }),
    ).toEqual({
      created: 0,
      overridden: 0,
      rate: 0,
    });
  });
});

// The requester's own changes (UC-17, ADR-028): comment, withdraw, reopen. Seed
// requests (buildMockRequests): Priya IT-9001 in progress and HR-9001 resolved;
// Tom HR-9002 waiting for him.
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { buildMockRequests } from '../../src/modules/workspace/seed';
import { buildTestApp, loginCookie, seededUsers, type TestContext } from '../helpers/app';
import { VALID_ENV } from '../helpers/config';
import { type MemoryTickets, memoryTicketsRepository } from '../helpers/tickets';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const HANA = 'hana.kim@example.com';
const config = loadConfig(VALID_ENV);

type Ctx = TestContext & { store: MemoryTickets };

async function setup(): Promise<Ctx> {
  const users = seededUsers();
  const requests = buildMockRequests({ users, today: '2026-10-07', routing: config.routing });
  const store = memoryTicketsRepository();
  for (const t of requests.tickets) await store.insert(t);
  for (const e of requests.ticketEvents) await store.insertEvent(e);
  return { ...buildTestApp({ users, tickets: store }), store };
}

const idOf = (ctx: Ctx, humanId: string) =>
  ctx.store.tickets.find((t) => t.humanId === humanId)!._id.toHexString();
const statusOf = (ctx: Ctx, humanId: string) =>
  ctx.store.tickets.find((t) => t.humanId === humanId)!.status;
const post = async (ctx: Ctx, email: string, path: string, body: object = {}) =>
  request(ctx.app)
    .post(path)
    .set('Cookie', await loginCookie(ctx.app, email))
    .send(body);

describe('comment', () => {
  it('adds a public reply from the employee and changes no status, audited', async () => {
    const ctx = await setup();
    const id = idOf(ctx, 'HR-9002');
    const res = await post(ctx, TOM, `/api/tickets/${id}/comment`, {
      body: 'My new badge works now, thanks.',
    });
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('waiting_on_employee'); // owner decision: unchanged
    expect(res.body.events.at(-1)).toMatchObject({
      type: 'reply',
      body: 'My new badge works now, thanks.',
    });
    const event = ctx.store.events.at(-1)!;
    expect(event.visibility).toBe('public');
    expect(event.actorId?.toHexString()).toBe(
      ctx.users.find((u) => u.email === TOM)!._id.toHexString(),
    );
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'ticket.comment',
      metadata: { triggeredBy: 'form', approvedBy: 'employee' },
    });
  });

  it('validates the body', async () => {
    const ctx = await setup();
    const res = await post(ctx, TOM, `/api/tickets/${idOf(ctx, 'HR-9002')}/comment`, {
      body: '  ',
    });
    expect(res.status).toBe(400);
  });
});

describe('withdraw', () => {
  it('closes an open request with the reason on the status event', async () => {
    const ctx = await setup();
    const id = idOf(ctx, 'IT-9001');
    const res = await post(ctx, PRIYA, `/api/tickets/${id}/withdraw`, { reason: 'Not needed now' });
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('closed');
    expect(ctx.store.events.at(-1)).toMatchObject({
      type: 'status_change',
      oldValue: 'in_progress',
      newValue: 'closed',
      body: 'Not needed now',
    });
    expect(ctx.audit.at(-1)).toMatchObject({
      action: 'ticket.withdraw',
      metadata: { from: 'in_progress', to: 'closed' },
    });
    // Closed is final: no comment, no second withdraw, no reopen.
    for (const kind of ['comment', 'withdraw', 'reopen']) {
      const again = await post(
        ctx,
        PRIYA,
        `/api/tickets/${id}/${kind}`,
        kind === 'comment' ? { body: 'x' } : {},
      );
      expect(again.status).toBe(409);
    }
  });

  it('refuses a resolved request (409) and leaves it unchanged', async () => {
    const ctx = await setup();
    const res = await post(ctx, PRIYA, `/api/tickets/${idOf(ctx, 'HR-9001')}/withdraw`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('This request cannot be withdrawn: it is already resolved');
    expect(statusOf(ctx, 'HR-9001')).toBe('resolved');
  });
});

describe('reopen', () => {
  it('moves a resolved request back to in progress and clears the resolution time', async () => {
    const ctx = await setup();
    const res = await post(ctx, PRIYA, `/api/tickets/${idOf(ctx, 'HR-9001')}/reopen`, {
      reason: 'The issue is back',
    });
    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ status: 'in_progress', resolvedAt: null });
  });

  it('refuses an open request', async () => {
    const ctx = await setup();
    const res = await post(ctx, PRIYA, `/api/tickets/${idOf(ctx, 'IT-9001')}/reopen`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('This request cannot be reopened: it is still open');
  });
});

describe('access', () => {
  it("another employee's request is not found, and agents cannot use these endpoints", async () => {
    const ctx = await setup();
    const id = idOf(ctx, 'IT-9001');
    expect((await post(ctx, TOM, `/api/tickets/${id}/withdraw`)).status).toBe(404);
    expect((await post(ctx, HANA, `/api/tickets/${id}/withdraw`)).status).toBe(403);
    expect((await request(ctx.app).post(`/api/tickets/${id}/withdraw`).send({})).status).toBe(401);
    expect(statusOf(ctx, 'IT-9001')).toBe('in_progress');
  });
});

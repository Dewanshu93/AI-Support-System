// Copilot request changes (UC-17, ADR-028): P-13 reads what to do, which request and
// the comment; code finds the request, checks the requester rules, the employee
// confirms, and the change goes through the request page's service. Seed requests:
// Priya IT-9001 in progress and HR-9001 resolved; Tom HR-9002 waiting for him.
import { parseSseEvents } from '@sd/shared';
import request from 'supertest';
import { loadConfig } from '../../src/config';
import { buildMockRequests } from '../../src/modules/workspace/seed';
import { VALID_ENV } from '../helpers/config';
import {
  analysisReply,
  buildChatTestApp,
  type ChatTestContext,
  loginCookie,
  newConversation,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const config = loadConfig(VALID_ENV);

const manageIntent = analysisReply({
  intent: 'request_action',
  category: 'none',
  searchQuery: 'change my request',
  workspaceIntent: 'request_manage',
});
const extraction = (over: object) =>
  JSON.stringify({ operation: 'unknown', requestRef: null, comment: null, ...over });

async function ask(email: string, content: string, extracted: string) {
  const ctx = buildChatTestApp();
  const requests = buildMockRequests({
    users: ctx.users,
    today: '2026-10-07',
    routing: config.routing,
  });
  for (const t of requests.tickets) await ctx.tickets.insert(t);
  const cookie = await loginCookie(ctx.app, email);
  const id = await newConversation(ctx.app, cookie);
  ctx.script([manageIntent, extracted]);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content });
  expect(res.status).toBe(200);
  const events = parseSseEvents(res.text);
  return {
    ctx,
    cookie,
    id,
    events,
    draft: events.find((e) => e.type === 'action_draft')?.data as { action: object } | undefined,
    reasonCode: (events.at(-1)?.data as { reasonCode?: string }).reasonCode,
  };
}

const statusOf = (ctx: ChatTestContext, humanId: string) =>
  ctx.tickets.tickets.find((t) => t.humanId === humanId)!.status;
const lastAssistant = (ctx: ChatTestContext) =>
  ctx.conversations.messages.filter((m) => m.role === 'assistant').at(-1)!.content;
const post = (ctx: ChatTestContext, cookie: string, id: string, what: 'confirm' | 'cancel') =>
  request(ctx.app).post(`/api/conversations/${id}/action/${what}`).set('Cookie', cookie).send({});

describe('change a request by chat (UC-17)', () => {
  it('withdraws a named request only after confirmation, audited as copilot + employee', async () => {
    const { ctx, cookie, id, draft } = await ask(
      PRIYA,
      'Please withdraw IT-9001, I do not need it any more',
      extraction({ operation: 'withdraw', requestRef: 'IT-9001' }),
    );
    expect(draft?.action).toMatchObject({
      kind: 'request_change',
      change: 'withdraw',
      humanId: 'IT-9001',
      comment: null,
      statusAfter: 'closed',
    });
    expect(statusOf(ctx, 'IT-9001')).toBe('in_progress'); // nothing before confirm

    const res = await post(ctx, cookie, id, 'confirm');
    expect(res.body.result).toMatchObject({ status: 'applied' });
    expect(res.body.result.message).toBe('IT-9001 is withdrawn: it now shows as Closed.');
    expect(statusOf(ctx, 'IT-9001')).toBe('closed');
    expect(ctx.audit.filter((a) => a.action === 'ticket.withdraw')).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ triggeredBy: 'copilot', approvedBy: 'employee' }),
      }),
    ]);
  });

  it('adds the exact comment shown, without changing the status', async () => {
    const { ctx, cookie, id, draft } = await ask(
      TOM,
      'Add a comment to my request: the new badge works now',
      extraction({ operation: 'comment', comment: 'The new badge works now' }),
    );
    // Tom has one request that can take a comment.
    expect(draft?.action).toMatchObject({
      humanId: 'HR-9002',
      comment: 'The new badge works now',
      statusAfter: null,
    });
    await post(ctx, cookie, id, 'confirm');
    expect(ctx.tickets.events.at(-1)).toMatchObject({
      type: 'reply',
      visibility: 'public',
      body: 'The new badge works now',
    });
    expect(statusOf(ctx, 'HR-9002')).toBe('waiting_on_employee');
  });

  it('reopens the only resolved request when none is named', async () => {
    const { draft } = await ask(
      PRIYA,
      'My parental leave question came back, please reopen it',
      extraction({ operation: 'reopen', requestRef: 'my parental leave question' }),
    );
    expect(draft?.action).toMatchObject({ humanId: 'HR-9001', statusAfter: 'in_progress' });
  });

  it('cancel changes nothing and says so', async () => {
    const { ctx, cookie, id } = await ask(
      PRIYA,
      'Withdraw IT-9001',
      extraction({ operation: 'withdraw', requestRef: 'IT-9001' }),
    );
    await post(ctx, cookie, id, 'cancel');
    expect(statusOf(ctx, 'IT-9001')).toBe('in_progress');
    expect(ctx.conversations.messages.at(-1)).toMatchObject({
      role: 'system_event',
      content: 'Cancelled. Your request was not changed.',
    });
  });
});

describe('what code decides before proposing', () => {
  it('asks which request when several fit, listing them', async () => {
    const { draft, ctx, reasonCode } = await ask(
      PRIYA,
      'Add a note: it works from home now',
      extraction({ operation: 'comment', comment: 'It works from home now' }),
    );
    expect(draft).toBeUndefined();
    expect(reasonCode).toBe('REQUEST_DETAILS_MISSING');
    expect(lastAssistant(ctx)).toContain('Which request should be commented on?');
    expect(lastAssistant(ctx)).toContain('IT-9001');
    expect(lastAssistant(ctx)).toContain('HR-9001');
  });

  it('refuses what the rules do not allow, with the reason', async () => {
    const { draft, ctx, reasonCode } = await ask(
      PRIYA,
      'Reopen IT-9001',
      extraction({ operation: 'reopen', requestRef: 'IT-9001' }),
    );
    expect(draft).toBeUndefined();
    expect(reasonCode).toBe('REQUEST_RULES');
    expect(lastAssistant(ctx)).toBe('IT-9001 cannot be reopened: it is still open.');
  });

  it("does not find another employee's request", async () => {
    const { draft, ctx, reasonCode } = await ask(
      PRIYA,
      'Withdraw HR-9002',
      extraction({ operation: 'withdraw', requestRef: 'HR-9002' }),
    );
    expect(draft).toBeUndefined();
    expect(reasonCode).toBe('REQUEST_NOT_FOUND');
    expect(statusOf(ctx, 'HR-9002')).toBe('waiting_on_employee');
  });

  it('asks for the comment text, and what to do when unclear', async () => {
    const noText = await ask(
      TOM,
      'Add a comment to HR-9002',
      extraction({ operation: 'comment', requestRef: 'HR-9002' }),
    );
    expect(lastAssistant(noText.ctx)).toContain('What should I add to HR-9002?');
    const unclear = await ask(TOM, 'About HR-9002', extraction({ requestRef: 'HR-9002' }));
    expect(lastAssistant(unclear.ctx)).toContain('add a comment, withdraw it, or reopen it');
  });
});

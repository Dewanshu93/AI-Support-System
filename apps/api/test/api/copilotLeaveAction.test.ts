// Copilot leave action (UC-11c, amendment A-1; rules E.3–E.4): the model reads the
// type and date phrases (P-12), code resolves and checks, the employee confirms,
// and only then is the request made — through the same service as the Leave page.
import { parseSseEvents } from '@sd/shared';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import {
  analysisReply,
  buildChatTestApp,
  type ChatTestContext,
  loginCookie,
  newConversation,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const RAVI = 'ravi.iyer@example.com';

const applyIntent = analysisReply({
  intent: 'request_action',
  category: 'none',
  searchQuery: 'book leave',
  workspaceIntent: 'leave_apply',
});
const extraction = (over: object = {}) =>
  JSON.stringify({ type: 'casual', startText: '26 October', endText: null, ...over });

async function say(ctx: ChatTestContext, cookie: string, id: string, content: string) {
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content });
  return { res, events: res.status === 200 ? parseSseEvents(res.text) : [] };
}

async function setup(email = PRIYA) {
  const ctx = buildChatTestApp();
  const cookie = await loginCookie(ctx.app, email);
  const user = ctx.users.find((u) => u.email === email)!;
  const id = await newConversation(ctx.app, cookie);
  return { ctx, cookie, user, id };
}

const leaveOf = (ctx: ChatTestContext, userId: ObjectId) =>
  ctx.workspace.data.leaveRequests.filter((r) => r.userId.equals(userId) && r.source === 'copilot');
const lastAssistant = (ctx: ChatTestContext) =>
  ctx.conversations.messages.filter((m) => m.role === 'assistant').at(-1)!.content;
const post = (ctx: ChatTestContext, cookie: string, id: string, what: 'confirm' | 'cancel') =>
  request(ctx.app).post(`/api/conversations/${id}/action/${what}`).set('Cookie', cookie).send({});

describe('book leave by chat (UC-11c)', () => {
  it('proposes the exact request, books nothing, and blocks new messages until confirmed', async () => {
    const { ctx, cookie, user, id } = await setup();
    ctx.script([applyIntent, extraction()]);
    const { res, events } = await say(ctx, cookie, id, 'I need a casual leave on 26 October');
    expect(res.status).toBe(200);
    expect(events.find((e) => e.type === 'action_draft')?.data).toEqual({
      action: {
        kind: 'leave_apply',
        type: 'casual',
        typeLabel: 'Casual leave',
        startDate: '2026-10-26',
        endDate: '2026-10-26',
        days: 1,
        availableAfter: 4, // 6, one day already waiting, this one
        needsApproval: true,
        warnings: [],
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      data: { decision: 'ANSWER', reasonCode: 'LEAVE_ACTION_PROPOSED' },
    });
    expect(lastAssistant(ctx)).toContain('Please confirm this leave request. Nothing is sent');
    expect(leaveOf(ctx, user._id)).toHaveLength(0);

    const detail = await request(ctx.app).get(`/api/conversations/${id}`).set('Cookie', cookie);
    expect(detail.body.pendingAction).toMatchObject({ kind: 'leave_apply', days: 1 });
    expect((await say(ctx, cookie, id, 'hello')).res.status).toBe(409);
  });

  it('confirm books it for HR approval, audits copilot + employee, and is idempotent', async () => {
    const { ctx, cookie, user, id } = await setup();
    ctx.script([applyIntent, extraction()]);
    await say(ctx, cookie, id, 'I need a casual leave on 26 October');

    const first = await post(ctx, cookie, id, 'confirm');
    expect(first.status).toBe(200);
    expect(first.body.result).toMatchObject({ status: 'applied', saved: 1 });
    expect(first.body.result.message).toBe(
      'Sent for approval: Casual leave, Mon 26 Oct (1 day). You will be notified when HR decides; you can follow it on the Leave page.',
    );
    const booked = leaveOf(ctx, user._id);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ type: 'casual', status: 'pending', dates: ['2026-10-26'] });
    expect(ctx.audit.filter((a) => a.action === 'leave.apply')).toEqual([
      expect.objectContaining({
        targetType: 'leave_request',
        targetId: booked[0]!._id.toHexString(),
        metadata: expect.objectContaining({
          triggeredBy: 'copilot',
          approvedBy: 'employee',
          type: 'casual',
          days: 1,
          status: 'pending',
        }),
      }),
    ]);
    expect(ctx.workspace.data.notifications.at(-1)).toMatchObject({ kind: 'leave' });

    const again = await post(ctx, cookie, id, 'confirm');
    expect(again.body.result).toEqual(first.body.result);
    expect(leaveOf(ctx, user._id)).toHaveLength(1);
    expect(ctx.audit.filter((a) => a.action === 'leave.apply')).toHaveLength(1);
  });

  it('cancel books nothing and says so', async () => {
    const { ctx, cookie, user, id } = await setup();
    ctx.script([applyIntent, extraction()]);
    await say(ctx, cookie, id, 'I need a casual leave on 26 October');
    expect((await post(ctx, cookie, id, 'cancel')).status).toBe(200);
    expect(leaveOf(ctx, user._id)).toHaveLength(0);
    expect(ctx.conversations.messages.at(-1)).toMatchObject({
      role: 'system_event',
      content: 'Leave request cancelled. Nothing was booked.',
    });
  });

  it('another employee cannot confirm it', async () => {
    const { ctx, cookie, user, id } = await setup();
    ctx.script([applyIntent, extraction()]);
    await say(ctx, cookie, id, 'I need a casual leave on 26 October');
    const res = await post(ctx, await loginCookie(ctx.app, RAVI), id, 'confirm');
    expect(res.status).toBe(404);
    expect(leaveOf(ctx, user._id)).toHaveLength(0);
  });

  it('if the leave changed since the proposal, confirm books nothing and says why', async () => {
    const { ctx, cookie, user, id } = await setup();
    ctx.script([applyIntent, extraction()]);
    await say(ctx, cookie, id, 'I need a casual leave on 26 October');
    // Meanwhile the same day was booked on the Leave page.
    const form = await request(ctx.app)
      .post('/api/leave/requests')
      .set('Cookie', cookie)
      .send({ type: 'annual', startDate: '2026-10-26', endDate: '2026-10-26' });
    expect(form.status).toBe(201);
    const res = await post(ctx, cookie, id, 'confirm');
    expect(res.body.result).toMatchObject({ status: 'failed', saved: 0 });
    expect(res.body.result.message).toContain('you already have leave on 2026-10-26');
    expect(leaveOf(ctx, user._id)).toHaveLength(0);
    expect(ctx.audit.filter((a) => a.action === 'leave.apply')).toHaveLength(1); // the form's
  });
});

describe('what code decides before proposing', () => {
  it('reads a range and counts working days only', async () => {
    const { ctx, cookie, id } = await setup();
    // Fri 23 – Tue 27 Oct: Fri, Mon, Tue.
    ctx.script([applyIntent, extraction({ type: 'annual', startText: 'Oct 23', endText: '27' })]);
    const { events } = await say(ctx, cookie, id, 'Annual leave Oct 23-27 please');
    expect(events.find((e) => e.type === 'action_draft')?.data).toMatchObject({
      action: { startDate: '2026-10-23', endDate: '2026-10-27', days: 3, availableAfter: 9 },
    });
  });

  it('asks for the type, with the balances, when it is not given; no proposal', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([applyIntent, extraction({ type: 'unknown' })]);
    const { events } = await say(ctx, cookie, id, 'Book me off on 26 October');
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'LEAVE_DETAILS_MISSING' } });
    expect(lastAssistant(ctx)).toContain(
      'Which kind of leave? You can book: Annual leave (12 left), Sick leave (10 left), Casual leave (5 left).',
    );
  });

  it('quotes back a date it cannot read instead of guessing', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([applyIntent, extraction({ startText: 'the 30th' })]);
    await say(ctx, cookie, id, 'Casual leave on the 30th');
    expect(lastAssistant(ctx)).toContain('I could not tell which day "the 30th" is');
  });

  it('applies the leave rules: an overlap is refused, not proposed', async () => {
    const { ctx, cookie, id } = await setup();
    // Priya already has a casual day waiting on Wed 14 Oct.
    ctx.script([applyIntent, extraction({ startText: '14 October' })]);
    const { events } = await say(ctx, cookie, id, 'Casual leave on 14 October');
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'LEAVE_RULES' } });
    expect(lastAssistant(ctx)).toContain('you already have leave on 2026-10-14');
  });

  it('records sick leave for a past day at once after confirmation', async () => {
    const { ctx, cookie, user, id } = await setup();
    // "Monday" for sick leave looks back: Mon 5 Oct.
    ctx.script([applyIntent, extraction({ type: 'sick', startText: 'Monday' })]);
    const { events } = await say(ctx, cookie, id, 'I was sick on Monday');
    expect(events.find((e) => e.type === 'action_draft')?.data).toMatchObject({
      action: { type: 'sick', startDate: '2026-10-05', needsApproval: false },
    });
    const res = await post(ctx, cookie, id, 'confirm');
    expect(res.body.result.message).toBe('Recorded: Sick leave, Mon 5 Oct (1 day).');
    expect(leaveOf(ctx, user._id)[0]).toMatchObject({ status: 'approved' });
    const day = ctx.workspace.data.attendance.find(
      (a) => a.userId.equals(user._id) && a.date === '2026-10-05',
    );
    expect(day).toMatchObject({ status: 'leave' });
  });

  it('tells a contractor without calling the extraction model', async () => {
    const { ctx, cookie, id } = await setup(TOM);
    ctx.script([applyIntent]);
    const { events } = await say(ctx, cookie, id, 'Book annual leave on 26 October');
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'LEAVE_NOT_ELIGIBLE' } });
    expect(lastAssistant(ctx)).toContain('As a contractor you do not have company leave balances');
    expect(ctx.chat.model.calls).toHaveLength(1); // P-1 only
  });

  it('invalid extraction output → one retry → safe fallback, nothing proposed', async () => {
    const { ctx, cookie, id } = await setup();
    const bad = JSON.stringify({ type: 'vacation', startText: 'Monday', endText: null });
    ctx.script([applyIntent, bad, bad]);
    const { events } = await say(ctx, cookie, id, 'vacation Monday');
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'LEAVE_EXTRACTION_FAILED' } });
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
  });
});

// Ticket confirmation (W3-03; contract flows 4–6): the graph pauses with a draft
// in one request and is resumed by confirm/cancel in another. No ticket exists
// before confirm; confirm is idempotent; edits cannot set requester, queue or priority.
import { parseSseEvents } from '@sd/shared';
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
const AGENT = 'sam.patel@example.com';

const leaveSlots = (fields = { leave_type: 'annual', question: 'how many days remain' }) =>
  JSON.stringify({
    category: 'leave',
    urgency: 'low',
    urgencyReason: 'question about leave',
    impactScope: 'me',
    summary: 'Question about annual leave',
    description: 'The employee wants HR to confirm their remaining annual leave.',
    alreadyTried: [],
    errorMessages: [],
    fields,
    requiredMissing: [],
  });

/** One escalation turn ("Talk to a human") that ends paused on a leave draft. */
async function escalate(ctx: ChatTestContext, cookie: string) {
  const id = await newConversation(ctx.app, cookie);
  ctx.script([analysisReply(), leaveSlots()]);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/escalate`)
    .set('Cookie', cookie)
    .send({});
  expect(res.status).toBe(200);
  return { id, events: parseSseEvents(res.text) };
}

const confirm = (ctx: ChatTestContext, cookie: string, id: string, body: object = {}) =>
  request(ctx.app)
    .post(`/api/conversations/${id}/ticket-draft/confirm`)
    .set('Cookie', cookie)
    .send(body);
const cancel = (ctx: ChatTestContext, cookie: string, id: string) =>
  request(ctx.app)
    .post(`/api/conversations/${id}/ticket-draft/cancel`)
    .set('Cookie', cookie)
    .send({});

describe('confirm (flow 4)', () => {
  it('no ticket exists before confirm; confirm creates exactly one, with requester, queue and priority set by code', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id, events } = await escalate(ctx, cookie);
    expect(events.map((e) => e.type)).toContain('ticket_draft');
    expect(ctx.tickets.tickets).toHaveLength(0); // contract: no ticket before confirmation

    const res = await confirm(ctx, cookie, id, {
      edits: { question: 'How many annual leave days do I have left?' },
    });
    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({
      humanId: 'HR-0001',
      queue: 'hr_general',
      priority: 'low',
      status: 'new',
    });
    expect(ctx.tickets.tickets).toHaveLength(1);
    const ticket = ctx.tickets.tickets[0]!;
    const priya = ctx.users.find((u) => u.email === PRIYA)!;
    expect(ticket.requesterId.equals(priya._id)).toBe(true);
    expect(ticket.requesterSnapshot).toMatchObject({
      name: 'Priya Shah',
      email: PRIYA,
      country: 'US',
    });
    expect(ticket.fields).toEqual({
      leave_type: 'annual',
      dates: 'unknown',
      question: 'How many annual leave days do I have left?',
    });
    expect(ticket.aiFilledFields).toEqual(['leave_type']); // the edited field is the employee's
    expect(ctx.tickets.events.map((e) => [e.type, e.visibility])).toEqual([['created', 'public']]);

    const conversation = ctx.conversations.conversations.find((c) => c._id.toHexString() === id)!;
    expect(conversation).toMatchObject({ status: 'escalated' });
    expect(conversation.ticketId?.equals(ticket._id)).toBe(true);
    expect(ctx.conversations.messages.at(-1)).toMatchObject({ role: 'system_event' });
    expect(ctx.conversations.messages.at(-1)!.content).toContain('HR-0001');
    expect(ctx.audit.map((a) => a.action)).toContain('ticket.create');

    // The draft is gone and the conversation takes new messages again.
    const detail = await request(ctx.app).get(`/api/conversations/${id}`).set('Cookie', cookie);
    expect(detail.body.pendingDraft).toBeUndefined();
  });

  it('is idempotent: confirming again returns the same ticket and creates nothing', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);
    const first = await confirm(ctx, cookie, id);
    const second = await confirm(ctx, cookie, id);
    expect(second.status).toBe(200);
    expect(second.body.ticket).toEqual(first.body.ticket);
    expect(ctx.tickets.tickets).toHaveLength(1);
    expect(ctx.audit.filter((a) => a.action === 'ticket.create')).toHaveLength(1);
  });

  it('edits cannot set requester, queue or priority (400, nothing created)', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);
    const res = await confirm(ctx, cookie, id, {
      edits: { requesterId: 'someone-else', queue: 'hr_case', priority: 'critical', question: 'x' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.unknownFields).toEqual(['requesterId', 'queue', 'priority']);
    expect(ctx.tickets.tickets).toHaveLength(0);
    // Unknown top-level keys are rejected by the request schema too.
    expect((await confirm(ctx, cookie, id, { requester: 'x' })).status).toBe(400);
    // The draft is still there to confirm properly.
    expect((await confirm(ctx, cookie, id)).status).toBe(200);
  });
});

describe('duplicate prompt (flow 5)', () => {
  it('409 DUPLICATE_CANDIDATE, then "same" links and "new" creates a linked duplicate', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const first = await escalate(ctx, cookie);
    await confirm(ctx, cookie, first.id);

    const second = await escalate(ctx, cookie);
    const dup = await confirm(ctx, cookie, second.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_CANDIDATE');
    expect(dup.body.error.details).toEqual({
      existing: { humanId: 'HR-0001', summary: 'Question about annual leave', status: 'new' },
    });
    expect(ctx.tickets.tickets).toHaveLength(1);

    const same = await confirm(ctx, cookie, second.id, { duplicateDecision: 'same' });
    expect(same.status).toBe(200);
    expect(same.body.ticket.humanId).toBe('HR-0001');
    expect(ctx.tickets.tickets).toHaveLength(1);
    expect(ctx.conversations.messages.at(-1)!.content).toContain('existing ticket HR-0001');

    const third = await escalate(ctx, cookie);
    const created = await confirm(ctx, cookie, third.id, { duplicateDecision: 'new' });
    expect(created.body.ticket.humanId).toBe('HR-0002');
    expect(ctx.tickets.tickets[1]!.duplicateOf?.equals(ctx.tickets.tickets[0]!._id)).toBe(true);
  });

  it('another employee’s open ticket is not a duplicate', async () => {
    const ctx = buildChatTestApp();
    const priya = await loginCookie(ctx.app, PRIYA);
    const tom = await loginCookie(ctx.app, TOM);
    await confirm(ctx, priya, (await escalate(ctx, priya)).id);
    const res = await confirm(ctx, tom, (await escalate(ctx, tom)).id);
    expect(res.status).toBe(200);
    expect(res.body.ticket.humanId).toBe('HR-0002');
  });
});

describe('cancel', () => {
  it('cancels the draft: no ticket, a system message, and nothing left to confirm', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);
    const res = await cancel(ctx, cookie, id);
    expect(res.status).toBe(200);
    expect(res.body.conversation.status).toBe('open');
    expect(ctx.tickets.tickets).toHaveLength(0);
    expect(ctx.conversations.messages.at(-1)!.content).toContain("haven't raised a ticket");
    expect((await cancel(ctx, cookie, id)).status).toBe(404);
    expect((await confirm(ctx, cookie, id)).status).toBe(404);
  });
});

describe('access', () => {
  it('404 without a draft or for another employee; 403 for agents; 401 without a session', async () => {
    const ctx = buildChatTestApp();
    const priya = await loginCookie(ctx.app, PRIYA);
    const empty = await newConversation(ctx.app, priya);
    expect((await confirm(ctx, priya, empty)).status).toBe(404);
    const { id } = await escalate(ctx, priya);
    const tom = await loginCookie(ctx.app, TOM);
    expect((await confirm(ctx, tom, id)).status).toBe(404);
    expect((await cancel(ctx, tom, id)).status).toBe(404);
    const agent = await loginCookie(ctx.app, AGENT);
    expect((await confirm(ctx, agent, id)).status).toBe(403);
    expect(
      (await request(ctx.app).post(`/api/conversations/${id}/ticket-draft/confirm`).send({}))
        .status,
    ).toBe(401);
    expect(ctx.tickets.tickets).toHaveLength(0);
  });
});

describe('sensitive "Yes" (flow 6)', () => {
  async function sensitive(ctx: ChatTestContext, cookie: string, text: string) {
    const id = await newConversation(ctx.app, cookie);
    const res = await request(ctx.app)
      .post(`/api/conversations/${id}/messages`)
      .set('Cookie', cookie)
      .send({ content: text });
    return { id, events: parseSseEvents(res.text) };
  }

  it('offers private contact (no ticket draft shown); "Yes" creates a restricted hr_case ticket', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id, events } = await sensitive(ctx, cookie, 'My manager keeps harassing me');
    expect(events.map((e) => e.type)).toEqual(['turn_started', 'status', 'handoff', 'done']);
    expect(ctx.tickets.tickets).toHaveLength(0);

    const res = await confirm(ctx, cookie, id);
    expect(res.body.ticket).toMatchObject({
      humanId: 'HR-0001',
      queue: 'hr_case',
      priority: 'high',
    });
    const ticket = ctx.tickets.tickets[0]!;
    expect(ticket).toMatchObject({
      restricted: true,
      category: 'employee_relations',
      fields: {},
      aiFilledFields: [],
      summary: 'Confidential HR contact request',
    });
    expect(ticket.agentBrief).not.toContain('harass'); // no transcript in the case
    const conversation = ctx.conversations.conversations.find((c) => c._id.toHexString() === id)!;
    expect(conversation).toMatchObject({ restricted: true, status: 'handed_off' });
  });

  it('wellbeing (self-harm language) makes the case critical; edits are not allowed', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await sensitive(ctx, cookie, "I can't cope any more and I feel burnt out");
    expect((await confirm(ctx, cookie, id, { edits: { question: 'x' } })).status).toBe(400);
    const res = await confirm(ctx, cookie, id);
    expect(res.body.ticket.priority).toBe('critical');
  });

  it('"No thanks" (cancel) creates nothing', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await sensitive(ctx, cookie, 'I want to raise a formal complaint');
    expect((await cancel(ctx, cookie, id)).status).toBe(200);
    expect(ctx.tickets.tickets).toHaveLength(0);
  });
});

describe('employee ticket views', () => {
  it('lists and shows only the requester’s own tickets, without internal fields', async () => {
    const ctx = buildChatTestApp();
    const priya = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, priya);
    const { body } = await confirm(ctx, priya, id);

    const list = await request(ctx.app).get('/api/tickets/mine').set('Cookie', priya);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ humanId: 'HR-0001', status: 'new' }),
    ]);

    const detail = await request(ctx.app)
      .get(`/api/tickets/${body.ticket.id}`)
      .set('Cookie', priya);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket).toMatchObject({
      humanId: 'HR-0001',
      queueLabel: 'HR General',
      conversationId: id,
    });
    expect(detail.body.ticket.agentBrief).toBeUndefined();
    expect(detail.body.ticket.requesterSnapshot).toBeUndefined();
    expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual(['created']);

    const tom = await loginCookie(ctx.app, TOM);
    expect(
      (await request(ctx.app).get(`/api/tickets/${body.ticket.id}`).set('Cookie', tom)).status,
    ).toBe(404);
    expect((await request(ctx.app).get('/api/tickets/mine').set('Cookie', tom)).body.items).toEqual(
      [],
    );
    const agent = await loginCookie(ctx.app, AGENT);
    expect((await request(ctx.app).get('/api/tickets/mine').set('Cookie', agent)).status).toBe(403);
  });
});

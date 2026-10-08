// Escalation email (UC-07, ADR-017; Build Contract v2.0 flow 7, section H) on
// the real graph with fake models. Code drafts the email (figures from the
// employee's records, never from a model), the employee edits subject and body,
// and nothing is written or sent before confirm. Sending is idempotent.
import { parseSseEvents, type TicketDraft } from '@sd/shared';
import request from 'supertest';
import {
  analysisReply,
  buildChatTestApp,
  type ChatTestContext,
  loginCookie,
  newConversation,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com'; // another employee
const HANA = 'hana.kim@example.com'; // hr_general + hr_payroll + hr_case
const SAM = 'sam.patel@example.com'; // IT queues only

/** P-5 for a payroll request: pay_period unknown (code fills it from records), no digits. */
const payrollSlots = JSON.stringify({
  category: 'payroll',
  urgency: 'medium',
  urgencyReason: 'pay is lower than expected',
  impactScope: 'me',
  summary: 'Loss of Pay deduction on the latest payslip',
  description: 'The employee asks payroll to review a Loss of Pay deduction they think is wrong.',
  alreadyTried: ['Read the Loss of Pay policy'],
  errorMessages: [],
  fields: { pay_period: 'unknown', question: 'Please review my Loss of Pay deduction.' },
  requiredMissing: ['pay_period'],
});

/** "Talk to a person" on a new conversation; ends paused on the payroll draft. */
async function escalate(ctx: ChatTestContext, cookie: string) {
  const id = await newConversation(ctx.app, cookie);
  ctx.script([analysisReply({ category: 'payroll' }), payrollSlots]);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/escalate`)
    .set('Cookie', cookie)
    .send({});
  expect(res.status).toBe(200);
  const draftEvent = parseSseEvents(res.text).find((e) => e.type === 'ticket_draft');
  expect(draftEvent).toBeDefined();
  return { id, draft: (draftEvent!.data as { draft: TicketDraft }).draft };
}

const confirm = (ctx: ChatTestContext, cookie: string, id: string, body: object = {}) =>
  request(ctx.app)
    .post(`/api/conversations/${id}/ticket-draft/confirm`)
    .set('Cookie', cookie)
    .send(body);

/** Everything any fake model call received, as one string. */
const modelInputs = (ctx: ChatTestContext) =>
  (ctx.chat.model as unknown as { calls: { content: unknown }[][] }).calls
    .flat()
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');

/** The LOP amount and date the email states, read from the code-written line. */
function lopLine(body: string) {
  const match = /Loss of Pay (\S+) for ([^(]+?) \(payslip paid/.exec(body);
  expect(match).not.toBeNull();
  return { amount: match![1]!, date: match![2]! };
}

describe('drafting (before confirm)', () => {
  it('drafts a payroll email from records: To Payroll, pay period from payslips, exact LOP line', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { draft } = await escalate(ctx, cookie);

    // Code filled the pay period, so the employee was not asked for it.
    expect(draft.recordFilledFields).toEqual(['pay_period']);
    expect(draft.fields.pay_period).not.toBe('unknown');
    expect(draft.aiFilledFields).not.toContain('pay_period');
    expect(draft.requiredMissing).toEqual([]);

    const email = draft.email!;
    expect(email.to).toEqual({
      queueId: 'hr_payroll',
      label: 'Payroll',
      address: 'payroll@example.com',
    });
    expect(email.from).toEqual({ name: 'Priya Shah', address: PRIYA });
    expect(email.issueSource).toBe('model');
    // "{category label} request: {summary}" (the taxonomy label of payroll).
    expect(email.subject).toBe(
      'Pay and expenses request: Loss of Pay deduction on the latest payslip',
    );
    expect(email.body).toMatch(/^Hello Payroll team,/);
    for (const heading of ['Issue:', 'System information:', 'Action taken:', 'Request:']) {
      expect(email.body).toContain(heading);
    }
    expect(email.body).toContain('Employee: Priya Shah');
    expect(email.body).toContain(
      `Pay period or expense date concerned: ${draft.fields.pay_period}`,
    );
    lopLine(email.body); // the code-written LOP line is present
    expect(email.body).toContain('Please review my Loss of Pay deduction.');

    // Nothing written or sent before confirm.
    expect(ctx.emails.rows).toHaveLength(0);
    expect(ctx.tickets.tickets).toHaveLength(0);
  });

  it('privacy: no model call ever sees the LOP amount or date', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id, draft } = await escalate(ctx, cookie);
    const { amount, date } = lopLine(draft.email!.body);

    expect(await confirm(ctx, cookie, id)).toHaveProperty('status', 200);

    const seen = modelInputs(ctx);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(amount);
    expect(seen).not.toContain(date);
  });

  it('the assistant text is the figure-free draft-ready template', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    await escalate(ctx, cookie);
    const reply = ctx.conversations.messages.filter((m) => m.role === 'assistant').at(-1)!;
    expect(reply.content).toContain('Nothing is sent until you press Send');
    expect(reply.content).not.toMatch(/\d/);
  });
});

describe('confirm and send', () => {
  it('stores exactly the edited subject and body, records it once, and audits IDs and flags only', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id, draft } = await escalate(ctx, cookie);
    const subject = 'Please review the Loss of Pay on my payslip';
    const body = `${draft.email!.body}\n\nThanks for your help.`;

    const res = await confirm(ctx, cookie, id, { email: { subject, body } });

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ humanId: 'HR-0001', queue: 'hr_payroll' });
    expect(res.body.email).toEqual({ id: expect.any(String), status: 'recorded', mode: 'mock' });

    expect(ctx.emails.rows).toHaveLength(1);
    const row = ctx.emails.rows[0]!;
    expect(row).toMatchObject({
      subject,
      body,
      edited: { subject: true, body: true },
      aiDraft: { subject: draft.email!.subject, body: draft.email!.body },
      ticketHumanId: 'HR-0001',
      to: { queueId: 'hr_payroll', address: 'payroll@example.com' },
      from: { name: 'Priya Shah', address: PRIYA },
      delivery: { mode: 'mock', status: 'recorded', attempts: 1 },
    });
    expect(row.ticketId.equals(ctx.tickets.tickets[0]!._id)).toBe(true);

    // One public event naming the team only, and a chat note without the subject.
    const sent = ctx.tickets.events.filter((e) => e.type === 'email_sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ visibility: 'public', body: 'Email sent to Payroll' });
    const note = ctx.conversations.messages.at(-1)!;
    expect(note.role).toBe('system_event');
    expect(note.content).toContain('HR-0001');
    expect(note.content).not.toContain(subject);

    const audit = ctx.audit.filter((a) => a.action === 'email.send');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toEqual({
      conversationId: id,
      ticketHumanId: 'HR-0001',
      queue: 'hr_payroll',
      mode: 'mock',
      status: 'recorded',
      editedSubject: true,
      editedBody: true,
    });
  });

  it('without an email in the request, the drafted text that was shown is sent', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id, draft } = await escalate(ctx, cookie);

    expect((await confirm(ctx, cookie, id)).status).toBe(200);

    expect(ctx.emails.rows[0]).toMatchObject({
      subject: draft.email!.subject,
      body: draft.email!.body,
      edited: { subject: false, body: false },
    });
  });

  it('confirming again creates nothing: one ticket, one email, one event, one audit entry', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);

    const first = await confirm(ctx, cookie, id);
    const second = await confirm(ctx, cookie, id);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(ctx.tickets.tickets).toHaveLength(1);
    expect(ctx.emails.rows).toHaveLength(1);
    expect(ctx.tickets.events.filter((e) => e.type === 'email_sent')).toHaveLength(1);
    expect(ctx.audit.filter((a) => a.action === 'email.send')).toHaveLength(1);
  });

  it('a crash while recording the email resumes at sendEmail on the next confirm', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);
    const recordOnce = ctx.emails.recordOnce;
    ctx.emails.recordOnce = async () => {
      throw new Error('outbox unavailable');
    };

    expect((await confirm(ctx, cookie, id)).status).toBe(500);
    expect(ctx.tickets.tickets).toHaveLength(1); // the ticket exists; the email does not
    expect(ctx.emails.rows).toHaveLength(0);

    ctx.emails.recordOnce = recordOnce;
    const retry = await confirm(ctx, cookie, id);

    expect(retry.status).toBe(200);
    expect(retry.body.email).toMatchObject({ status: 'recorded' });
    expect(ctx.tickets.tickets).toHaveLength(1);
    expect(ctx.emails.rows).toHaveLength(1);
    expect(ctx.tickets.events.filter((e) => e.type === 'email_sent')).toHaveLength(1);
    expect(ctx.audit.filter((a) => a.action === 'email.send')).toHaveLength(1);
  });

  it('cancel writes no email and runs no send', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);

    const res = await request(ctx.app)
      .post(`/api/conversations/${id}/ticket-draft/cancel`)
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(200);
    expect(ctx.emails.rows).toHaveLength(0);
    expect(ctx.tickets.tickets).toHaveLength(0);
  });
});

describe('validation (nothing is created on a 4xx)', () => {
  const long = 'x'.repeat(5001);
  it.each([
    ['a subject with a newline', { subject: 'Line one\nBcc: someone', body: 'Hello' }],
    ['an empty subject', { subject: '   ', body: 'Hello' }],
    ['a body over 5000 characters', { subject: 'Hello', body: long }],
    ['an extra key (the recipient is set by code)', { subject: 'Hi', body: 'Hi', to: 'x@y.z' }],
  ])('400 for %s', async (_name, email) => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);

    const res = await confirm(ctx, cookie, id, { email });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(ctx.tickets.tickets).toHaveLength(0);
    expect(ctx.emails.rows).toHaveLength(0);
  });
});

describe('confidential cases', () => {
  async function sensitive(ctx: ChatTestContext, cookie: string) {
    const id = await newConversation(ctx.app, cookie);
    await request(ctx.app)
      .post(`/api/conversations/${id}/messages`)
      .set('Cookie', cookie)
      .send({ content: 'My manager keeps harassing me' });
    return id;
  }

  it('a restricted case never gets an email', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const id = await sensitive(ctx, cookie);

    const res = await confirm(ctx, cookie, id);

    expect(res.status).toBe(200);
    expect(res.body.ticket.queue).toBe('hr_case');
    expect(res.body.email).toBeNull();
    expect(ctx.emails.rows).toHaveLength(0);
    expect(ctx.audit.filter((a) => a.action === 'email.send')).toHaveLength(0);
  });

  it('400 when an email is sent for a draft that has none', async () => {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const id = await sensitive(ctx, cookie);

    const res = await confirm(ctx, cookie, id, { email: { subject: 'Hi', body: 'Hi' } });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('This request has no email to send');
    expect(ctx.tickets.tickets).toHaveLength(0);
  });
});

describe('who sees the email', () => {
  async function sent() {
    const ctx = buildChatTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const { id } = await escalate(ctx, cookie);
    await confirm(ctx, cookie, id, { email: { subject: 'LOP review please', body: 'Hello' } });
    return { ctx, cookie, ticketId: ctx.tickets.tickets[0]!._id.toHexString() };
  }

  it('the requester sees it on the ticket, without delivery internals', async () => {
    const { ctx, cookie, ticketId } = await sent();

    const res = await request(ctx.app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.emails).toEqual([
      {
        id: ctx.emails.rows[0]!._id.toHexString(),
        to: { label: 'Payroll', address: 'payroll@example.com' },
        subject: 'LOP review please',
        body: 'Hello',
        status: 'recorded',
        mode: 'mock',
        edited: { subject: true, body: true },
        createdAt: expect.any(String),
        deliveredAt: expect.any(String),
      },
    ]);
    expect(res.body.events.map((e: { type: string }) => e.type)).toContain('email_sent');
  });

  it('another employee gets 404 and no email data', async () => {
    const { ctx, ticketId } = await sent();
    const tom = await loginCookie(ctx.app, TOM);

    const res = await request(ctx.app).get(`/api/tickets/${ticketId}`).set('Cookie', tom);

    expect(res.status).toBe(404);
    expect(res.body.emails).toBeUndefined();
  });

  it('the payroll queue’s agent sees it; an IT agent gets 404', async () => {
    const { ctx, ticketId } = await sent();
    const [hana, sam] = await Promise.all([loginCookie(ctx.app, HANA), loginCookie(ctx.app, SAM)]);

    const forHana = await request(ctx.app)
      .get(`/api/agent/tickets/${ticketId}`)
      .set('Cookie', hana);
    const forSam = await request(ctx.app).get(`/api/agent/tickets/${ticketId}`).set('Cookie', sam);

    expect(forHana.status).toBe(200);
    expect(forHana.body.emails).toHaveLength(1);
    expect(forHana.body.emails[0]).toMatchObject({ subject: 'LOP review please' });
    expect(forSam.status).toBe(404);
  });
});

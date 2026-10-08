// Payroll agent (UC-06; Build Contract v2.0 flow 5, rule E.2): "why was my pay
// reduced?" is answered from the employee's own records (written by code) plus
// the cited policy (written by the model, checked by code), then next steps.
import { parseSseEvents } from '@sd/shared';
import request from 'supertest';
import { seedId } from '../../src/modules/workspace/seed';
import {
  analysisReply,
  buildChatTestApp,
  chunk,
  type ChatTestContext,
  loginCookie,
  newConversation,
  rerankReply,
  retrievalOf,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';

const LOP_CHUNKS = [
  chunk(
    'hr-loss-of-pay',
    'A working day is treated as LOP when, at the payroll cutoff, there is no timesheet entry and no attendance record for the day.',
    { docTitle: 'Loss of Pay (LOP)', sectionPath: ['When a day becomes LOP'] },
  ),
  chunk(
    'hr-loss-of-pay',
    'Log the missing hours in your timesheet, then raise a payroll request asking for an LOP review. Payroll reviews LOP requests within 3 working days.',
    { docTitle: 'Loss of Pay (LOP)', sectionPath: ['Reversing an LOP deduction'] },
  ),
];

const payrollIntent = analysisReply({
  intent: 'question',
  category: 'payroll',
  searchQuery: 'why was my salary reduced',
  workspaceIntent: 'payroll_explain',
});
const explanation = (text: string) => JSON.stringify({ explanation: text });
const GOOD =
  'Your payslip shows a Loss of Pay deduction because a working day with no timesheet entry and no attendance record at the payroll cutoff is treated as LOP [S1]. If you worked that day, log the missing hours and raise a payroll request for an LOP review; payroll reviews these within 3 working days [S2].';

async function ask(ctx: ChatTestContext, email: string, text = 'Why was my salary reduced?') {
  const cookie = await loginCookie(ctx.app, email);
  const id = await newConversation(ctx.app, cookie);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content: text });
  expect(res.status).toBe(200);
  const events = parseSseEvents(res.text);
  const reply = events
    .filter((e) => e.type === 'token')
    .map((e) => (e.data as { text: string }).text)
    .join('');
  return { events, reply, done: events.at(-1)!.data as { reasonCode: string; decision: string } };
}

const build = () => buildChatTestApp({ retrieve: async () => retrievalOf(LOP_CHUNKS) });

describe('payroll agent (flow 5)', () => {
  it('answers with records (code), cited policy (model) and next steps (code)', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    const { events, reply, done } = await ask(ctx, PRIYA);

    expect(done).toMatchObject({ decision: 'ANSWER', reasonCode: 'PAYROLL_EXPLAINED' });
    // Records: the exact figures from the payslip and attendance, written by code.
    expect(reply).toContain('Your records');
    expect(reply).toContain('Loss of Pay $400.00 for Fri 11 Sept');
    expect(reply).toContain('paid Wed 30 Sept');
    expect(reply).toContain('attendance shows "absent"');
    expect(reply).toContain('your timesheet has no hours for that day');
    // Policy: the model's explanation, with its citations validated.
    expect(reply).toContain('What the policy says');
    expect(reply).toContain('treated as LOP [S1]');
    const citations = events.find((e) => e.type === 'citations')?.data as {
      items: { docTitle: string }[];
    };
    expect(citations.items.map((c) => c.docTitle)).toEqual([
      'Loss of Pay (LOP)',
      'Loss of Pay (LOP)',
    ]);
    // Next steps: log the day first, then a payroll request.
    expect(reply).toContain('log the hours first');
    expect(reply).toContain('raise a payroll request');
  });

  it('drops an explanation that invents a figure, but still shows the records', async () => {
    const ctx = build();
    ctx.script([
      payrollIntent,
      rerankReply(LOP_CHUNKS),
      explanation('You lost $500 because the day was unpaid [S1].'),
    ]);
    const { reply, done } = await ask(ctx, PRIYA);
    expect(reply).not.toContain('$500');
    expect(reply).toContain('Loss of Pay $400.00');
    expect(reply).toContain('could not find a policy passage I can cite');
    expect(done.reasonCode).toBe('PAYROLL_EXPLANATION_WITHDRAWN');
    expect(ctx.conversations.traces.at(-1)!.output.withdrawn).toBe(true);
  });

  it('after the missing day is logged, says the timesheet now shows it', async () => {
    const ctx = build();
    const priya = ctx.users.find((u) => u.email === PRIYA)!;
    await ctx.workspace.upsertTimesheetEntry({
      userId: priya._id,
      date: '2026-09-11',
      projectId: seedId('project:BANK'),
      hours: 8,
      note: null,
      source: 'copilot',
      late: true,
      now: new Date(),
    });
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    const { reply } = await ask(ctx, PRIYA, 'Why was I charged LOP for 11 September?');
    expect(reply).toContain('your timesheet now shows 8 h, logged after the pay period closed');
    expect(reply).not.toContain('log the hours first');
    expect(reply).toContain('raise a payroll request');
  });

  it('contractors get the agency reply, with no search and no explanation call', async () => {
    const ctx = build();
    ctx.script([payrollIntent]);
    const { reply, done, events } = await ask(ctx, TOM);
    expect(reply).toContain('paid by your agency');
    expect(done.reasonCode).toBe('RECORDS_PAID_BY_AGENCY');
    expect(events.some((e) => e.type === 'citations')).toBe(false);
    // Only P-1 was called.
    expect((ctx.chat.model as unknown as { calls: unknown[] }).calls ?? []).toHaveLength(1);
  });

  it('a payroll question by someone without a deduction lists the deductions instead', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    const { reply } = await ask(
      ctx,
      'olivia.bennett@example.com',
      'What are the deductions on my payslip?',
    );
    expect(reply).toContain('There is no Loss of Pay deduction on your recent payslips.');
    expect(reply).toContain('Income tax (PAYE)');
  });
});

describe('payroll agent: what the model sees and what code checks (review fixes)', () => {
  it('the model gets the situation without any pay figure, date or amount', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    await ask(ctx, PRIYA);
    const calls = (ctx.chat.model as unknown as { calls: { content: unknown }[][] }).calls;
    const p11 = JSON.stringify(calls.at(-1));
    expect(p11).toContain('A Loss of Pay day on a recent payslip');
    expect(p11).toContain('attendance recorded as absent');
    for (const figure of ['400', '4,333', '2,571', '11 Sept', '30 Sept']) {
      expect(p11).not.toContain(figure);
    }
  });

  it('an explanation that repeats a record date is withdrawn by the number check; records stay', async () => {
    const ctx = build();
    ctx.script([
      payrollIntent,
      rerankReply(LOP_CHUNKS),
      explanation(
        'Your absence on 11 September had no timesheet entry, so it is treated as LOP [S1].',
      ),
    ]);
    const { reply, done } = await ask(ctx, PRIYA);
    expect(done.reasonCode).toBe('PAYROLL_EXPLANATION_WITHDRAWN');
    expect(reply).toContain('Loss of Pay $400.00 for Fri 11 Sept');
    expect(reply).not.toContain('Your absence on');
    expect(ctx.conversations.traces.at(-1)!.output).toMatchObject({
      numericViolations: ['11'],
      withdrawn: true,
    });
  });

  it('policy numbers copied from a cited source are kept', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    const { reply } = await ask(ctx, PRIYA);
    expect(reply).toContain('within 3 working days [S2]');
  });

  it('no policy found: no explanation call, records only, nothing logged as a citation failure', async () => {
    const ctx = buildChatTestApp({ retrieve: async () => retrievalOf([]) });
    ctx.script([payrollIntent]);
    const { reply, done } = await ask(ctx, PRIYA);
    expect(done).toMatchObject({ decision: 'ANSWER', reasonCode: 'PAYROLL_RECORDS_ONLY' });
    expect(reply).toContain('could not find a policy passage I can cite');
    expect((ctx.chat.model as unknown as { calls: unknown[] }).calls).toHaveLength(1); // P-1 only
    const trace = ctx.conversations.traces.at(-1)!;
    expect(trace.output).toMatchObject({ citationsProposed: [], withdrawn: false });
    expect(trace.decision.reasonCode).toBe('PAYROLL_RECORDS_ONLY');
  });

  it('invalid explanation output twice falls back to records only', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), '{"wrong":true}', '{"wrong":true}']);
    const { reply, done } = await ask(ctx, PRIYA);
    expect(done.reasonCode).toBe('PAYROLL_RECORDS_ONLY');
    expect(reply).toContain('Loss of Pay $400.00');
    expect(ctx.conversations.traces.at(-1)!.decision.value).toBe('ANSWER');
  });

  it('an explanation without citation markers is not shown', async () => {
    const ctx = build();
    ctx.script([
      payrollIntent,
      rerankReply(LOP_CHUNKS),
      explanation('A day without a timesheet becomes Loss of Pay.'),
    ]);
    const { reply, done } = await ask(ctx, PRIYA);
    expect(reply).not.toContain('A day without a timesheet becomes Loss of Pay.');
    expect(done.reasonCode).toBe('PAYROLL_EXPLANATION_WITHDRAWN');
  });

  it('a multi-day LOP deduction is split in cents so the days add up to the payslip', async () => {
    const ctx = build();
    const priya = ctx.users.find((u) => u.email === PRIYA)!;
    const slip = ctx.workspace.data.payslips
      .filter((p) => p.userId.equals(priya._id))
      .find((p) => p.deductions.some((d) => d.code === 'lop'))!;
    const lop = slip.deductions.find((d) => d.code === 'lop')!;
    lop.amount = 1000;
    lop.dates = ['2026-09-09', '2026-09-10', '2026-09-11'];
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    const { reply } = await ask(ctx, PRIYA);
    expect(reply.match(/Loss of Pay \$333\.33/g)).toHaveLength(2);
    expect(reply).toContain('Loss of Pay $333.34 for Fri 11 Sept');
  });

  it('pay figures from the reply are not replayed to the model on the next turn', async () => {
    const ctx = build();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const id = await newConversation(ctx.app, cookie);
    const send = (content: string) =>
      request(ctx.app)
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', cookie)
        .send({ content });
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    await send('Why was my salary reduced?');
    const calls = (ctx.chat.model as unknown as { calls: unknown[][] }).calls;
    const before = calls.length;
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    await send('And what about that day exactly?');
    const nextP1 = JSON.stringify(calls[before]);
    expect(nextP1).toContain('If you worked on Fri 11 Sept'); // the day stays for references
    expect(nextP1).not.toContain('400.00');
    expect(nextP1).not.toContain('4,333.33');
  });

  it('the trace keeps the model analysis query; the widened query is only used for search', async () => {
    const ctx = build();
    ctx.script([payrollIntent, rerankReply(LOP_CHUNKS), explanation(GOOD)]);
    await ask(ctx, PRIYA);
    const trace = ctx.conversations.traces.at(-1)!;
    expect((trace.analysis as { searchQuery: string }).searchQuery).toBe(
      'why was my salary reduced',
    );
    expect(trace.retrieval!.query).toContain('Loss of Pay deduction');
  });
});

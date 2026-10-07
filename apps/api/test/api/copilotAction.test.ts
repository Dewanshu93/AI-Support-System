// Copilot timesheet action (UC-05; Build Contract v2.0 flow 3, rules E.3–E.4):
// the model extracts, code resolves and checks, the employee confirms, and only
// then is anything saved — through the same rules as the timesheet form.
import { parseSseEvents } from '@sd/shared';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { seedId } from '../../src/modules/workspace/seed';
import {
  analysisReply,
  buildChatTestApp,
  type ChatTestContext,
  loginCookie,
  newConversation,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const RAVI = 'ravi.iyer@example.com';
const LOP_DAY = '2026-09-11';

const logIntent = analysisReply({
  intent: 'request_action',
  category: 'none',
  searchQuery: 'log timesheet hours',
  workspaceIntent: 'timesheet_log',
});
const extraction = (entries: object[]) => JSON.stringify({ entries });
const bank = (over: object = {}) => ({
  dateText: 'September 11',
  projectCode: 'BANK',
  hours: 8,
  ...over,
});

async function say(ctx: ChatTestContext, cookie: string, id: string, content: string) {
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content });
  return { res, events: res.status === 200 ? parseSseEvents(res.text) : [] };
}

const priyaEntries = (ctx: ChatTestContext, userId: ObjectId, date: string) =>
  ctx.workspace.data.timesheetEntries.filter((e) => e.userId.equals(userId) && e.date === date);

async function setup() {
  const ctx = buildChatTestApp();
  const cookie = await loginCookie(ctx.app, PRIYA);
  const priya = ctx.users.find((u) => u.email === PRIYA)!;
  const id = await newConversation(ctx.app, cookie);
  return { ctx, cookie, priya, id };
}

describe('log hours by chat (flow 3)', () => {
  it('proposes the exact entry, saves nothing, and blocks new messages until confirmed', async () => {
    const { ctx, cookie, priya, id } = await setup();
    ctx.script([logIntent, extraction([bank()])]);
    const { res, events } = await say(ctx, cookie, id, 'Log 8 hours for Banking on September 11');
    expect(res.status).toBe(200);

    const draft = events.find((e) => e.type === 'action_draft');
    expect(draft?.data).toMatchObject({
      action: {
        kind: 'timesheet_log',
        entries: [
          {
            date: LOP_DAY,
            projectId: seedId('project:BANK').toHexString(),
            projectName: 'Banking Module',
            hours: 8,
            previousHours: 0,
            dayTotalAfter: 8,
            late: true,
          },
        ],
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      data: { decision: 'ANSWER', reasonCode: 'TIMESHEET_ACTION_PROPOSED' },
    });
    // Nothing saved before confirmation (rule E.4).
    expect(priyaEntries(ctx, priya._id, LOP_DAY)).toHaveLength(0);

    const detail = await request(ctx.app).get(`/api/conversations/${id}`).set('Cookie', cookie);
    expect(detail.body.pendingAction.entries[0].date).toBe(LOP_DAY);
    expect((await say(ctx, cookie, id, 'hello')).res.status).toBe(409);
  });

  it('confirm saves through the timesheet rules, audits copilot + employee, and is idempotent', async () => {
    const { ctx, cookie, priya, id } = await setup();
    ctx.script([logIntent, extraction([bank()])]);
    await say(ctx, cookie, id, 'Log 8 hours for Banking on September 11');

    const confirm = () =>
      request(ctx.app)
        .post(`/api/conversations/${id}/action/confirm`)
        .set('Cookie', cookie)
        .send({});
    const first = await confirm();
    expect(first.status).toBe(200);
    expect(first.body.result).toMatchObject({ status: 'applied', saved: 1 });
    expect(first.body.result.message).toContain('Saved to your timesheet: 8 h on Banking Module');

    const saved = priyaEntries(ctx, priya._id, LOP_DAY);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ hours: 8, source: 'copilot', late: true });
    expect(ctx.audit.filter((a) => a.action === 'timesheet.save')).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ triggeredBy: 'copilot', approvedBy: 'employee' }),
      }),
    ]);

    // Confirming again returns the same result; nothing is saved or audited twice.
    const again = await confirm();
    expect(again.status).toBe(200);
    expect(again.body.result).toEqual(first.body.result);
    expect(priyaEntries(ctx, priya._id, LOP_DAY)).toHaveLength(1);
    expect(ctx.audit.filter((a) => a.action === 'timesheet.save')).toHaveLength(1);

    // The outcome is in the conversation, and chatting continues.
    const detail = await request(ctx.app).get(`/api/conversations/${id}`).set('Cookie', cookie);
    expect(detail.body.pendingAction).toBeUndefined();
    expect(detail.body.messages.at(-1)).toMatchObject({ role: 'system_event' });
  });

  it('cancel saves nothing and reopens the chat', async () => {
    const { ctx, cookie, priya, id } = await setup();
    ctx.script([logIntent, extraction([bank()])]);
    await say(ctx, cookie, id, 'Log 8 hours for Banking on September 11');
    const res = await request(ctx.app)
      .post(`/api/conversations/${id}/action/cancel`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(priyaEntries(ctx, priya._id, LOP_DAY)).toHaveLength(0);
    const confirm = await request(ctx.app)
      .post(`/api/conversations/${id}/action/confirm`)
      .set('Cookie', cookie)
      .send({});
    expect(confirm.status).toBe(404);
  });

  it('another employee cannot confirm the proposal', async () => {
    const { ctx, cookie, priya, id } = await setup();
    ctx.script([logIntent, extraction([bank()])]);
    await say(ctx, cookie, id, 'Log 8 hours for Banking on September 11');
    const ravi = await loginCookie(ctx.app, RAVI);
    const res = await request(ctx.app)
      .post(`/api/conversations/${id}/action/confirm`)
      .set('Cookie', ravi)
      .send({});
    expect(res.status).toBe(404);
    expect(priyaEntries(ctx, priya._id, LOP_DAY)).toHaveLength(0);
  });

  it('if the timesheet changed since the proposal, confirm saves nothing and says why', async () => {
    const { ctx, cookie, priya, id } = await setup();
    ctx.script([logIntent, extraction([bank()])]);
    await say(ctx, cookie, id, 'Log 8 hours for Banking on September 11');
    // Meanwhile 6 h were logged on another project that day (form or another tab).
    await ctx.workspace.upsertTimesheetEntry({
      userId: priya._id,
      date: LOP_DAY,
      projectId: seedId('project:API'),
      hours: 6,
      note: null,
      source: 'form',
      late: true,
      now: new Date(),
    });
    const res = await request(ctx.app)
      .post(`/api/conversations/${id}/action/confirm`)
      .set('Cookie', cookie)
      .send({});
    expect(res.body.result).toMatchObject({ status: 'failed', saved: 0 });
    expect(res.body.result.message).toContain('maximum 12');
    expect(priyaEntries(ctx, priya._id, LOP_DAY).map((e) => e.hours)).toEqual([6]);
    expect(ctx.audit.some((a) => a.action === 'timesheet.save')).toBe(false);
  });
});

describe('what code decides before proposing', () => {
  it('asks for a missing project, listing only the employee’s projects; no proposal', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([logIntent, extraction([bank({ projectCode: 'unknown' })])]);
    const { events } = await say(ctx, cookie, id, 'Log 8 hours on September 11');
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => (e.data as { text: string }).text)
      .join('');
    expect(text).toContain('Which project?');
    expect(text).toContain('Banking Module');
    expect(text).not.toContain('Brand Refresh'); // not one of Priya's projects
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'TIMESHEET_DETAILS_MISSING' } });
    // Not paused: the employee can answer.
    ctx.script([logIntent, extraction([bank()])]);
    expect((await say(ctx, cookie, id, 'Banking')).res.status).toBe(200);
  });

  it('applies the timesheet rules: a future day is refused, not proposed', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([logIntent, extraction([bank({ dateText: '9 October' })])]);
    const { events } = await say(ctx, cookie, id, 'Log 8 hours for Banking on 9 October');
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'TIMESHEET_RULES' } });
  });

  it('a date code cannot read is quoted back, not guessed', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([logIntent, extraction([bank({ dateText: 'the 11th' })])]);
    const { events } = await say(ctx, cookie, id, 'Log 8 hours for Banking on the 11th');
    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => (e.data as { text: string }).text)
      .join('');
    expect(text).toContain('"the 11th"');
  });

  it('a project outside the employee’s list is invalid output → retry → safe fallback', async () => {
    const { ctx, cookie, id } = await setup();
    const brand = extraction([bank({ projectCode: 'BRAND' })]);
    ctx.script([logIntent, brand, brand]);
    const { events } = await say(ctx, cookie, id, 'Log 8 hours for Brand Refresh yesterday');
    expect(events.some((e) => e.type === 'action_draft')).toBe(false);
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'TIMESHEET_EXTRACTION_FAILED' } });
  });

  it('several days in one request become one proposal with every entry', async () => {
    const { ctx, cookie, id } = await setup();
    ctx.script([
      logIntent,
      extraction([bank({ dateText: 'yesterday' }), bank({ dateText: 'Monday', hours: 2 })]),
    ]);
    const { events } = await say(
      ctx,
      cookie,
      id,
      'Log 8 hours yesterday and 2 on Monday for Banking',
    );
    const draft = events.find((e) => e.type === 'action_draft')!.data as {
      action: { entries: { date: string; hours: number; previousHours: number }[] };
    };
    expect(draft.action.entries.map((e) => [e.date, e.hours])).toEqual([
      ['2026-10-06', 8],
      ['2026-10-05', 2],
    ]);
    // Monday already had Banking hours from the seed: the card shows what is replaced.
    expect(draft.action.entries[1]!.previousHours).toBeGreaterThan(0);
  });
});

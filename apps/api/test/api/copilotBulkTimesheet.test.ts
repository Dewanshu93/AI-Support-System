// Bulk timesheet requests (UC-13, amendment A-1): P-10 v2 says "fill my missing
// days" or "copy last week"; code picks the days and hours, the timesheet rules
// check them, and the employee confirms one card with every entry.
import { parseSseEvents } from '@sd/shared';
import request from 'supertest';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import { loadConfig } from '../../src/config';
import { seedId } from '../../src/modules/workspace/seed';
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
const RAVI = 'ravi.iyer@example.com';
const BANK = seedId('project:BANK').toHexString();

const logIntent = analysisReply({
  intent: 'request_action',
  category: 'none',
  searchQuery: 'log timesheet hours',
  workspaceIntent: 'timesheet_log',
});
const bulk = (b: object) => JSON.stringify({ entries: [], bulk: b });

async function ask(email: string, content: string, extraction: string) {
  const ctx = buildChatTestApp();
  const cookie = await loginCookie(ctx.app, email);
  const user = ctx.users.find((u) => u.email === email)!;
  const id = await newConversation(ctx.app, cookie);
  ctx.script([logIntent, extraction]);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content });
  expect(res.status).toBe(200);
  const events = parseSseEvents(res.text);
  const draft = events.find((e) => e.type === 'action_draft')?.data as
    { action: { entries: { date: string; projectId: string; hours: number }[] } } | undefined;
  return { ctx, cookie, user, id, events, draft };
}

const lastReply = (ctx: ChatTestContext) =>
  ctx.conversations.messages.filter((m) => m.role === 'assistant').at(-1)!.content;

describe('P-10 v2 prompt', () => {
  it('renders with the v1 variables and describes both bulk kinds', async () => {
    const config = loadConfig(VALID_ENV);
    const v2 = loadPromptRegistry({ ...config.prompts.active, timesheet_extract: 2 });
    const { prompt, messages } = await v2.render('timesheet_extract', {
      today: 'Wednesday 2026-10-07',
      projects: '- BANK: Banking Module',
      history: '(none)',
      message: 'Copy last week',
    });
    expect(prompt.version).toBe(2);
    const system = String(messages[0]!.content);
    expect(system).toContain('"missing_days"');
    expect(system).toContain('"copy_last_week"');
  });
});

describe('fill my missing days', () => {
  it('fills each gap of this week and last up to the required hours, one card', async () => {
    // CHAT_TODAY Wed 7 Oct: Priya's only gap is Tue 6 Oct (badged in, no hours).
    const { draft, events } = await ask(
      PRIYA,
      'Fill my missing days with Banking',
      bulk({ kind: 'missing_days', projectCode: 'BANK', hours: null }),
    );
    expect(draft?.action.entries.map((e) => [e.date, e.projectId, e.hours])).toEqual([
      ['2026-10-06', BANK, 8],
    ]);
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'TIMESHEET_ACTION_PROPOSED' } });
  });

  it('completes a partial day with what is left', async () => {
    // Tom logged 4 h on Wed 30 Sep.
    const { draft } = await ask(
      TOM,
      'Fill in the hours I missed on Brand Refresh',
      bulk({ kind: 'missing_days', projectCode: 'BRAND', hours: null }),
    );
    expect(draft?.action.entries.map((e) => [e.date, e.hours])).toEqual([['2026-09-30', 4]]);
  });

  it('asks for the project when none is named; nothing proposed', async () => {
    const { draft, ctx } = await ask(
      PRIYA,
      'Fill my missing days',
      bulk({ kind: 'missing_days', projectCode: 'unknown', hours: null }),
    );
    expect(draft).toBeUndefined();
    expect(lastReply(ctx)).toContain('Which project?');
  });

  it('says so when there is nothing to fill', async () => {
    const { draft, ctx, events } = await ask(
      RAVI,
      'Fill my missing days with Data Platform',
      bulk({ kind: 'missing_days', projectCode: 'DATA', hours: null }),
    );
    expect(draft).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ data: { reasonCode: 'TIMESHEET_BULK_NOTHING' } });
    expect(lastReply(ctx)).toMatch(/^Nothing to fill/);
  });
});

describe('copy last week', () => {
  it("copies last week's projects into this week's empty days up to today, then saves all on confirm", async () => {
    const { draft, ctx, cookie, id, user } = await ask(
      PRIYA,
      'Copy last week',
      bulk({ kind: 'copy_last_week' }),
    );
    const entries = draft!.action.entries;
    // Tue 6 Oct (empty) and today Wed 7 Oct; Mon 5 Oct already has its hours.
    expect([...new Set(entries.map((e) => e.date))]).toEqual(['2026-10-06', '2026-10-07']);
    const lastWeek = ctx.workspace.data.timesheetEntries.filter(
      (e) => e.userId.equals(user._id) && (e.date === '2026-09-29' || e.date === '2026-09-30'),
    );
    expect(entries.reduce((s, e) => s + e.hours, 0)).toBe(
      lastWeek.reduce((s, e) => s + e.hours, 0),
    );

    const confirm = await request(ctx.app)
      .post(`/api/conversations/${id}/action/confirm`)
      .set('Cookie', cookie)
      .send({});
    expect(confirm.body.result).toMatchObject({ status: 'applied', saved: entries.length });
    const saved = ctx.workspace.data.timesheetEntries.filter(
      (e) => e.userId.equals(user._id) && e.date >= '2026-10-06' && e.source === 'copilot',
    );
    expect(saved).toHaveLength(entries.length);
    expect(ctx.audit.filter((a) => a.action === 'timesheet.save')).toHaveLength(1);
  });

  it('v1 output without the bulk field still works as before', async () => {
    const { draft } = await ask(
      PRIYA,
      'Log 8 hours for Banking on 6 October',
      JSON.stringify({ entries: [{ dateText: '6 October', projectCode: 'BANK', hours: 8 }] }),
    );
    expect(draft?.action.entries).toHaveLength(1);
  });
});

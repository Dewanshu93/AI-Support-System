// Copilot records answers for leave and "what should I do today?" (UC-11b, UC-12;
// P-1 v3 intents). P-1 is a fake model here; everything after it is code reading
// the employee's own records, with no further model call.
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

const intent = (workspaceIntent: string) =>
  analysisReply({
    intent: 'question',
    category: 'none',
    searchQuery: 'my leave balance',
    workspaceIntent,
  });

async function ask(ctx: ChatTestContext, email: string, content: string) {
  const cookie = await loginCookie(ctx.app, email);
  const id = await newConversation(ctx.app, cookie);
  const res = await request(ctx.app)
    .post(`/api/conversations/${id}/messages`)
    .set('Cookie', cookie)
    .send({ content });
  expect(res.status).toBe(200);
  const done = parseSseEvents(res.text).at(-1);
  const reply = ctx.conversations.messages.filter((m) => m.role === 'assistant').at(-1)!;
  return { done, text: reply.content };
}

describe('leave balance by chat (UC-11b)', () => {
  it("answers from Priya's leave records, with upcoming leave, and makes no other model call", async () => {
    const ctx = buildChatTestApp();
    ctx.script([intent('leave_balance')]);
    const { done, text } = await ask(ctx, PRIYA, 'How many casual leaves do I have?');
    expect(done).toMatchObject({
      type: 'done',
      data: { decision: 'ANSWER', reasonCode: 'RECORDS_LEAVE' },
    });
    expect(text).toBe(
      [
        'Your leave for 2026:',
        '• Annual leave: 12 days left of 15 (3 used)',
        '• Sick leave: 10 days left of 10',
        '• Casual leave: 5 days left of 6 (0 used, 1 waiting for approval)',
        'Coming up:',
        '• Casual leave, Wed 14 Oct (1 day): waiting for approval',
        'You can request leave on the Leave page.',
      ].join('\n'),
    );
    expect(ctx.chat.model.calls).toHaveLength(1); // P-1 only
  });

  it('tells a contractor that leave is agreed with the agency', async () => {
    const ctx = buildChatTestApp();
    ctx.script([intent('leave_balance')]);
    const { text } = await ask(ctx, TOM, 'How much leave do I have left?');
    expect(text).toContain('As a contractor you do not have company leave balances');
  });

  it('does not book leave from the chat yet, and writes nothing', async () => {
    const ctx = buildChatTestApp();
    const before = ctx.workspace.data.leaveRequests.length;
    ctx.script([intent('leave_apply')]);
    const { done, text } = await ask(ctx, PRIYA, 'Apply casual leave for Oct 26');
    expect(done).toMatchObject({ data: { reasonCode: 'LEAVE_ACTION_PENDING' } });
    expect(text).toContain('Open Leave in the menu');
    expect(ctx.workspace.data.leaveRequests).toHaveLength(before);
  });
});

describe('"What should I do today?" (UC-12)', () => {
  it('lists the dashboard attention items in words', async () => {
    const ctx = buildChatTestApp();
    ctx.script([intent('daily_briefing')]);
    const { done, text } = await ask(ctx, PRIYA, 'What should I do today?');
    expect(done).toMatchObject({ data: { decision: 'ANSWER', reasonCode: 'RECORDS_BRIEFING' } });
    expect(text).toBe(
      [
        '2 things need your attention:',
        '• Log your hours for Tue 6 Oct: nothing logged.',
        '• You have 12 days of annual leave left; only 5 days carry over after Thu 31 Dec.',
        'The same list is on your dashboard.',
      ].join('\n'),
    );
  });
});

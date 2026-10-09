// Chat API (W2-08): SSE turns through the real runtime graph on fake models.
// Asserts the documented event order and everything persisted per turn.
import { type ChatEvent, parseSseEvents } from '@sd/shared';
import request from 'supertest';
import type { FakeReply } from '../../src/ai/llm/fakeModels';
import { TurnTraceSchema } from '../../src/db/schemas';
import {
  analysisReply,
  answerReply,
  buildChatTestApp,
  config,
  LEAVE_CHUNKS,
  loginCookie,
  newConversation,
  rerankReply,
  retrievalOf,
} from '../helpers/chat';

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const AGENT = 'sam.patel@example.com';
const PROSE =
  'Full-time US employees get 15 days of paid vacation a year [S1]. Up to 5 unused days carry over until 31 March [S2].';

const types = (events: ChatEvent[]) => events.map((e) => e.type);
const send = (app: Parameters<typeof request>[0], cookie: string, id: string, content: string) =>
  request(app).post(`/api/conversations/${id}/messages`).set('Cookie', cookie).send({ content });

async function setup(
  replies: FakeReply[] = [analysisReply(), rerankReply(LEAVE_CHUNKS), answerReply(PROSE)],
) {
  const ctx = buildChatTestApp({ replies });
  const cookie = await loginCookie(ctx.app, PRIYA);
  const id = await newConversation(ctx.app, cookie);
  return { ...ctx, cookie, id };
}

describe('POST /api/conversations/:id/messages — answer turn', () => {
  it('streams events in the documented order and persists every record', async () => {
    const { app, cookie, id, conversations, chat } = await setup();
    const res = await send(
      app,
      cookie,
      id,
      'How many vacation days do I get? Email me at priya@example.com',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    const events = parseSseEvents(res.text);

    // turn_started → status… → token… → citations → done
    const order = types(events).filter((t, i, all) => t !== 'token' || all[i - 1] !== 'token');
    expect(order).toEqual([
      'turn_started',
      'status',
      'status',
      'status',
      'token',
      'citations',
      'done',
    ]);
    expect(events.filter((e) => e.type === 'status').map((e) => e.data)).toEqual([
      { stage: 'analyzing' },
      { stage: 'searching' },
      { stage: 'writing' },
    ]);
    const streamed = events.flatMap((e) => (e.type === 'token' ? [e.data.text] : [])).join('');
    expect(streamed).toBe(PROSE); // the JSON trailer never reaches the client
    expect(events.filter((e) => e.type === 'token').length).toBeGreaterThan(3);
    const started = events[0] as Extract<ChatEvent, { type: 'turn_started' }>;
    const done = events.at(-1) as Extract<ChatEvent, { type: 'done' }>;
    expect(done.data).toMatchObject({
      decision: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      assistantMessageId: started.data.assistantMessageId,
    });
    const cited = events.find((e) => e.type === 'citations') as Extract<
      ChatEvent,
      { type: 'citations' }
    >;
    expect(cited.data.items.map((c) => c.chunkId)).toEqual(
      LEAVE_CHUNKS.map((c) => c._id.toHexString()),
    );
    expect(chat.model.calls).toHaveLength(3); // P-1, P-2, P-3

    // Persisted: user message, assistant message, turn trace, conversation update.
    const [userMsg, reply] = conversations.messages;
    expect(conversations.messages).toHaveLength(2);
    expect(userMsg).toMatchObject({ role: 'user', status: 'complete' });
    expect(userMsg!._id.toHexString()).toBe(started.data.userMessageId);
    expect(reply).toMatchObject({
      role: 'assistant',
      content: PROSE,
      decision: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      status: 'complete',
    });
    expect(reply!._id.toHexString()).toBe(started.data.assistantMessageId);
    expect(reply!.citations.map((c) => c.marker)).toEqual(['S1', 'S2']);

    const [trace] = conversations.traces;
    expect(conversations.traces).toHaveLength(1);
    expect(TurnTraceSchema.safeParse(trace).success).toBe(true);
    expect(trace!.messageId.equals(reply!._id)).toBe(true);
    expect(trace!.redactedInput).toBe('How many vacation days do I get? Email me at [EMAIL]');
    expect(trace!.profileSnapshot).toEqual({
      country: 'US',
      employmentType: 'full_time',
      accessLevel: 'standard',
      department: expect.any(String),
    });
    expect(trace!.llmCalls.map((c) => [c.node, c.promptName, c.promptVersion])).toEqual([
      ['analyzeTurn', 'turn_analysis', 2],
      ['rerankAssess', 'rerank_assess', 1],
      ['answer', 'grounded_answer', 1],
    ]);
    expect(trace!.decision).toMatchObject({
      value: 'ANSWER',
      thresholds: config.thresholds.decision,
    });
    expect(trace!.retrieval?.coverage).toBe('full');
    expect(trace!.output).toMatchObject({ citationsProposed: ['S1', 'S2'], withdrawn: false });
    expect(trace!.ttftMs).toEqual(expect.any(Number));
    expect(Object.keys(trace!.stepLatencyMs)).toEqual(
      expect.arrayContaining(['loadContext', 'precheck', 'analyzeTurn', 'retrieve', 'answer']),
    );

    const conversation = conversations.conversations[0]!;
    expect(conversation).toMatchObject({ turnCount: 1, lastDecision: 'ANSWER', status: 'open' });
    // Title from the first message, cut to 60 characters.
    expect(conversation.title).toBe('How many vacation days do I get? Email me at priya@exampl…');
  });

  it('a second turn sees the first one in the history', async () => {
    const { app, cookie, id, chat, script } = await setup();
    await send(app, cookie, id, 'How many vacation days do I get?');
    script([analysisReply(), rerankReply(LEAVE_CHUNKS), answerReply(PROSE)]);
    await send(app, cookie, id, 'And can I carry them over?');
    const p1Second = String(chat.model.calls[3]![1]!.content);
    expect(p1Second).toContain('user: How many vacation days do I get?');
    expect(p1Second).toContain('assistant: Full-time US employees get 15 days');
  });
});

describe('other turn outcomes', () => {
  it('sensitive keyword: handoff event, no tokens, no LLM call', async () => {
    const { app, cookie, id, conversations, chat } = await setup([]);
    const events = parseSseEvents(
      (await send(app, cookie, id, 'My manager keeps harassing me')).text,
    );
    expect(types(events)).toEqual(['turn_started', 'status', 'handoff', 'done']);
    const handoff = events[2] as Extract<ChatEvent, { type: 'handoff' }>;
    expect(handoff.data).toMatchObject({ kind: 'sensitive', offerPrivateContact: true });
    expect(handoff.data.text).toContain('Would you like HR to contact you privately?');
    expect(chat.model.calls).toHaveLength(0);
    expect(conversations.messages[1]).toMatchObject({ decision: 'SENSITIVE_HANDOFF' });
    expect(conversations.traces[0]!.precheck.matchedRules).toEqual(['harassment']);
  });

  it('out of scope: handoff event; one LLM call (P-1)', async () => {
    const { app, cookie, id, chat } = await setup([
      analysisReply({ intent: 'out_of_scope', domain: 'unknown', category: 'none' }),
    ]);
    const events = parseSseEvents(
      (await send(app, cookie, id, 'Best pizza near the office?')).text,
    );
    expect(types(events)).toEqual(['turn_started', 'status', 'handoff', 'done']);
    expect(chat.model.calls).toHaveLength(1);
  });

  it('clarify: the question arrives as one token', async () => {
    const { app, cookie, id } = await setup([
      analysisReply({ ambiguity: 'high', ambiguityReason: 'no system named' }),
      rerankReply(LEAVE_CHUNKS),
      JSON.stringify({ question: 'Which system do you mean?', fieldsAsked: [] }),
    ]);
    const events = parseSseEvents((await send(app, cookie, id, 'it is broken')).text);
    expect(types(events)).toEqual(['turn_started', 'status', 'status', 'status', 'token', 'done']);
    expect(events[4]).toEqual({ type: 'token', data: { text: 'Which system do you mean?' } });
    expect(events.at(-1)).toMatchObject({ data: { decision: 'CLARIFY' } });
  });

  it('withdrawn: tokens, then withdrawn with the replacement, stored as withdrawn', async () => {
    const { app, cookie, id, conversations } = await setup([
      analysisReply(),
      rerankReply(LEAVE_CHUNKS),
      answerReply('You get 15 days of vacation.'),
    ]);
    const events = parseSseEvents((await send(app, cookie, id, 'How much vacation?')).text);
    expect(
      types(events)
        .filter((t) => t !== 'token')
        .slice(-2),
    ).toEqual(['withdrawn', 'done']);
    const withdrawn = events.find((e) => e.type === 'withdrawn') as Extract<
      ChatEvent,
      { type: 'withdrawn' }
    >;
    expect(withdrawn.data.reason).toBe('NO_VALID_CITATIONS');
    expect(withdrawn.data.replacementText).toContain('raise a ticket with the HR team');
    expect(events.at(-1)).toMatchObject({
      data: { decision: 'ESCALATE', reasonCode: 'CITATION_INVALID' },
    });
    expect(conversations.messages[1]).toMatchObject({ status: 'withdrawn', decision: 'ESCALATE' });
  });

  it('LLM failure mid-answer: error event; the reply is stored with status error', async () => {
    const { app, cookie, id, conversations } = await setup([
      analysisReply(),
      rerankReply(LEAVE_CHUNKS),
      { text: 'Full-time US employees get fifteen days', streamError: new Error('socket hang up') },
    ]);
    const events = parseSseEvents((await send(app, cookie, id, 'How much vacation?')).text);
    expect(events.at(-1)).toEqual({
      type: 'error',
      data: {
        code: 'LLM_UNAVAILABLE',
        message: config.templates.templates.generic_error,
        retryable: true,
      },
    });
    expect(types(events)).not.toContain('done');
    expect(conversations.messages[1]).toMatchObject({ role: 'assistant', status: 'error' });
  });
});

describe('POST /api/conversations/:id/escalate', () => {
  it('forces escalation to a ticket draft; the conversation then waits for confirmation (409)', async () => {
    const { app, cookie, id, conversations, chat } = await setup([
      analysisReply(),
      JSON.stringify({
        category: 'leave',
        urgency: 'low',
        urgencyReason: 'question about leave',
        impactScope: 'me',
        summary: 'Question about annual leave',
        description: 'The employee wants to talk to HR about their annual leave.',
        alreadyTried: [],
        errorMessages: [],
        fields: { leave_type: 'annual', question: 'how many days remain' },
        requiredMissing: [],
      }),
    ]);
    const res = await request(app)
      .post(`/api/conversations/${id}/escalate`)
      .set('Cookie', cookie)
      .send({});
    const events = parseSseEvents(res.text);
    expect(types(events)).toEqual([
      'turn_started',
      'status',
      'status',
      'token',
      'ticket_draft',
      'done',
    ]);
    expect(events[2]).toEqual({ type: 'status', data: { stage: 'preparing_ticket' } });
    expect(events.at(-1)).toMatchObject({
      data: { decision: 'ESCALATE', reasonCode: 'USER_REQUESTED' },
    });
    expect(conversations.messages[0]!.content).toBe('Please connect me with a person.');
    expect(chat.model.calls).toHaveLength(2); // P-1, P-5
    const draftEvent = events.find((e) => e.type === 'ticket_draft') as Extract<
      ChatEvent,
      { type: 'ticket_draft' }
    >;
    expect(draftEvent.data.draft).toMatchObject({
      category: 'leave',
      queue: { id: 'hr_general' },
      fields: { leave_type: 'annual' },
    });

    const blocked = await send(app, cookie, id, 'hello?');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CONFLICT');
    expect(conversations.messages).toHaveLength(2); // nothing stored for the refused turn

    const detail = await request(app).get(`/api/conversations/${id}`).set('Cookie', cookie);
    expect(detail.body.pendingDraft).toMatchObject({ summary: 'Question about annual leave' });
  });
});

describe('one running turn per conversation', () => {
  it('a second message while a turn is running gets 409', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ctx = buildChatTestApp({
      replies: [analysisReply(), rerankReply(LEAVE_CHUNKS), answerReply(PROSE)],
      retrieve: async () => {
        await gate;
        return retrievalOf(LEAVE_CHUNKS);
      },
    });
    const cookie = await loginCookie(ctx.app, PRIYA);
    const id = await newConversation(ctx.app, cookie);
    const first = send(ctx.app, cookie, id, 'first');
    first.then(
      () => undefined,
      () => undefined,
    );
    await new Promise((r) => setTimeout(r, 200));
    const second = await send(ctx.app, cookie, id, 'second');
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    // After the turn ends the lock is released.
    ctx.script([analysisReply(), rerankReply(LEAVE_CHUNKS), answerReply(PROSE)]);
    expect((await send(ctx.app, cookie, id, 'third')).status).toBe(200);
  });
});

describe('chat endpoint access', () => {
  it('validation, authentication, role and ownership', async () => {
    const { app, cookie, id } = await setup([]);
    expect((await send(app, cookie, id, '   ')).status).toBe(400);
    expect((await send(app, cookie, id, 'x'.repeat(2001))).status).toBe(400);
    expect(
      (await request(app).post(`/api/conversations/${id}/messages`).send({ content: 'hi' })).status,
    ).toBe(401);
    const agent = await loginCookie(app, AGENT);
    expect((await send(app, agent, id, 'hi')).status).toBe(403);
    // Another employee's conversation does not exist for them.
    const tom = await loginCookie(app, TOM);
    const notTheirs = await send(app, tom, id, 'hi');
    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body.error.code).toBe('NOT_FOUND');
    expect((await send(app, cookie, '0123456789abcdef01234567', 'hi')).status).toBe(404);
    expect((await send(app, cookie, 'not-an-id', 'hi')).status).toBe(400);
  });
});

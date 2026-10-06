// Conversation, resolution, feedback and source endpoints (W2-08). In-memory
// storage; messages are inserted directly so these tests need no graph run.
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { ConversationDoc, DocumentDoc, MessageDoc } from '../../src/db/schemas';
import { buildTestApp, loginCookie, seededUsers, userByEmail } from '../helpers/app';
import { chunk } from '../helpers/chat';
import { memoryConversationsRepository, memorySourcesReader } from '../helpers/conversations';

const PRIYA = 'priya.shah@example.com'; // US full-time employee
const TOM = 'tom.clarke@example.com'; // UK contractor
const AGENT = 'sam.patel@example.com';

function setup() {
  const users = seededUsers();
  const conversations = memoryConversationsRepository();
  const ctx = buildTestApp({ users, conversations });
  return { ...ctx, users, conversations };
}

const message = (conversationId: ObjectId, over: Partial<MessageDoc> = {}): MessageDoc => ({
  _id: new ObjectId(),
  conversationId,
  role: 'assistant',
  content: 'You get 15 days [S1].',
  decision: 'ANSWER',
  reasonCode: 'EVIDENCE_STRONG',
  citations: [],
  uncovered: [],
  ticketDraft: null,
  status: 'complete',
  isEval: false,
  createdAt: new Date(),
  ...over,
});

async function created(app: Parameters<typeof request>[0], cookie: string): Promise<string> {
  const res = await request(app).post('/api/conversations').set('Cookie', cookie).send({});
  expect(res.status).toBe(201);
  return res.body.conversation.id;
}

describe('POST/GET /api/conversations', () => {
  it('creates a conversation owned by the caller', async () => {
    const { app } = setup();
    const cookie = await loginCookie(app, PRIYA);
    const res = await request(app).post('/api/conversations').set('Cookie', cookie).send({});
    expect(res.status).toBe(201);
    expect(res.body.conversation).toMatchObject({
      title: '',
      status: 'open',
      turnCount: 0,
      lastDecision: null,
      restricted: false,
    });
    expect(
      (await request(app).post('/api/conversations').set('Cookie', cookie).send({ title: 'x' }))
        .status,
    ).toBe(400);
  });

  it('lists only the caller’s conversations, newest first, with cursor pagination and status filter', async () => {
    const { app, conversations, users } = setup();
    const priya = await loginCookie(app, PRIYA);
    const tom = await loginCookie(app, TOM);
    const ids = [await created(app, priya), await created(app, priya), await created(app, priya)];
    await created(app, tom);
    const base = Date.parse('2026-10-06T09:00:00Z');
    conversations.conversations.forEach((c, i) => (c.updatedAt = new Date(base + i * 60_000)));
    conversations.conversations[0]!.status = 'resolved';

    const page1 = await request(app).get('/api/conversations?limit=2').set('Cookie', priya);
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((c: { id: string }) => c.id)).toEqual([ids[2], ids[1]]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await request(app)
      .get(`/api/conversations?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Cookie', priya);
    expect(page2.body.items.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
    expect(page2.body.nextCursor).toBeNull();

    const resolved = await request(app)
      .get('/api/conversations?status=resolved')
      .set('Cookie', priya);
    expect(resolved.body.items.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
    expect(
      (await request(app).get('/api/conversations?limit=500').set('Cookie', priya)).status,
    ).toBe(400);
    expect(userByEmail(users, PRIYA)).toBeDefined();
  });

  it('GET /:id returns the conversation and its messages to the owner only', async () => {
    const { app, conversations } = setup();
    const priya = await loginCookie(app, PRIYA);
    const id = await created(app, priya);
    await conversations.insertMessage(
      message(new ObjectId(id), { role: 'user', content: 'hi', decision: null, reasonCode: null }),
    );
    await conversations.insertMessage(message(new ObjectId(id)));
    const res = await request(app).get(`/api/conversations/${id}`).set('Cookie', priya);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(res.body.pendingDraft).toBeUndefined();

    const tom = await loginCookie(app, TOM);
    expect((await request(app).get(`/api/conversations/${id}`).set('Cookie', tom)).status).toBe(
      404,
    );
    const agent = await loginCookie(app, AGENT);
    expect((await request(app).get(`/api/conversations/${id}`).set('Cookie', agent)).status).toBe(
      403,
    );
    expect((await request(app).get(`/api/conversations/${id}`)).status).toBe(401);
    expect((await request(app).get('/api/conversations/nope').set('Cookie', priya)).status).toBe(
      400,
    );
  });
});

describe('POST /api/conversations/:id/resolution', () => {
  async function withAnswer() {
    const ctx = setup();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const id = await created(ctx.app, cookie);
    const answer = message(new ObjectId(id));
    await ctx.conversations.insertMessage(answer);
    return { ...ctx, cookie, id, answer };
  }

  it('resolved = true marks the conversation resolved', async () => {
    const { app, cookie, id, answer } = await withAnswer();
    const res = await request(app)
      .post(`/api/conversations/${id}/resolution`)
      .set('Cookie', cookie)
      .send({ messageId: answer._id.toHexString(), resolved: true });
    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({
      status: 'resolved',
      resolution: { confirmed: true, messageId: answer._id.toHexString() },
    });
  });

  it('resolved = false adds a system message offering escalation', async () => {
    const { app, cookie, id, answer, conversations } = await withAnswer();
    const res = await request(app)
      .post(`/api/conversations/${id}/resolution`)
      .set('Cookie', cookie)
      .send({ messageId: answer._id.toHexString(), resolved: false });
    expect(res.status).toBe(200);
    expect(res.body.conversation.status).toBe('open');
    const offer = conversations.messages.at(-1)!;
    expect(offer).toMatchObject({ role: 'system_event' });
    expect(offer.content).toContain('raise a ticket');
  });

  it('409 for a message that is not an answer; 404 for a message elsewhere or another owner', async () => {
    const { app, cookie, id, conversations } = await withAnswer();
    const clarify = message(new ObjectId(id), { decision: 'CLARIFY', reasonCode: 'AMBIGUOUS' });
    await conversations.insertMessage(clarify);
    const post = (cookieValue: string, conversationId: string, messageId: string) =>
      request(app)
        .post(`/api/conversations/${conversationId}/resolution`)
        .set('Cookie', cookieValue)
        .send({ messageId, resolved: true });
    expect((await post(cookie, id, clarify._id.toHexString())).status).toBe(409);
    const elsewhere = message(new ObjectId());
    await conversations.insertMessage(elsewhere);
    expect((await post(cookie, id, elsewhere._id.toHexString())).status).toBe(404);
    const tom = await loginCookie(app, TOM);
    expect((await post(tom, id, clarify._id.toHexString())).status).toBe(404);
  });
});

describe('POST /api/messages/:id/feedback', () => {
  it('rates an assistant message; a second rating replaces the first', async () => {
    const { app, conversations } = setup();
    const cookie = await loginCookie(app, PRIYA);
    const id = await created(app, cookie);
    const answer = message(new ObjectId(id));
    await conversations.insertMessage(answer);
    const url = `/api/messages/${answer._id.toHexString()}/feedback`;
    const first = await request(app)
      .post(url)
      .set('Cookie', cookie)
      .send({ rating: 'down', comment: 'too vague' });
    expect(first.status).toBe(200);
    expect(first.body.feedback).toMatchObject({ rating: 'down', comment: 'too vague' });
    const second = await request(app).post(url).set('Cookie', cookie).send({ rating: 'up' });
    expect(second.body.feedback.rating).toBe('up');
    expect(conversations.feedback).toHaveLength(1);
    expect(
      (await request(app).post(url).set('Cookie', cookie).send({ rating: 'meh' })).status,
    ).toBe(400);
  });

  it('409 for a user message; 404 for another user or an unknown message', async () => {
    const { app, conversations } = setup();
    const cookie = await loginCookie(app, PRIYA);
    const id = await created(app, cookie);
    const own = message(new ObjectId(id), { role: 'user', decision: null, reasonCode: null });
    const answer = message(new ObjectId(id));
    await conversations.insertMessage(own);
    await conversations.insertMessage(answer);
    const rate = (c: string, m: string) =>
      request(app).post(`/api/messages/${m}/feedback`).set('Cookie', c).send({ rating: 'up' });
    expect((await rate(cookie, own._id.toHexString())).status).toBe(409);
    const tom = await loginCookie(app, TOM);
    expect((await rate(tom, answer._id.toHexString())).status).toBe(404);
    expect((await rate(cookie, new ObjectId().toHexString())).status).toBe(404);
  });
});

describe('GET /api/sources/chunks/:chunkId', () => {
  const docId = new ObjectId();
  const document = {
    _id: docId,
    title: 'Annual Leave (US)',
    version: '3.0',
    effectiveDate: new Date('2026-01-01'),
    owner: 'HR Policy',
  } as unknown as DocumentDoc;
  const usOnly = { countries: ['US' as const], employmentTypes: ['full_time' as const] };
  const chunks = [0, 1, 2].map((ordinal) =>
    chunk('hr-annual-leave-us', `part ${ordinal}`, { documentId: docId, ordinal, ...usOnly }),
  );

  function app() {
    return buildTestApp({ sources: memorySourcesReader(chunks, [document]) }).app;
  }

  it('returns the chunk, document metadata and neighbours to an allowed employee', async () => {
    const a = app();
    const cookie = await loginCookie(a, PRIYA);
    const res = await request(a)
      .get(`/api/sources/chunks/${chunks[1]!._id.toHexString()}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      chunk: { id: chunks[1]!._id.toHexString(), text: 'part 1', sectionPath: ['Entitlement'] },
      document: {
        title: 'Annual Leave (US)',
        version: '3.0',
        effectiveDate: '2026-01-01T00:00:00.000Z',
        owner: 'HR Policy',
      },
      neighbours: [chunks[0]!._id.toHexString(), chunks[2]!._id.toHexString()],
    });
  });

  it('404 when the caller’s profile may not read it (no existence leak), or it does not exist', async () => {
    const a = app();
    const tom = await loginCookie(a, TOM); // UK contractor: US full-time policy is not theirs
    const denied = await request(a)
      .get(`/api/sources/chunks/${chunks[0]!._id.toHexString()}`)
      .set('Cookie', tom);
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('NOT_FOUND');
    const priya = await loginCookie(a, PRIYA);
    expect(
      (
        await request(a)
          .get(`/api/sources/chunks/${new ObjectId().toHexString()}`)
          .set('Cookie', priya)
      ).status,
    ).toBe(404);
    const agent = await loginCookie(a, AGENT);
    expect(
      (
        await request(a)
          .get(`/api/sources/chunks/${chunks[0]!._id.toHexString()}`)
          .set('Cookie', agent)
      ).status,
    ).toBe(403);
  });
});

// Keeps the ConversationDoc import meaningful for readers of the fixture shapes.
export type { ConversationDoc };

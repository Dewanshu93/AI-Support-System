// W3-06: POST /api/agent/tickets/:id/draft-reply (P-7). The model is injected
// (agentDraft); these tests check access, what the draft may rely on, the
// internal ai_draft_generated event, the audit entry, and that nothing is sent.
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { DraftReplyFn, DraftReplyInput } from '../../src/ai/nodes/draftReply';
import type { ChunkDoc, MessageDoc, TicketDoc } from '../../src/db/schemas';
import { buildTestApp, loginCookie, userByEmail } from '../helpers/app';
import { memoryConversationsRepository, memorySourcesReader } from '../helpers/conversations';
import type { MemoryTickets } from '../helpers/tickets';
import type { MemoryWorkspace } from '../helpers/workspace';

const BASE = '/api/agent/tickets';
const HANA = 'hana.kim@example.com'; // hr_general + hr_payroll + hr_case
const SAM = 'sam.patel@example.com'; // IT queues only
const ALEX = 'alex.morgan@example.com'; // admin
const PRIYA = 'priya.shah@example.com';

const LOP_DOC = new ObjectId();
const OTHER_DOC = new ObjectId();
const chunk = (documentId: ObjectId, text: string, section: string) =>
  ({ _id: new ObjectId(), documentId, sectionPath: [section], text }) as unknown as ChunkDoc;
const LOP_CHUNK = chunk(
  LOP_DOC,
  'Payroll will review your request within 3 working days.',
  'Reversing an LOP deduction',
);
const ATT_CHUNK = chunk(OTHER_DOC, 'Raise an attendance correction within 30 days.', 'Corrections');

const LLM_CALL = {
  node: 'draftReply',
  promptName: 'agent_draft_reply',
  promptVersion: 1,
  promptHash: 'abc123def456',
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  inputTokens: 900,
  outputTokens: 80,
  costUsd: 0.0003,
  latencyMs: 1200,
  retries: 0,
  error: null,
};

async function setup(draft?: DraftReplyFn) {
  const conversations = memoryConversationsRepository();
  const ctx = buildTestApp({
    conversations,
    sources: memorySourcesReader([LOP_CHUNK, ATT_CHUNK]),
    agentDraft: draft,
  });
  const priya = userByEmail(ctx.users, PRIYA);
  const ticket = (over: Partial<TicketDoc> = {}): TicketDoc => ({
    _id: new ObjectId(),
    humanId: 'HR-0101',
    conversationId: new ObjectId(),
    requesterId: priya._id,
    requesterSnapshot: {
      name: priya.name,
      email: priya.email,
      country: priya.country,
      employmentType: priya.employmentType,
      department: priya.department,
    },
    domain: 'HR',
    category: 'payroll',
    subcategory: 'payslip',
    queue: 'hr_payroll',
    priority: 'medium',
    aiUrgency: 'medium',
    priorityFloorApplied: null,
    status: 'new',
    summary: 'Loss of Pay deduction review',
    agentBrief: 'Priya logged 11 Sept late and asks for an LOP review.',
    agentAssist: null,
    fields: { pay_period: 'Wed 16 Sept – Wed 30 Sept' },
    aiFilledFields: [],
    articlesShown: [],
    restricted: false,
    duplicateOf: null,
    isEval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    ...over,
  });
  const payroll = ticket();
  const confidential = ticket({
    humanId: 'HR-0102',
    category: 'employee_relations',
    subcategory: null,
    queue: 'hr_case',
    restricted: true,
    fields: {},
  });
  for (const t of [payroll, confidential]) await ctx.deps.tickets.insert(t);
  // The employee was shown two cited passages in the ticket's conversation.
  const message = (citations: MessageDoc['citations']): MessageDoc => ({
    _id: new ObjectId(),
    conversationId: payroll.conversationId,
    role: 'assistant',
    content: 'answer',
    decision: 'ANSWER',
    reasonCode: 'PAYROLL_EXPLAINED',
    citations,
    uncovered: [],
    ticketDraft: null,
    status: 'complete',
    isEval: false,
    createdAt: new Date(),
  });
  const cite = (c: ChunkDoc, marker: string, docTitle: string) => ({
    marker,
    chunkId: c._id,
    documentId: c.documentId,
    docTitle,
    sectionPath: c.sectionPath,
    effectiveDate: new Date('2026-01-01'),
  });
  await conversations.insertMessage(
    message([cite(LOP_CHUNK, 'S1', 'Loss of Pay (LOP)'), cite(ATT_CHUNK, 'S2', 'Attendance')]),
  );
  const [hana, sam, alex, priyaCookie] = await Promise.all([
    loginCookie(ctx.app, HANA),
    loginCookie(ctx.app, SAM),
    loginCookie(ctx.app, ALEX),
    loginCookie(ctx.app, PRIYA),
  ]);
  return { ctx, payroll, confidential, cookies: { hana, sam, alex, priya: priyaCookie } };
}

const draftOf = (body: string, citedDocumentIds: string[]): DraftReplyFn =>
  jest.fn(async () => ({
    draft: { body, citedDocumentIds },
    promptVersion: 1,
    llmCalls: [LLM_CALL],
  }));

describe('POST /api/agent/tickets/:id/draft-reply', () => {
  it('returns a draft with its cited documents, logs it internally and audits it; nothing is sent', async () => {
    const draft = draftOf('Hi Priya, payroll will review within 3 working days. [agent name]', [
      LOP_DOC.toHexString(),
    ]);
    const { ctx, payroll, cookies } = await setup(draft);
    const res = await request(ctx.app)
      .post(`${BASE}/${payroll._id.toHexString()}/draft-reply`)
      .set('Cookie', cookies.hana)
      .send({ tone: 'brief' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      draft: {
        body: 'Hi Priya, payroll will review within 3 working days. [agent name]',
        citedDocuments: [{ documentId: LOP_DOC.toHexString(), docTitle: 'Loss of Pay (LOP)' }],
      },
      promptVersion: 1,
    });

    // The model saw the ticket, the brief and the shown passages; never the requester's email.
    const input = (draft as jest.Mock).mock.calls[0][0] as DraftReplyInput;
    expect(input.tone).toBe('brief');
    expect(input.brief).toBe('Priya logged 11 Sept late and asks for an LOP review.');
    expect(input.ticket).toContain('Employee first name: Priya');
    expect(input.ticket).not.toContain('priya.shah@example.com');
    expect(input.sources.map((s) => s.docTitle).sort()).toEqual([
      'Attendance',
      'Loss of Pay (LOP)',
    ]);

    const events = await ctx.deps.tickets.listEvents(payroll._id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ai_draft_generated',
      visibility: 'internal',
      body: 'Hi Priya, payroll will review within 3 working days. [agent name]',
      llmCall: { promptName: 'agent_draft_reply', promptVersion: 1 },
    });
    // Not a reply: the employee sees no event and gets no notification.
    expect(await ctx.deps.tickets.listEvents(payroll._id, 'public')).toHaveLength(0);
    expect((ctx.deps.workspace as MemoryWorkspace).data.notifications).toHaveLength(0);
    expect(ctx.audit.find((a) => a.action === 'ticket.ai_draft')).toMatchObject({
      targetId: payroll._id.toHexString(),
      metadata: { humanId: 'HR-0101', tone: 'brief', promptVersion: 1, citedDocuments: 1 },
    });
  });

  it('defaults to the standard tone; admins may ask too', async () => {
    const draft = draftOf('Hi Priya,', []);
    const { ctx, payroll, cookies } = await setup(draft);
    const res = await request(ctx.app)
      .post(`${BASE}/${payroll._id.toHexString()}/draft-reply`)
      .set('Cookie', cookies.alex)
      .send({});
    expect(res.status).toBe(200);
    expect(((draft as jest.Mock).mock.calls[0][0] as DraftReplyInput).tone).toBe('standard');
  });

  it('employees cannot ask (403); agents outside the queue get 404; unknown tone is 400', async () => {
    const draft = draftOf('x', []);
    const { ctx, payroll, cookies } = await setup(draft);
    const url = `${BASE}/${payroll._id.toHexString()}/draft-reply`;
    expect((await request(ctx.app).post(url).set('Cookie', cookies.priya).send({})).status).toBe(
      403,
    );
    expect((await request(ctx.app).post(url).set('Cookie', cookies.sam).send({})).status).toBe(404);
    expect(
      (await request(ctx.app).post(url).set('Cookie', cookies.hana).send({ tone: 'angry' })).status,
    ).toBe(400);
    expect(draft).not.toHaveBeenCalled();
  });

  it('confidential cases get no AI draft (409, no model call)', async () => {
    const draft = draftOf('x', []);
    const { ctx, confidential, cookies } = await setup(draft);
    const res = await request(ctx.app)
      .post(`${BASE}/${confidential._id.toHexString()}/draft-reply`)
      .set('Cookie', cookies.hana)
      .send({});
    expect(res.status).toBe(409);
    expect(draft).not.toHaveBeenCalled();
  });

  it('a model failure is 503 and logs nothing', async () => {
    const failing: DraftReplyFn = async () => ({
      draft: null,
      promptVersion: 1,
      llmCalls: [{ ...LLM_CALL, error: '503 overloaded' }],
    });
    const { ctx, payroll, cookies } = await setup(failing);
    const res = await request(ctx.app)
      .post(`${BASE}/${payroll._id.toHexString()}/draft-reply`)
      .set('Cookie', cookies.hana)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('LLM_UNAVAILABLE');
    expect(await ctx.deps.tickets.listEvents(payroll._id)).toHaveLength(0);
  });

  it('without a configured model the endpoint answers 503', async () => {
    const { ctx, payroll, cookies } = await setup(undefined);
    const res = await request(ctx.app)
      .post(`${BASE}/${payroll._id.toHexString()}/draft-reply`)
      .set('Cookie', cookies.hana)
      .send({});
    expect(res.status).toBe(503);
  });

  it('the ticket detail shows the P-6 agent assistance', async () => {
    const { ctx, payroll, cookies } = await setup(draftOf('x', []));
    await (ctx.deps.tickets as MemoryTickets).setAgentAssist(payroll._id, {
      agentBrief: 'AI brief',
      agentAssist: {
        status: 'generated',
        headline: 'Review LOP for 11 Sept',
        firstChecks: ['Check the late entry'],
        promptRef: 'agent_ticket_summary@v1#abc',
      },
    });
    const res = await request(ctx.app)
      .get(`${BASE}/${payroll._id.toHexString()}`)
      .set('Cookie', cookies.hana);
    expect(res.status).toBe(200);
    expect(res.body.ticket.agentBrief).toBe('AI brief');
    expect(res.body.ticket.agentAssist).toEqual({
      status: 'generated',
      headline: 'Review LOP for 11 Sept',
      firstChecks: ['Check the late entry'],
    });
  });
});

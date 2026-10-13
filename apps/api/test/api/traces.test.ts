// W4-03: trace viewer — admin only; user text is the redacted input, never the
// raw message; every view is audited; chunk texts are resolved; eval runs are
// not listed. Fixture: Priya's swollen-battery turn (safety precheck, priority floor).
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type {
  ChunkDoc,
  ConversationDoc,
  MessageDoc,
  TicketDoc,
  TurnTraceDoc,
} from '../../src/db/schemas';
import { buildTestApp, loginCookie, userByEmail, seededUsers } from '../helpers/app';
import { memoryTicketsRepository } from '../helpers/tickets';
import { memoryTracesRepository, type TraceStore } from '../helpers/traces';

const ADMIN = 'alex.morgan@example.com';
const T0 = new Date('2026-10-10T09:00:00Z');
const RAW_EMAIL = 'priya.private@gmail.com';

function fixture() {
  const users = seededUsers();
  const priya = userByEmail(users, 'priya.shah@example.com');
  const conversationId = new ObjectId();
  const ticketId = new ObjectId();
  const userMessageId = new ObjectId();
  const assistantId = new ObjectId();
  const chunk: ChunkDoc = {
    _id: new ObjectId(),
    documentId: new ObjectId(),
    ordinal: 2,
    sectionPath: ['Laptop batteries', 'Swollen battery'],
    text: 'Stop using the device and do not charge it.',
    contextualText: 'IT Safety > Swollen battery\nStop using the device and do not charge it.',
    tokenCount: 10,
    embeddingModel: 'gemini-embedding-001',
    domain: 'IT',
    countries: ['US', 'UK'],
    employmentTypes: ['full_time', 'contractor'],
    accessLevel: 'standard',
    status: 'active',
    effectiveDate: T0,
    docTitle: 'Device safety',
    docSlug: 'it-device-safety',
  };
  const conversation: ConversationDoc = {
    _id: conversationId,
    userId: priya._id,
    title: 'My laptop battery is swollen',
    status: 'escalated',
    resolution: null,
    ticketId,
    restricted: false,
    lastDecision: 'ESCALATE',
    turnCount: 1,
    isEval: false,
    createdAt: T0,
    updatedAt: T0,
  };
  const evalConversation: ConversationDoc = {
    ...conversation,
    _id: new ObjectId(),
    title: 'Eval case',
    ticketId: null,
    isEval: true,
  };
  const other: ConversationDoc = {
    ...conversation,
    _id: new ObjectId(),
    title: 'How many days of annual leave?',
    status: 'open',
    ticketId: null,
    lastDecision: 'ANSWER',
    createdAt: new Date('2026-10-12T09:00:00Z'),
    updatedAt: new Date('2026-10-12T09:00:00Z'),
  };
  const messages: MessageDoc[] = [
    {
      _id: userMessageId,
      conversationId,
      role: 'user',
      content: `My laptop battery is swollen, reach me at ${RAW_EMAIL}`,
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: T0,
    },
    {
      _id: assistantId,
      conversationId,
      role: 'assistant',
      content: 'Stop using the laptop now and unplug it. I can raise an urgent ticket.',
      decision: 'ESCALATE',
      reasonCode: 'SAFETY_RISK',
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: T0,
    },
  ];
  const trace: TurnTraceDoc = {
    _id: new ObjectId(),
    messageId: assistantId,
    conversationId,
    userId: priya._id,
    graphRunId: 'run-battery',
    redactedInput: 'My laptop battery is swollen, reach me at [EMAIL]',
    profileSnapshot: {
      country: 'US',
      employmentType: 'full_time',
      accessLevel: 'standard',
      department: 'Engineering',
    },
    precheck: { sensitiveHit: false, safetyHit: true, matchedRules: ['safety.battery_swelling'] },
    analysis: { intent: 'report_issue', domain: 'IT', category: 'hardware', urgency: 'high' },
    retrieval: {
      query: 'swollen laptop battery',
      filter: { status: 'active' },
      vector: [{ chunkId: chunk._id, score: 0.88, rank: 1 }],
      keyword: [{ chunkId: chunk._id, score: 7.1, rank: 1 }],
      fused: [{ chunkId: chunk._id, score: 0.033, rank: 1 }],
      reranked: [{ chunkId: chunk._id, relevance: 3 }],
      coverage: 'full',
    },
    decision: {
      value: 'ESCALATE',
      reasonCode: 'SAFETY_RISK',
      rulesFired: ['precheck.safety', 'escalate.safety'],
      thresholds: { minRelevance: 2 },
    },
    output: {
      citationsProposed: ['S1'],
      citationsValid: ['S1'],
      citationsRejected: [],
      numericViolations: [],
      withdrawn: false,
    },
    llmCalls: [
      {
        node: 'analyzeTurn',
        promptName: 'turn_analysis',
        promptVersion: 2,
        promptHash: 'abc123',
        provider: 'google',
        model: 'gemini-2.5-flash',
        inputTokens: 900,
        outputTokens: 120,
        costUsd: 0.0004,
        latencyMs: 1400,
        retries: 0,
        error: null,
      },
    ],
    stepLatencyMs: { precheck: 2, analyzeTurn: 1400 },
    totalLatencyMs: 3100,
    ttftMs: 900,
    totalCostUsd: 0.0004,
    errors: [],
    restricted: false,
    isEval: false,
    createdAt: T0,
  };
  const ticket = {
    _id: ticketId,
    humanId: 'IT-1042',
    conversationId,
    requesterId: priya._id,
    requesterSnapshot: {
      name: priya.name,
      email: priya.email,
      country: priya.country,
      employmentType: priya.employmentType,
      department: priya.department,
    },
    domain: 'IT',
    category: 'hardware',
    subcategory: null,
    queue: 'it_hardware',
    priority: 'critical',
    aiUrgency: 'high',
    priorityFloorApplied: 'safety_hazard',
    status: 'new',
    summary: 'Swollen laptop battery',
    agentBrief: '',
    agentAssist: null,
    fields: {},
    aiFilledFields: [],
    articlesShown: [],
    restricted: false,
    duplicateOf: null,
    isEval: false,
    createdAt: T0,
    updatedAt: T0,
    resolvedAt: null,
  } as TicketDoc;

  const store: TraceStore = {
    conversations: [conversation, evalConversation, other],
    traces: [trace],
    messages,
    chunks: [chunk],
  };
  const tickets = memoryTicketsRepository();
  void tickets.insert(ticket);
  const ctx = buildTestApp({ users, tickets, traces: memoryTracesRepository(store) });
  return { ctx, conversation, other, trace, chunk, priya };
}

describe('GET /api/admin/conversations', () => {
  it('lists non-eval conversations, newest activity first, with the user name', async () => {
    const { ctx, conversation, other } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app).get('/api/admin/conversations').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([
      other._id.toHexString(),
      conversation._id.toHexString(),
    ]);
    expect(res.body.items[1]).toMatchObject({
      userName: 'Priya Shah',
      status: 'escalated',
      lastDecision: 'ESCALATE',
      turnCount: 1,
      restricted: false,
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('filters by a turn decision, status and date; pages with a cursor', async () => {
    const { ctx, conversation, other } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const get = (q: string) =>
      request(ctx.app).get(`/api/admin/conversations?${q}`).set('Cookie', cookie);
    expect((await get('decision=ESCALATE')).body.items).toHaveLength(1);
    expect((await get('decision=CLARIFY')).body.items).toHaveLength(0);
    expect((await get('status=open')).body.items[0].id).toBe(other._id.toHexString());
    expect((await get('from=2026-10-11')).body.items).toHaveLength(1);
    expect((await get('to=2026-10-10')).body.items[0].id).toBe(conversation._id.toHexString());
    const first = await get('limit=1');
    expect(first.body.items).toHaveLength(1);
    const second = await get(`limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.items[0].id).toBe(conversation._id.toHexString());
    expect((await get('decision=MAYBE')).status).toBe(400);
  });

  it('admin only: 403 for agents and employees, 401 signed out', async () => {
    const { ctx, conversation, trace } = fixture();
    for (const email of ['sam.patel@example.com', 'priya.shah@example.com']) {
      const cookie = await loginCookie(ctx.app, email);
      for (const url of [
        '/api/admin/conversations',
        `/api/admin/conversations/${conversation._id.toHexString()}/traces`,
        `/api/admin/traces/${trace._id.toHexString()}`,
      ]) {
        expect((await request(ctx.app).get(url).set('Cookie', cookie)).status).toBe(403);
      }
    }
    expect((await request(ctx.app).get('/api/admin/conversations')).status).toBe(401);
  });
});

describe('GET /api/admin/conversations/:id/traces', () => {
  it("Priya's battery turn: redacted input, safety precheck, priority floor; audited", async () => {
    const { ctx, conversation, trace } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app)
      .get(`/api/admin/conversations/${conversation._id.toHexString()}/traces`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.conversation.ticket).toMatchObject({
      humanId: 'IT-1042',
      priority: 'critical',
      aiUrgency: 'high',
      priorityFloorApplied: 'safety_hazard',
    });
    expect(res.body.turns).toHaveLength(1);
    expect(res.body.turns[0]).toMatchObject({
      traceId: trace._id.toHexString(),
      userMessage: 'My laptop battery is swollen, reach me at [EMAIL]',
      assistantMessage: expect.stringContaining('Stop using the laptop'),
      traceSummary: {
        decision: 'ESCALATE',
        reasonCode: 'SAFETY_RISK',
        safetyHit: true,
        sensitiveHit: false,
        coverage: 'full',
        citationsValid: 1,
        llmCallCount: 1,
      },
    });
    expect(JSON.stringify(res.body)).not.toContain(RAW_EMAIL);
    expect(ctx.audit.find((a) => a.action === 'admin.trace_view')).toMatchObject({
      targetType: 'conversation',
      targetId: conversation._id.toHexString(),
    });
  });

  it('404 for an unknown conversation, 400 for a malformed id', async () => {
    const { ctx } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const missing = await request(ctx.app)
      .get(`/api/admin/conversations/${new ObjectId().toHexString()}/traces`)
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect(
      (await request(ctx.app).get('/api/admin/conversations/nope/traces').set('Cookie', cookie))
        .status,
    ).toBe(400);
  });
});

describe('GET /api/admin/traces/:traceId', () => {
  it('returns every trace field with chunk texts resolved; audited', async () => {
    const { ctx, trace, chunk } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app)
      .get(`/api/admin/traces/${trace._id.toHexString()}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const t = res.body.trace;
    expect(t.redactedInput).toContain('[EMAIL]');
    expect(t.precheck).toEqual({
      sensitiveHit: false,
      safetyHit: true,
      matchedRules: ['safety.battery_swelling'],
    });
    expect(t.decision.rulesFired).toEqual(['precheck.safety', 'escalate.safety']);
    expect(t.retrieval.reranked[0]).toEqual({
      chunkId: chunk._id.toHexString(),
      score: 3,
      docTitle: 'Device safety',
      sectionPath: ['Laptop batteries', 'Swollen battery'],
      text: 'Stop using the device and do not charge it.',
    });
    expect(t.retrieval.vector[0]).toMatchObject({ score: 0.88, rank: 1, text: chunk.text });
    expect(t.llmCalls[0]).toMatchObject({ promptName: 'turn_analysis', promptVersion: 2 });
    // Every top-level field of the stored trace is present (playbook section 3).
    expect(Object.keys(t).sort()).toEqual(
      Object.keys(trace)
        .map((k) => (k === '_id' ? 'id' : k))
        .sort(),
    );
    expect(ctx.audit.find((a) => a.action === 'admin.trace_view')).toMatchObject({
      targetType: 'trace',
      targetId: trace._id.toHexString(),
    });
  });

  it('404 for an unknown trace', async () => {
    const { ctx } = fixture();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app)
      .get(`/api/admin/traces/${new ObjectId().toHexString()}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

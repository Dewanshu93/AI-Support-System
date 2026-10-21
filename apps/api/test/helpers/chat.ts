// The app with the real runtime turn graph on fake models: scripted LLM
// replies in call order (P-1, P-2, P-3, …), a fake retriever over fixed
// chunks, in-memory storage. No network, no database.
import { ObjectId } from 'mongodb';
import type { Express } from 'express';
import request from 'supertest';
import { createMemoryCheckpointer } from '../../src/ai/graph/checkpointer';
import { buildTurnGraph } from '../../src/ai/graph/runtime';
import { fakeChatHandle, type FakeReply } from '../../src/ai/llm/fakeModels';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import type { RetrievalResult } from '../../src/ai/retrieval/retrieve';
import { loadConfig } from '../../src/config';
import type { ChunkDoc } from '../../src/db/schemas';
import {
  buildTestApp,
  loginCookie,
  memoryUsersRepository,
  seededUsers,
  type TestContext,
} from './app';
import { VALID_ENV } from './config';
import { type MemoryConversations, memoryConversationsRepository } from './conversations';
import {
  type MemoryEmails,
  memoryEmailService,
  type MemoryTickets,
  memoryTicketsRepository,
} from './tickets';
import { type MemoryWorkspace, memoryWorkspaceRepository } from './workspace';
import { buildMockHrData } from '../../src/modules/workspace/seed';
import { createLeaveService } from '../../src/modules/workspace/leaveService';
import { createWorkspaceRecords } from '../../src/modules/workspace/records';
import { createWorkspaceService } from '../../src/modules/workspace/service';

/** "Today" for chat tests that touch the employee's records (Wednesday). */
export const CHAT_TODAY = '2026-10-07';

export const config = loadConfig(VALID_ENV);
const prompts = loadPromptRegistry(config.prompts.active);

export function chunk(slug: string, text: string, over: Partial<ChunkDoc> = {}): ChunkDoc {
  return {
    _id: new ObjectId(),
    documentId: new ObjectId(),
    ordinal: 0,
    sectionPath: ['Entitlement'],
    text,
    contextualText: `${slug} > Entitlement\n${text}`,
    tokenCount: 10,
    embeddingModel: 'gemini-embedding-001',
    domain: 'HR',
    countries: ['US', 'UK'],
    employmentTypes: ['full_time', 'contractor'],
    accessLevel: 'standard',
    status: 'active',
    effectiveDate: new Date('2026-01-01'),
    docTitle: 'Annual Leave (US)',
    docSlug: slug,
    ...over,
  };
}

export const LEAVE_CHUNKS = [
  chunk('hr-annual-leave-us', 'Full-time US employees get 15 days of paid vacation per year.'),
  chunk('hr-annual-leave-us', 'Up to 5 unused days may be carried over until 31 March.'),
];

export function retrievalOf(chunks: ChunkDoc[]): RetrievalResult {
  return {
    candidates: chunks.map((c, i) => ({
      chunk: c,
      fusedScore: 1 / (61 + i),
      rank: i + 1,
      vector: { score: 0.9, rank: i + 1 },
      keyword: null,
    })) as unknown as RetrievalResult['candidates'],
    trace: {
      query: 'q',
      filter: { must: [] },
      domainHint: null,
      domainHintDropped: false,
      embeddingError: null,
      vector: chunks.map((c, i) => ({ chunkId: c._id.toHexString(), score: 0.9, rank: i + 1 })),
      keyword: [],
      fused: chunks.map((c, i) => ({
        chunkId: c._id.toHexString(),
        score: 1 / (61 + i),
        rank: i + 1,
      })),
      violations: [],
      missing: [],
    } as RetrievalResult['trace'],
  };
}

/** P-1 reply: a plain question unless overridden. */
export const analysisReply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    intent: 'question',
    domain: 'HR',
    category: 'leave',
    urgency: 'low',
    urgencyReason: 'information request',
    sensitivity: 'none',
    ambiguity: 'low',
    searchQuery: 'annual leave entitlement US full time',
    ...over,
  });

/** P-2 reply ranking the given chunks (relevance 3 for the first). */
export const rerankReply = (chunks: ChunkDoc[], coverage = 'full') =>
  JSON.stringify({
    ranked: chunks.map((c, i) => ({
      chunkId: c._id.toHexString(),
      relevance: i === 0 ? 3 : 2,
      reason: 'relevant',
    })),
    coverage,
    missingAspects: [],
  });

/** P-3 reply: prose plus the fenced trailer. */
export const answerReply = (prose: string, uncovered: string[] = []) =>
  `${prose}\n\n\`\`\`json\n${JSON.stringify({ uncovered })}\n\`\`\``;

export interface ChatTestContext extends TestContext {
  conversations: MemoryConversations;
  tickets: MemoryTickets;
  /** The escalation email outbox (UC-07) shared by the graph and the endpoints. */
  emails: MemoryEmails;
  chat: ReturnType<typeof fakeChatHandle>;
  /** The mock HR data (seed for CHAT_TODAY) the copilot agents read and write. */
  workspace: MemoryWorkspace;
  /** Scripts the next LLM replies (appends). */
  script(replies: FakeReply[]): void;
}

export function buildChatTestApp(
  options: { retrieve?: () => Promise<RetrievalResult>; replies?: FakeReply[] } = {},
): ChatTestContext {
  const users = seededUsers();
  const conversations = memoryConversationsRepository();
  const tickets = memoryTicketsRepository();
  const email = memoryEmailService();
  const clock = () => new Date(`${CHAT_TODAY}T12:00:00Z`);
  const workspace = memoryWorkspaceRepository(
    buildMockHrData({ users, today: CHAT_TODAY, workday: config.workday }),
  );
  const records = createWorkspaceRecords({
    service: createWorkspaceService({
      workspace,
      tickets,
      workday: config.workday,
      routing: config.routing,
      clock,
    }),
    tickets,
    routing: config.routing,
    leave: createLeaveService({
      workspace,
      users: memoryUsersRepository(users),
      workday: config.workday,
      approvalQueue: 'hr_general',
      clock,
    }),
  });
  const queue: FakeReply[] = [...(options.replies ?? [])];
  // One fake model whose replies are drawn from a shared, appendable queue.
  const chat = fakeChatHandle(queue, { nativeStructured: true });
  (chat.model as unknown as { replies: FakeReply[] }).replies = queue;
  const graph = buildTurnGraph({
    config: {
      ...config,
      models: {
        ...config.models,
        call: { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 },
      },
    },
    prompts,
    chatFor: () => chat,
    users: { findById: async (id) => users.find((u) => u._id.toHexString() === id) ?? null },
    conversations,
    tickets,
    records,
    email,
    retrieve: options.retrieve ?? (async () => retrievalOf(LEAVE_CHUNKS)),
    checkpointer: createMemoryCheckpointer(),
  });
  const ctx = buildTestApp({ users, conversations, graph, tickets, workspace, clock, email });
  return {
    ...ctx,
    conversations,
    tickets,
    emails: email.outbox,
    workspace,
    chat,
    script: (replies) => void queue.push(...replies),
  };
}

export async function newConversation(app: Express, cookie: string): Promise<string> {
  const res = await request(app).post('/api/conversations').set('Cookie', cookie).send({});
  if (res.status !== 201) throw new Error(`create conversation failed: ${res.status}`);
  return (res.body as { conversation: { id: string } }).conversation.id;
}

export { loginCookie };

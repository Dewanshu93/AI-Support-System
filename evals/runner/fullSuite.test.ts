// The full suite against the real runtime graph on fake models and in-memory
// storage: multi-turn cases, isEval persistence, outcome extraction, errors.
import { createMemoryCheckpointer } from '../../apps/api/src/ai/graph/checkpointer';
import { buildTurnGraph } from '../../apps/api/src/ai/graph/runtime';
import { fakeChatHandle } from '../../apps/api/src/ai/llm/fakeModels';
import { loadPromptRegistry } from '../../apps/api/src/ai/prompts/registry';
import { seededUsers } from '../../apps/api/test/helpers/app';
import {
  analysisReply,
  answerReply,
  config,
  LEAVE_CHUNKS,
  rerankReply,
  retrievalOf,
} from '../../apps/api/test/helpers/chat';
import { memoryConversationsRepository } from '../../apps/api/test/helpers/conversations';
import { runFullSuite } from './fullSuite';
import type { GoldenCase } from './schema';

const golden = (over: Partial<GoldenCase>): GoldenCase => ({
  id: 'HR-ANS-001',
  category: 'answerable',
  tags: [],
  userEmail: 'priya.shah@example.com',
  turns: [{ role: 'user', content: 'How much vacation do I get?' }],
  expected: {
    decision: 'ANSWER',
    docSlugs: ['hr-annual-leave-us'],
    forbiddenDocSlugs: [],
    keyFacts: ['15 days'],
  },
  notes: 'n',
  ...over,
});

function setup(replies: string[], retrieve = async () => retrievalOf(LEAVE_CHUNKS)) {
  const users = seededUsers();
  const conversations = memoryConversationsRepository();
  const chat = fakeChatHandle(replies, { nativeStructured: true });
  const graph = buildTurnGraph({
    config: {
      ...config,
      models: {
        ...config.models,
        call: { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 },
      },
    },
    prompts: loadPromptRegistry(config.prompts.active),
    chatFor: () => chat,
    users: { findById: async (id) => users.find((u) => u._id.toHexString() === id) ?? null },
    conversations,
    retrieve,
    checkpointer: createMemoryCheckpointer(),
    isEval: true,
  });
  return { graph, conversations, users };
}

describe('runFullSuite', () => {
  it('runs each case as its user and extracts the scored outcome; stores isEval records', async () => {
    const { graph, conversations, users } = setup([
      analysisReply(),
      rerankReply(LEAVE_CHUNKS),
      answerReply('Full-time US employees get 15 days of paid vacation per year [S1].'),
    ]);
    const [o] = await runFullSuite([golden({})], {
      graph,
      conversations,
      userFor: (email) => users.find((u) => u.email === email),
    });
    expect(o).toMatchObject({
      caseId: 'HR-ANS-001',
      decision: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      citationsShown: 1,
      citationsShownValid: 1,
      citationsProposed: 1,
      citationsProposedValid: 1,
      error: null,
    });
    expect(o!.contextDocs.map((d) => d.slug)).toEqual(['hr-annual-leave-us', 'hr-annual-leave-us']);
    expect(o!.citedDocs.map((d) => d.slug)).toEqual(['hr-annual-leave-us']);
    expect(o!.answerText).toContain('15 days');
    expect(o!.ttftMs).toEqual(expect.any(Number));
    expect(conversations.conversations[0]!.isEval).toBe(true);
    expect(conversations.messages.every((m) => m.isEval)).toBe(true);
    expect(conversations.traces[0]!.isEval).toBe(true);
  });

  it('sends every planned turn of a multi-turn case and scores the last', async () => {
    const { graph, conversations, users } = setup([
      analysisReply({ ambiguity: 'high', ambiguityReason: 'which leave?' }),
      rerankReply(LEAVE_CHUNKS),
      JSON.stringify({ question: 'Which kind of leave?', fieldsAsked: [] }),
      analysisReply(),
      rerankReply(LEAVE_CHUNKS),
      answerReply('You get 15 days [S1].'),
    ]);
    const [o] = await runFullSuite(
      [
        golden({
          turns: [
            { role: 'user', content: 'How much leave?' },
            { role: 'user', content: 'Annual leave' },
          ],
        }),
      ],
      { graph, conversations, userFor: (email) => users.find((u) => u.email === email) },
    );
    expect(o!.decision).toBe('ANSWER');
    expect(conversations.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('records an unknown user or a failing turn as a case error and carries on', async () => {
    const { graph, conversations, users } = setup([analysisReply()], async () => {
      throw new Error('Qdrant unreachable');
    });
    const outcomes = await runFullSuite(
      [golden({ id: 'HR-ANS-002', userEmail: 'nobody@example.com' }), golden({ id: 'HR-ANS-003' })],
      {
        graph,
        conversations,
        userFor: (email) => users.find((u) => u.email === email),
        concurrency: 2,
      },
    );
    expect(outcomes[0]!.error).toBe('unknown user nobody@example.com');
    expect(outcomes[1]!.error).toContain('Qdrant unreachable');
  });
});

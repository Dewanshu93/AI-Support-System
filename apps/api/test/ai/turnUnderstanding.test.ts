// AI workflow tests for W2-03: loadContext, precheck and analyzeTurn with fake
// models. No network.
import { ObjectId } from 'mongodb';
import { loadConfig } from '../../src/config';
import type { MessageDoc, UserDoc } from '../../src/db/schemas';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import { newTurn, type State, type TurnInput } from '../../src/ai/graph/state';
import { compilePrecheckRules } from '../../src/ai/guards/precheckRules';
import { LlmError } from '../../src/ai/llm';
import { fakeChatHandle, type FakeReply } from '../../src/ai/llm/fakeModels';
import {
  ANALYSIS_FALLBACK,
  createAnalyzeTurn,
  fallbackAnalysis,
  formatTaxonomy,
} from '../../src/ai/nodes/analyzeTurn';
import { createLoadContext, HISTORY_LIMIT } from '../../src/ai/nodes/loadContext';
import { createPrecheck } from '../../src/ai/nodes/precheck';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import type { TurnAnalysis } from '../../src/ai/schemas';
import type { ConversationsRepository } from '../../src/modules/conversations/repository';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const prompts = loadPromptRegistry(config.prompts.active);
const policy = { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 };

const userId = new ObjectId();
const conversationId = new ObjectId();
const user = {
  _id: userId,
  email: 'tom@example.com',
  name: 'Tom',
  role: 'employee',
  country: 'UK',
  employmentType: 'contractor',
  department: 'Finance',
  jobTitle: 'Analyst',
  accessLevel: 'standard',
  queues: [],
  isDemo: true,
  createdAt: new Date(),
} as UserDoc;

const message = (role: MessageDoc['role'], content: string, minute: number): MessageDoc => ({
  _id: new ObjectId(),
  conversationId,
  role,
  content,
  decision: null,
  reasonCode: null,
  citations: [],
  uncovered: [],
  ticketDraft: null,
  status: 'complete',
  isEval: false,
  createdAt: new Date(2026, 9, 6, 9, minute),
});

const input = (text: string, over: Partial<TurnInput> = {}): TurnInput => ({
  conversationId: conversationId.toHexString(),
  userId: userId.toHexString(),
  userMessageId: new ObjectId().toHexString(),
  assistantMessageId: new ObjectId().toHexString(),
  text,
  forceEscalate: false,
  ...over,
});

const VALID = {
  intent: 'report_issue',
  domain: 'IT',
  category: 'network',
  subcategory: 'vpn',
  urgency: 'high',
  urgencyReason: 'cannot work remotely',
  sensitivity: 'none',
  ambiguity: 'low',
  searchQuery: 'VPN disconnects repeatedly on company laptop',
};

function analyzeWith(replies: FakeReply[], options = {}) {
  const chat = fakeChatHandle(replies, options);
  const node = createAnalyzeTurn({
    prompts,
    chatFor: () => chat,
    taxonomy: config.taxonomy,
    policy,
    costs: config.models.costs,
  });
  return { chat, node };
}

const stateFor = (text: string, over: Partial<State> = {}) =>
  ({
    input: input(text),
    profile: null,
    history: [],
    ...over,
  }) as State;

describe('analyzeTurn', () => {
  it('valid output → analysis, one traced call with prompt ref and cost', async () => {
    const { chat, node } = analyzeWith([JSON.stringify(VALID)], { nativeStructured: true });
    const update = await node(stateFor('My VPN keeps dropping'));
    expect(update.analysis).toEqual(VALID);
    expect(chat.model.calls).toHaveLength(1);
    const trace = update.trace as { llmCalls: unknown[]; flags?: string[]; outputs: object };
    expect(trace.llmCalls).toEqual([
      expect.objectContaining({
        node: 'analyzeTurn',
        promptRef: prompts.get('turn_analysis').ref,
        model: 'gemini-3.1-flash-lite',
        mode: 'native',
        inputTokens: 100,
        outputTokens: 20,
      }),
    ]);
    expect(trace.flags).toBeUndefined();
    expect(trace.outputs).toEqual({ analysis: VALID });
  });

  it('invalid then valid → retries once with the validation error appended', async () => {
    const invalid = JSON.stringify({ ...VALID, category: 'catering' });
    const { chat, node } = analyzeWith([invalid, JSON.stringify(VALID)]);
    const update = await node(stateFor('My VPN keeps dropping'));
    expect(update.analysis).toEqual(VALID);
    expect(chat.model.calls).toHaveLength(2);
    const retryMessages = chat.model.calls[1]!;
    const feedback = String(retryMessages.at(-2)?.content);
    expect(feedback).toContain('Your previous reply was rejected');
    expect(feedback).toContain('category');
    const trace = update.trace as { llmCalls: { error?: string }[]; flags?: string[] };
    expect(trace.llmCalls).toHaveLength(2);
    expect(trace.llmCalls[0]!.error).toContain('does not match the schema');
    expect(trace.flags).toBeUndefined();
  });

  it('double failure → fallback analysis flagged ANALYSIS_FALLBACK', async () => {
    const { chat, node } = analyzeWith(['not json at all', JSON.stringify({ intent: 'x' })]);
    const update = await node(stateFor('Printer on floor 3 is jammed'));
    expect(chat.model.calls).toHaveLength(2);
    expect(update.analysis).toEqual(fallbackAnalysis('Printer on floor 3 is jammed'));
    expect(update.analysis).toMatchObject({
      intent: 'question',
      domain: 'unknown',
      sensitivity: 'none',
      ambiguity: 'low',
      searchQuery: 'Printer on floor 3 is jammed',
    });
    const trace = update.trace as { flags: string[]; errors: unknown[] };
    expect(trace.flags).toEqual([ANALYSIS_FALLBACK]);
    expect(trace.errors).toHaveLength(2);
  });

  it('provider failure → fallback without a second attempt', async () => {
    const outage = new LlmError('provider', 'Gemini 503 high demand');
    const { chat, node } = analyzeWith([outage, JSON.stringify(VALID)], {
      nativeStructured: true,
    });
    const update = await node(stateFor('VPN down'));
    expect(chat.model.calls).toHaveLength(1);
    expect((update.trace as { flags: string[] }).flags).toEqual([ANALYSIS_FALLBACK]);
  });

  it('renders the profile summary, history and taxonomy into P-1', async () => {
    const { chat, node } = analyzeWith([JSON.stringify(VALID)], { nativeStructured: true });
    await node(
      stateFor('Is it still broken?', {
        profile: {
          country: 'UK',
          employmentType: 'contractor',
          accessLevel: 'standard',
          department: 'Finance',
          jobTitle: 'Analyst',
        },
        history: [{ role: 'user', content: 'My VPN drops every hour' }],
      }),
    );
    const [system, human] = chat.model.calls[0]!.map((m) => String(m.content));
    expect(system).toContain(formatTaxonomy(config.taxonomy));
    expect(human).toContain('country UK; employment type contractor; department Finance');
    expect(human).toContain(
      '<untrusted_history>\nuser: My VPN drops every hour\n</untrusted_history>',
    );
    expect(human).toContain(
      '<untrusted_user_message>\nIs it still broken?\n</untrusted_user_message>',
    );
    expect(human).not.toContain('Tom');
  });

  it('the fallback search query is capped at 30 words', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(fallbackAnalysis(long).searchQuery.split(' ')).toHaveLength(30);
  });
});

describe('loadContext', () => {
  const history = [
    message('user', 'first', 1),
    message('assistant', 'first reply', 2),
    message('user', 'second', 3),
  ];
  const conversations: Pick<ConversationsRepository, 'recentMessages'> = {
    recentMessages: jest.fn(async () => history),
  };

  it('loads the profile and history, excluding the current message', async () => {
    const node = createLoadContext({ users: { findById: async () => user }, conversations });
    const turn = input('third');
    const update = await node({ input: turn } as State);
    expect(update.profile).toEqual({
      country: 'UK',
      employmentType: 'contractor',
      accessLevel: 'standard',
      department: 'Finance',
      jobTitle: 'Analyst',
    });
    expect(update.history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'second' },
    ]);
    expect(conversations.recentMessages).toHaveBeenCalledWith(
      turn.conversationId,
      HISTORY_LIMIT,
      turn.userMessageId,
    );
  });

  it('fails when the user does not exist', async () => {
    const node = createLoadContext({ users: { findById: async () => null }, conversations });
    await expect(node({ input: input('hi') } as State)).rejects.toThrow('not found');
  });
});

describe('graph with real loadContext, precheck and analyzeTurn', () => {
  const rules = compilePrecheckRules(config.sensitive, config.priorityRules);
  const conversations: Pick<ConversationsRepository, 'recentMessages'> = {
    recentMessages: async () => [],
  };

  function graphWith(replies: FakeReply[]) {
    const { chat, node } = analyzeWith(replies, { nativeStructured: true });
    const graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: {
        loadContext: createLoadContext({ users: { findById: async () => user }, conversations }),
        precheck: createPrecheck(rules),
        analyzeTurn: node,
      },
    });
    return { chat, graph };
  }

  async function run(graph: ReturnType<typeof graphWith>['graph'], text: string) {
    const turn = input(text);
    return (await graph.invoke(newTurn(turn), threadConfig(turn.userMessageId))) as State;
  }

  it('sensitive keywords route to the handoff without any LLM call', async () => {
    const { chat, graph } = graphWith([]);
    const state = await run(graph, 'My manager has been harassing me for weeks');
    expect(chat.model.calls).toHaveLength(0);
    expect(state.trace.steps.map((s) => s.node)).toEqual([
      'loadContext',
      'precheck',
      'sensitiveHandoff',
      'persist',
    ]);
    expect(state.trace.llmCalls).toEqual([]);
    expect(state.trace.outputs.precheck).toEqual({
      sensitiveHit: true,
      safetyHit: false,
      matchedRules: ['harassment'],
    });
  });

  it('an ordinary turn is analysed; the trace contains precheck and analysis', async () => {
    const { chat, graph } = graphWith([JSON.stringify(VALID)]);
    const state = await run(graph, 'My VPN keeps dropping');
    expect(chat.model.calls).toHaveLength(1);
    expect(state.analysis).toEqual(VALID);
    expect(state.profile?.country).toBe('UK');
    expect(state.trace.outputs).toEqual({
      precheck: { sensitiveHit: false, safetyHit: false, matchedRules: [] },
      analysis: VALID,
    });
    expect(state.trace.llmCalls).toHaveLength(1);
    expect(state.trace.steps.map((s) => s.node).slice(0, 4)).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'retrieve',
    ]);
  });

  it('a safety hit is recorded but still analysed (decide escalates in safety mode)', async () => {
    const { graph } = graphWith([
      JSON.stringify({ ...VALID, category: 'hardware', subcategory: 'battery' }),
    ]);
    const state = await run(graph, 'My laptop battery is swollen');
    expect(state.precheckResult).toMatchObject({ safetyHit: true, sensitiveHit: false });
    expect(state.analysis?.subcategory).toBe('battery');
  });

  it('analysis marking the turn sensitive routes to the handoff', async () => {
    const { graph } = graphWith([
      JSON.stringify({ ...VALID, sensitivity: 'sensitive', sensitivityReason: 'personal' }),
    ]);
    const state = await run(graph, 'I need to talk about something personal at home');
    expect(state.trace.steps.map((s) => s.node)).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'sensitiveHandoff',
      'persist',
    ]);
  });
});

describe('P-1 v2: workspace intent (UC-04)', () => {
  const v2 = loadPromptRegistry({ ...config.prompts.active, turn_analysis: 2 });

  it('renders with the same variables as v1 and asks for workspaceIntent', async () => {
    const { prompt, messages } = await v2.render('turn_analysis', {
      taxonomy: formatTaxonomy(config.taxonomy),
      profile: 'country: US',
      history: '(none)',
      message: 'Log 8 hours for Banking yesterday',
    });
    expect(prompt.version).toBe(2);
    expect(String(messages[0]!.content)).toContain('workspaceIntent');
  });

  it('a v2 analysis with a workspace intent validates; v1 output without it still does', async () => {
    const analyze = (reply: object) =>
      createAnalyzeTurn({
        prompts: v2,
        chatFor: () => fakeChatHandle([JSON.stringify(reply)]),
        taxonomy: config.taxonomy,
        policy,
        costs: config.models.costs,
      });
    const state = {
      input: input('Which days am I missing?'),
      profile: null,
      history: [],
    } as unknown as State;
    const withIntent = await analyze({ ...VALID, workspaceIntent: 'timesheet_status' })(state);
    expect((withIntent.analysis as TurnAnalysis).workspaceIntent).toBe('timesheet_status');
    const without = await analyze(VALID)(state);
    expect((without.analysis as TurnAnalysis).workspaceIntent).toBeUndefined();
  });

  it('an unknown workspace intent is invalid output', async () => {
    const node = createAnalyzeTurn({
      prompts: v2,
      chatFor: () =>
        fakeChatHandle([
          JSON.stringify({ ...VALID, workspaceIntent: 'delete_my_payslip' }),
          JSON.stringify({ ...VALID, workspaceIntent: 'delete_my_payslip' }),
        ]),
      taxonomy: config.taxonomy,
      policy,
      costs: config.models.costs,
    });
    const update = await node({
      input: input('x'),
      profile: null,
      history: [],
    } as unknown as State);
    expect(update.trace).toMatchObject({ flags: [ANALYSIS_FALLBACK] });
  });
});

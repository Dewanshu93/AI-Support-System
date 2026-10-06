// AI workflow tests for W2-06: the streamed answer node and citation
// validation, with a fake streaming model. No network.
import { loadConfig } from '../../src/config';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import {
  type ContextSource,
  type DecisionResult,
  newTurn,
  type Output,
  type State,
  type StateUpdate,
} from '../../src/ai/graph/state';
import { LlmError } from '../../src/ai/llm';
import { fakeChatHandle, type FakeReply } from '../../src/ai/llm/fakeModels';
import {
  ANSWER_TRAILER_INVALID,
  createAnswer,
  formatSources,
  splitTrailer,
} from '../../src/ai/nodes/answer';
import { stubAnalysis, stubRetrieval } from '../../src/ai/nodes/stubs';
import { ANSWER_WITHDRAWN, createValidateCitations } from '../../src/ai/nodes/validateCitations';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const prompts = loadPromptRegistry(config.prompts.active);
const templates = config.templates.templates;

const source = (marker: string, chunkId: string, text: string): ContextSource => ({
  marker,
  chunkId,
  documentId: `doc-${chunkId}`,
  docSlug: 'hr-annual-leave-uk',
  docTitle: 'Annual Leave (UK)',
  sectionPath: ['Entitlement'],
  effectiveDate: '2026-01-01T00:00:00.000Z',
  text,
  fusedScore: 0.016,
  rank: 1,
  relevance: 3,
});
const CONTEXT = [
  source('S1', 'c1', 'Full-time UK employees get 25 days of annual leave per year.'),
  source('S2', 'c2', 'Up to 5 unused days may be carried over to the next year.'),
];
const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: [],
});

const turnInput = (id = 'a1') => ({
  conversationId: id,
  userId: 'u1',
  userMessageId: `${id}-m`,
  assistantMessageId: `${id}-a`,
  text: 'How much leave do I get?',
  forceEscalate: false,
});

function state(over: Partial<State> = {}): State {
  return {
    input: turnInput(),
    profile: null,
    analysis: { ...stubAnalysis('annual leave entitlement UK'), domain: 'HR' },
    retrieval: { ...stubRetrieval('q'), context: CONTEXT },
    decision: decision('ANSWER', 'EVIDENCE_STRONG'),
    output: null,
    ...over,
  } as State;
}

const reply = (prose: string, uncovered: string[] = []) =>
  `${prose}\n\n\`\`\`json\n${JSON.stringify({ uncovered })}\n\`\`\``;

function answerNode(replies: FakeReply[]) {
  const chat = fakeChatHandle(replies, { modelId: 'gemini-3.8-flash' });
  const tiers: unknown[] = [];
  const node = createAnswer({
    prompts,
    chatFor: (tier, options) => {
      tiers.push({ tier, ...options });
      return chat;
    },
    policy: { timeoutMs: 5_000, maxRetries: 2, sleep: async () => {} },
    costs: config.models.costs,
  });
  return { node, chat, tiers };
}

const validate = createValidateCitations({ templates });
const out = (u: StateUpdate) => u.output as Output;

describe('answer node (fake streaming model)', () => {
  it('streams P-3, strips the trailer, records TTFT, tokens and cost', async () => {
    const prose =
      'Full-time UK employees get 25 days a year [S1]. You can carry over up to 5 days [S2].';
    const { node, chat, tiers } = answerNode([reply(prose)]);
    const update = await node(state());
    expect(out(update)).toEqual({
      text: prose,
      mode: 'answer',
      citations: [],
      uncovered: [],
      withdrawn: false,
    });
    expect(tiers).toEqual([{ tier: 'quality', temperature: 0.2 }]);
    const call = (update.trace as unknown as { llmCalls: Record<string, unknown>[] }).llmCalls[0]!;
    expect(call).toMatchObject({
      node: 'answer',
      promptRef: prompts.get('grounded_answer').ref,
      model: 'gemini-3.8-flash',
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(call.ttftMs).toEqual(expect.any(Number));
    expect(call.costUsd).toBeGreaterThan(0);
    const human = String(chat.model.calls[0]![1]!.content);
    expect(human).toContain(`<untrusted_sources>\n${formatSources(CONTEXT)}\n</untrusted_sources>`);
    expect(human).toContain('[S1] Annual Leave (UK) > Entitlement (effective 2026-01-01)');
  });

  it('partial mode: passes the mode and returns what is uncovered', async () => {
    const { node, chat } = answerNode([
      reply('You get 25 days [S1].', ['carry-over for contractors']),
    ]);
    const update = await node(state({ decision: decision('PARTIAL', 'EVIDENCE_PARTIAL') }));
    expect(out(update)).toMatchObject({
      mode: 'partial',
      uncovered: ['carry-over for contractors'],
    });
    expect(String(chat.model.calls[0]![0]!.content)).toContain('Mode: partial');
  });

  it('safety mode for ESCALATE / SAFETY', async () => {
    const { node } = answerNode([reply('Stop using the laptop [S1].')]);
    const update = await node(state({ decision: decision('ESCALATE', 'SAFETY') }));
    expect(out(update).mode).toBe('safety_steps');
  });

  it('missing trailer → uncovered [] and a flag', async () => {
    const { node } = answerNode(['You get 25 days [S1].']);
    const update = await node(state());
    expect(out(update)).toMatchObject({ text: 'You get 25 days [S1].', uncovered: [] });
    expect((update.trace as unknown as { flags: string[] }).flags).toEqual([
      ANSWER_TRAILER_INVALID,
    ]);
  });

  it('a failure before the first chunk (503 high demand) is retried', async () => {
    const busy = Object.assign(new Error('[503 Service Unavailable] high demand'), { status: 503 });
    const { node, chat } = answerNode([busy, reply('You get 25 days [S1].')]);
    const update = await node(state());
    expect(chat.model.calls).toHaveLength(2);
    expect(out(update).text).toBe('You get 25 days [S1].');
    expect(
      (update.trace as unknown as { llmCalls: { retries: number }[] }).llmCalls[0]!.retries,
    ).toBe(1);
  });

  it('a non-retryable failure before the first chunk is not retried', async () => {
    const denied = Object.assign(new Error('[403 Forbidden]'), { status: 403 });
    const { node, chat } = answerNode([denied, reply('unused')]);
    await expect(node(state())).rejects.toThrow('answer stream failed');
    expect(chat.model.calls).toHaveLength(1);
  });

  it('a failure mid-stream → LlmError, never retried (text already reached the user)', async () => {
    const { node, chat } = answerNode([
      { text: 'You get 25 days [S1]. More text here', streamError: new Error('socket hang up') },
      reply('unused'),
    ]);
    await expect(node(state())).rejects.toThrow(LlmError);
    expect(chat.model.calls).toHaveLength(1);
  });

  it('empty context → no LLM call', async () => {
    const { node, chat } = answerNode([]);
    const update = await node(state({ retrieval: { ...stubRetrieval('q'), context: [] } }));
    expect(chat.model.calls).toHaveLength(0);
    expect(out(update).text).toBe('');
  });
});

describe('splitTrailer', () => {
  it('handles a closed fence, an unclosed fence and no fence', () => {
    expect(splitTrailer(reply('A [S1].', ['x']))).toEqual({
      prose: 'A [S1].',
      trailer: { uncovered: ['x'] },
    });
    expect(splitTrailer('A [S1].\n```json\n{"uncov')).toEqual({ prose: 'A [S1].', trailer: null });
    expect(splitTrailer('A [S1].')).toEqual({ prose: 'A [S1].', trailer: null });
    expect(splitTrailer('A.\n```json\n{not json}\n```')).toEqual({ prose: 'A.', trailer: null });
  });
});

describe('validateCitations node', () => {
  const answered = (text: string, over: Partial<Output> = {}) =>
    state({
      output: { text, mode: 'answer', citations: [], uncovered: [], withdrawn: false, ...over },
    });

  it('valid: maps markers to context chunks and keeps the decision', () => {
    const update = validate(answered('You get 25 days [S1] and carry over 5 [S2].'));
    expect(out(update).citations.map((c) => [c.marker, c.chunkId])).toEqual([
      ['S1', 'c1'],
      ['S2', 'c2'],
    ]);
    expect(out(update).withdrawn).toBe(false);
    expect(update.decision).toBeUndefined();
    expect(
      (update.trace as unknown as { outputs: { citations: unknown } }).outputs.citations,
    ).toEqual({
      citationsProposed: ['S1', 'S2'],
      citationsValid: [
        { marker: 'S1', chunkId: 'c1' },
        { marker: 'S2', chunkId: 'c2' },
      ],
      citationsRejected: [],
      numericViolations: [],
      withdrawn: false,
    });
  });

  it('invented marker: removed; the answer stands on its valid citations', () => {
    const update = validate(answered('You get 25 days [S1]. Ask your manager [S4].'));
    expect(out(update)).toMatchObject({
      text: 'You get 25 days [S1]. Ask your manager.',
      withdrawn: false,
    });
    expect(out(update).citations.map((c) => c.marker)).toEqual(['S1']);
  });

  it('no valid citations → withdrawn, template text, ESCALATE / CITATION_INVALID', () => {
    const update = validate(answered('You get 25 days [S9].'));
    expect(out(update)).toMatchObject({
      withdrawn: true,
      withdrawnReason: 'NO_VALID_CITATIONS',
      citations: [],
    });
    expect(out(update).text).toContain('raise a ticket with the HR team');
    expect(update.decision).toMatchObject({ value: 'ESCALATE', reasonCode: 'CITATION_INVALID' });
    expect((update.trace as unknown as { flags: string[] }).flags).toEqual([ANSWER_WITHDRAWN]);
  });

  it('numeric mismatch → withdrawn', () => {
    const update = validate(answered('You get 28 days [S1].'));
    expect(out(update)).toMatchObject({ withdrawn: true, withdrawnReason: 'NUMERIC_MISMATCH' });
    const logged = (
      update.trace as unknown as { outputs: { citations: { numericViolations: string[] } } }
    ).outputs;
    expect(logged.citations.numericViolations).toEqual(['28']);
  });

  it('a number must come from a chunk the answer actually cites', () => {
    // 5 appears only in S2, which this sentence does not cite.
    expect(out(validate(answered('You can carry over 5 days [S1].'))).withdrawnReason).toBe(
      'NUMERIC_MISMATCH',
    );
  });

  it('safety mode: withdrawal keeps ESCALATE / SAFETY so the ticket still follows', () => {
    const update = validate(
      state({
        decision: decision('ESCALATE', 'SAFETY'),
        output: {
          text: 'Unplug it.',
          mode: 'safety_steps',
          citations: [],
          uncovered: [],
          withdrawn: false,
        },
      }),
    );
    expect(out(update).withdrawn).toBe(true);
    expect(update.decision).toBeUndefined();
  });

  it('unknown domain → the template names both teams', () => {
    const update = validate({
      ...answered('No citations.'),
      analysis: { ...stubAnalysis('x'), domain: 'unknown' },
    } as State);
    expect(out(update).text).toContain('the IT or HR team');
  });
});

describe('graph with real answer and validateCitations', () => {
  function graphWith(replies: FakeReply[]) {
    const { node } = answerNode(replies);
    return buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: { answer: node, validateCitations: validate },
    });
  }
  const presets: StateUpdate = {
    analysis: { ...stubAnalysis('leave'), domain: 'HR' },
    retrieval: { ...stubRetrieval('q'), context: CONTEXT },
    decision: decision('ANSWER', 'EVIDENCE_STRONG'),
  };

  it('a cited answer reaches persist with validated citations', async () => {
    const g = graphWith([reply('You get 25 days [S1].')]);
    const s = (await g.invoke(
      { ...newTurn(turnInput('g1')), ...presets },
      threadConfig('g1'),
    )) as State;
    expect(s.output).toMatchObject({ text: 'You get 25 days [S1].', withdrawn: false });
    expect(s.output?.citations[0]?.chunkId).toBe('c1');
    expect(s.trace.steps.map((x) => x.node).slice(-3)).toEqual([
      'answer',
      'validateCitations',
      'persist',
    ]);
  });

  it('an uncited answer is withdrawn and still persisted (with the ticket offer)', async () => {
    const g = graphWith([reply('You get 25 days.')]);
    const s = (await g.invoke(
      { ...newTurn(turnInput('g2')), ...presets },
      threadConfig('g2'),
    )) as State;
    expect(s.output?.withdrawn).toBe(true);
    expect(s.decision?.reasonCode).toBe('CITATION_INVALID');
    expect(s.trace.steps.at(-1)?.node).toBe('persist');
  });

  it('answer tokens surface as chat-model stream events (consumed by the API in W2-08)', async () => {
    const g = graphWith([reply('Full-time UK employees get 25 days of annual leave a year [S1].')]);
    const tokens: string[] = [];
    for await (const event of g.streamEvents(
      { ...newTurn(turnInput('g3')), ...presets },
      { ...threadConfig('g3'), version: 'v2' },
    )) {
      if (event.event === 'on_chat_model_stream' && event.metadata?.langgraph_node === 'answer') {
        tokens.push(String(event.data.chunk?.content ?? ''));
      }
    }
    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens.join('')).toContain('25 days of annual leave');
  });
});

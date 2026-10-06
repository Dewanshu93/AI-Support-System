// AI workflow tests for W2-07: clarify (P-4), out-of-scope and sensitive
// handoff, and the "no generation beyond P-1" acceptance. Fake models only.
import { loadConfig } from '../../src/config';
import { TEMPLATE_PLACEHOLDERS, type TemplateName } from '../../src/config/schemas';
import { fillTemplate } from '../../src/domain/templates';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import { newTurn, type Output, type State, type StateUpdate } from '../../src/ai/graph/state';
import { compilePrecheckRules } from '../../src/ai/guards/precheckRules';
import { LlmError } from '../../src/ai/llm';
import { fakeChatHandle, type FakeReply } from '../../src/ai/llm/fakeModels';
import { createAnalyzeTurn } from '../../src/ai/nodes/analyzeTurn';
import { CLARIFY_FALLBACK, createClarify } from '../../src/ai/nodes/clarify';
import { createDecide } from '../../src/ai/nodes/decide';
import { createOutOfScope } from '../../src/ai/nodes/outOfScope';
import { createPrecheck } from '../../src/ai/nodes/precheck';
import { createRerankAssess } from '../../src/ai/nodes/rerankAssess';
import { createSensitiveHandoff } from '../../src/ai/nodes/sensitiveHandoff';
import { stubAnalysis, stubRetrieval } from '../../src/ai/nodes/stubs';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const prompts = loadPromptRegistry(config.prompts.active);
const templates = config.templates.templates;
const policy = { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 };
const out = (u: StateUpdate) => u.output as Output;

const input = (text: string, id = 'h1') => ({
  conversationId: id,
  userId: 'u1',
  userMessageId: `${id}-m`,
  assistantMessageId: `${id}-a`,
  text,
  forceEscalate: false,
});

function clarifyNode(replies: FakeReply[], nativeStructured = true) {
  const chat = fakeChatHandle(replies, { nativeStructured });
  const node = createClarify({
    prompts,
    chatFor: () => chat,
    policy,
    costs: config.models.costs,
    templates,
  });
  return { node, chat };
}

const ambiguousState = (reason = 'No device or system named') =>
  ({
    input: input('it is broken'),
    profile: null,
    analysis: { ...stubAnalysis('it is broken'), ambiguity: 'high', ambiguityReason: reason },
  }) as unknown as State;

describe('clarify node (P-4, ambiguity mode)', () => {
  it('asks the model question and traces the call', async () => {
    const { node, chat } = clarifyNode([
      JSON.stringify({
        question: 'What has stopped working: your laptop, an app, or access?',
        fieldsAsked: [],
      }),
    ]);
    const update = await node(ambiguousState());
    expect(out(update)).toEqual({
      text: 'What has stopped working: your laptop, an app, or access?',
      citations: [],
      uncovered: [],
      withdrawn: false,
    });
    const [system, human] = chat.model.calls[0]!.map((m) => String(m.content));
    expect(system).toContain('Mode: ambiguity');
    expect(human).toContain('<untrusted_question>\nit is broken\n</untrusted_question>');
    expect(human).toContain('What needs clarifying: No device or system named');
    const trace = update.trace as unknown as { llmCalls: { promptRef: string }[]; flags: string[] };
    expect(trace.llmCalls[0]!.promptRef).toBe(prompts.get('clarifying_question').ref);
    expect(trace.flags).toEqual([]);
  });

  it('invalid output twice → templated generic question', async () => {
    const tooLong = 'word '.repeat(45);
    const { node, chat } = clarifyNode(
      [
        JSON.stringify({ question: tooLong, fieldsAsked: [] }),
        JSON.stringify({ question: '', fieldsAsked: [] }),
      ],
      false,
    );
    const update = await node(ambiguousState());
    expect(chat.model.calls).toHaveLength(2);
    expect(out(update).text).toBe(fillTemplate(templates.clarify_generic));
    expect((update.trace as unknown as { flags: string[] }).flags).toEqual([CLARIFY_FALLBACK]);
  });

  it('provider failure → templated question without a retry', async () => {
    const { node, chat } = clarifyNode([new LlmError('timeout', 'slow'), 'unused']);
    const update = await node(ambiguousState());
    expect(chat.model.calls).toHaveLength(1);
    expect(out(update).text).toBe(fillTemplate(templates.clarify_generic));
  });

  it('works without an ambiguity reason', async () => {
    const { node, chat } = clarifyNode([
      JSON.stringify({ question: 'Which system?', fieldsAsked: [] }),
    ]);
    await node(ambiguousState(''));
    expect(String(chat.model.calls[0]![1]!.content)).toContain('too vague to search or act on');
  });
});

describe('out-of-scope and sensitive handoff nodes', () => {
  const secret = 'CONFIDENTIAL-POLICY-PARAGRAPH-1234';
  const withContext = {
    input: input('x'),
    retrieval: {
      ...stubRetrieval('q'),
      context: [{ ...stubRetrieval('q').context[0]!, text: secret }],
    },
    precheckResult: { sensitiveHit: true, safetyHit: false, matchedRules: ['harassment'] },
    analysis: null,
  } as unknown as State;

  it('out of scope: the fixed template, no citations', () => {
    const update = createOutOfScope({ templates })(withContext);
    expect(out(update)).toEqual({
      text: templates.out_of_scope,
      citations: [],
      uncovered: [],
      withdrawn: false,
      handoff: { kind: 'out_of_scope' },
    });
  });

  it('sensitive: contact, private-contact offer, and never any retrieved text', () => {
    const update = createSensitiveHandoff({ templates, routing: config.routing })(withContext);
    const o = out(update);
    expect(o.text).toContain(templates.sensitive_contact);
    expect(o.text.trim().endsWith('Would you like HR to contact you privately?')).toBe(true);
    expect(o.handoff).toEqual({
      kind: 'sensitive',
      contact: templates.sensitive_contact,
      offerPrivateContact: true,
    });
    expect(o.citations).toEqual([]);
    expect(JSON.stringify(update)).not.toContain(secret);
  });
});

describe('templates.yaml rendering', () => {
  it.each(Object.entries(TEMPLATE_PLACEHOLDERS))(
    '%s renders with its placeholders',
    (name, keys) => {
      const values = Object.fromEntries(keys.map((k) => [k, `<${k}>`]));
      const text = fillTemplate(templates[name as TemplateName], values);
      expect(text).not.toMatch(/[{}]/);
      for (const k of keys) expect(text).toContain(`<${k}>`);
    },
  );
});

describe('acceptance: sensitive and out-of-scope replies make no generation call beyond P-1', () => {
  const rules = compilePrecheckRules(config.sensitive, config.priorityRules);

  /** Real precheck, P-1, rerank (P-2), decide and templates, all on one counting fake model. */
  function graphWith(replies: FakeReply[]) {
    const chat = fakeChatHandle(replies, { nativeStructured: true });
    const llm = { prompts, chatFor: () => chat, policy, costs: config.models.costs };
    const graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: {
        precheck: createPrecheck(rules),
        analyzeTurn: createAnalyzeTurn({ ...llm, taxonomy: config.taxonomy }),
        rerankAssess: createRerankAssess({ ...llm, retrieval: config.thresholds.retrieval }),
        decide: createDecide(config.thresholds.decision),
        outOfScope: createOutOfScope({ templates }),
        sensitiveHandoff: createSensitiveHandoff({ templates, routing: config.routing }),
      },
    });
    return { graph, chat };
  }
  const analysis = (over: object) =>
    JSON.stringify({
      intent: 'question',
      domain: 'HR',
      category: 'none',
      urgency: 'low',
      urgencyReason: 'n/a',
      sensitivity: 'none',
      ambiguity: 'low',
      searchQuery: 'q',
      ...over,
    });
  const run = async (g: ReturnType<typeof graphWith>['graph'], text: string, id: string) =>
    (await g.invoke(newTurn(input(text, id)), threadConfig(id))) as State;

  it('sensitive keyword: zero LLM calls', async () => {
    const { graph, chat } = graphWith([]);
    const s = await run(graph, 'I am being bullied by my team lead', 'acc-1');
    expect(chat.model.calls).toHaveLength(0);
    expect(s.output?.handoff?.kind).toBe('sensitive');
  });

  it('sensitive by analysis: exactly one call (P-1)', async () => {
    const { graph, chat } = graphWith([
      analysis({ sensitivity: 'sensitive', sensitivityReason: 'family' }),
    ]);
    const s = await run(graph, 'Something happened at home and I need time', 'acc-2');
    expect(chat.model.calls).toHaveLength(1);
    expect(s.trace.llmCalls.map((c) => c.node)).toEqual(['analyzeTurn']);
    expect(s.output?.handoff?.kind).toBe('sensitive');
  });

  it('out of scope: exactly one call (P-1); no retrieval, no P-2', async () => {
    const { graph, chat } = graphWith([analysis({ intent: 'out_of_scope', domain: 'unknown' })]);
    const s = await run(graph, 'Recommend a pizza place near the office', 'acc-3');
    expect(chat.model.calls).toHaveLength(1);
    expect(s.trace.steps.map((x) => x.node)).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'decide',
      'outOfScope',
      'persist',
    ]);
    expect(s.decision).toMatchObject({ value: 'OUT_OF_SCOPE', reasonCode: 'OUT_OF_SCOPE' });
    expect(s.output?.text).toBe(templates.out_of_scope);
  });

  // DoD: the sensitive path never includes retrieved policy text, even when it is
  // reached after retrieval (decision SENSITIVE_HANDOFF).
  it('a sensitive decision after retrieval still shows no retrieved text', async () => {
    const secret = 'Internal grievance procedure step 4: confidential';
    const graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: { sensitiveHandoff: createSensitiveHandoff({ templates, routing: config.routing }) },
    });
    const id = 'acc-4';
    const s = (await graph.invoke(
      {
        ...newTurn(input('x', id)),
        retrieval: {
          ...stubRetrieval('q'),
          context: [{ ...stubRetrieval('q').context[0]!, text: secret }],
        },
        decision: {
          value: 'SENSITIVE_HANDOFF',
          reasonCode: 'SENSITIVE_TOPIC',
          rulesFired: ['sensitive'],
        },
      },
      threadConfig(id),
    )) as State;
    expect(s.trace.steps.map((x) => x.node)).toContain('rerankAssess');
    expect(s.output?.text).not.toContain(secret);
    expect(s.output?.citations).toEqual([]);
  });
});

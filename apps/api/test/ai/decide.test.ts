// AI workflow tests for W2-05: the real decide node inside the graph, steered by
// preset analysis / precheck / retrieval (the other nodes are stubs).
import { loadConfig } from '../../src/config';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import { newTurn, type State, type StateUpdate } from '../../src/ai/graph/state';
import { createDecide, decisionInput } from '../../src/ai/nodes/decide';
import { stubAnalysis, stubRetrieval } from '../../src/ai/nodes/stubs';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const thresholds = config.thresholds.decision;

const input = (id: string, text = 'How many days of leave do I get?') => ({
  conversationId: id,
  userId: 'u1',
  userMessageId: `${id}-m`,
  assistantMessageId: `${id}-a`,
  text,
  forceEscalate: false,
});

function graph() {
  return buildSupportGraph({
    checkpointer: createMemoryCheckpointer(),
    nodes: { decide: createDecide(thresholds) },
  });
}

async function run(g: ReturnType<typeof graph>, id: string, presets: StateUpdate = {}) {
  const state = (await g.invoke({ ...newTurn(input(id)), ...presets }, threadConfig(id))) as State;
  return { state, path: state.trace.steps.map((s) => s.node) };
}

const retrieval = (topRelevance: number, coverage: 'full' | 'partial' | 'none' | 'unknown') => ({
  ...stubRetrieval('q'),
  topRelevance,
  coverage,
});

describe('decide node in the graph', () => {
  it.each<[string, StateUpdate, string, string, string]>([
    ['strong evidence', { retrieval: retrieval(3, 'full') }, 'ANSWER', 'EVIDENCE_STRONG', 'answer'],
    [
      'partial evidence',
      { retrieval: retrieval(1, 'partial') },
      'PARTIAL',
      'EVIDENCE_PARTIAL',
      'answer',
    ],
    ['no evidence', { retrieval: retrieval(0, 'none') }, 'ESCALATE', 'NO_EVIDENCE', 'slotFill'],
    [
      'rerank fallback',
      { retrieval: retrieval(3, 'unknown') },
      'ESCALATE',
      'NO_EVIDENCE',
      'slotFill',
    ],
    [
      'out of scope',
      { analysis: { ...stubAnalysis('pizza'), intent: 'out_of_scope' } },
      'OUT_OF_SCOPE',
      'OUT_OF_SCOPE',
      'outOfScope',
    ],
    [
      'request action',
      { analysis: { ...stubAnalysis('access'), intent: 'request_action' } },
      'ESCALATE',
      'ACTION_REQUIRED',
      'slotFill',
    ],
    [
      'safety hit',
      {
        precheckResult: { sensitiveHit: false, safetyHit: true, matchedRules: ['safety_battery'] },
      },
      'ESCALATE',
      'SAFETY',
      'answer',
    ],
    [
      'ambiguous',
      { analysis: { ...stubAnalysis('it is broken'), ambiguity: 'high' } },
      'CLARIFY',
      'AMBIGUOUS',
      'clarify',
    ],
  ])('%s → %s / %s → %s', async (label, presets, value, reasonCode, next) => {
    const { state, path } = await run(graph(), label.replace(/\s/g, '-'), presets);
    expect(state.decision).toMatchObject({ value, reasonCode });
    expect(path[path.indexOf('decide') + 1]).toBe(next);
  });

  it('records the rule inputs, the rules fired and a thresholds snapshot in the trace', async () => {
    const { state } = await run(graph(), 'trace-1', { retrieval: retrieval(3, 'full') });
    expect(state.trace.outputs.decision).toEqual({
      value: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      rulesFired: ['evidence_strong', 'evidence_partial', 'no_evidence'],
      input: expect.objectContaining({ topRelevance: 3, coverage: 'full', topicClarified: false }),
      thresholds,
    });
  });

  it('a safety escalation answers with safety steps and then drafts a ticket', async () => {
    const { state, path } = await run(graph(), 'safety-1', {
      precheckResult: { sensitiveHit: false, safetyHit: true, matchedRules: ['safety_battery'] },
    });
    expect(state.output?.mode).toBe('safety_steps');
    expect(path.slice(-4)).toEqual(['validateCitations', 'slotFill', 'buildDraft', 'persist']);
  });
});

describe('one clarification per topic (across turns)', () => {
  it('clarifies once, then answers the still-ambiguous follow-up, then may clarify a new topic', async () => {
    const g = graph();
    const id = 'clarify-topic';
    const ambiguous = { analysis: { ...stubAnalysis('it is broken'), ambiguity: 'high' as const } };

    const first = await run(g, id, ambiguous);
    expect(first.state.decision?.value).toBe('CLARIFY');
    expect(first.state.topicClarified).toBe(true);

    // The reply is still judged ambiguous, but we already asked once: use the evidence.
    const second = await run(g, id, { ...ambiguous, retrieval: retrieval(3, 'full') });
    expect(second.state.decision?.value).toBe('ANSWER');
    expect(second.state.decision?.rulesFired).not.toContain('ambiguous');
    expect(second.state.topicClarified).toBe(false);

    const third = await run(g, id, ambiguous);
    expect(third.state.decision?.value).toBe('CLARIFY');
  });
});

describe('decisionInput', () => {
  it('treats missing upstream results as "nothing found"', () => {
    expect(decisionInput({ input: input('x'), topicClarified: false } as unknown as State)).toEqual(
      {
        sensitiveHit: false,
        safetyHit: false,
        sensitivity: 'none',
        intent: 'question',
        ambiguity: 'low',
        forceEscalate: false,
        topicClarified: false,
        topRelevance: 0,
        coverage: 'unknown',
      },
    );
  });
});

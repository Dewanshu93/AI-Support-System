import { END } from '@langchain/langgraph';
import type { Decision } from '@sd/shared';
import { stubAnalysis } from '../nodes/stubs';
import {
  routeAfterAnalysis,
  routeAfterConfirmation,
  routeAfterPersist,
  routeAfterSlotFill,
  routeByDecision,
} from './edges';
import { EMPTY_TICKET_FLOW, EMPTY_TRACE, type State, traceReducer } from './state';

const base = {
  input: {
    conversationId: 'c',
    userId: 'u',
    userMessageId: 'm1',
    assistantMessageId: 'm2',
    text: 'hi',
    forceEscalate: false,
  },
  ticketFlow: EMPTY_TICKET_FLOW,
  analysis: stubAnalysis('hi'),
} as unknown as State;
const at = (over: Partial<State>) => ({ ...base, ...over }) as State;

describe('routeByDecision', () => {
  it.each<[Decision, string, string]>([
    ['ANSWER', 'EVIDENCE_STRONG', 'answer'],
    ['PARTIAL', 'EVIDENCE_PARTIAL', 'answer'],
    ['CLARIFY', 'AMBIGUOUS', 'clarify'],
    ['ESCALATE', 'SAFETY', 'answer'],
    ['ESCALATE', 'USER_REQUESTED', 'slotFill'],
    ['ESCALATE', 'NO_EVIDENCE', 'slotFill'],
    ['OUT_OF_SCOPE', 'OUT_OF_SCOPE', 'outOfScope'],
    ['SENSITIVE_HANDOFF', 'SENSITIVE_TOPIC', 'sensitiveHandoff'],
  ])('%s / %s → %s', (value, reasonCode, target) => {
    expect(routeByDecision(at({ decision: { value, reasonCode, rulesFired: [] } }))).toBe(target);
  });

  it('throws if decide did not run', () => {
    expect(() => routeByDecision(at({ decision: null }))).toThrow('did not set state.decision');
  });
});

describe('routeAfterAnalysis', () => {
  it('sensitivity wins over an active ticket flow', () => {
    const state = at({
      analysis: { ...stubAnalysis('x'), sensitivity: 'sensitive' },
      ticketFlow: { ...EMPTY_TICKET_FLOW, active: true },
    });
    expect(routeAfterAnalysis(state)).toBe('sensitiveHandoff');
  });

  it('active ticket flow or forceEscalate → slotFill; otherwise retrieve', () => {
    expect(routeAfterAnalysis(at({ ticketFlow: { ...EMPTY_TICKET_FLOW, active: true } }))).toBe(
      'slotFill',
    );
    expect(routeAfterAnalysis(at({ input: { ...base.input, forceEscalate: true } }))).toBe(
      'slotFill',
    );
    expect(routeAfterAnalysis(base)).toBe('retrieve');
  });
});

describe('routeAfterAnalysis: out of scope (ADR-009)', () => {
  const oos = { ...stubAnalysis('pizza'), intent: 'out_of_scope' as const };
  it('goes straight to decide, skipping retrieval and P-2', () => {
    expect(routeAfterAnalysis(at({ analysis: oos }))).toBe('decide');
  });
  it('sensitivity and an active ticket flow still take precedence', () => {
    expect(routeAfterAnalysis(at({ analysis: { ...oos, sensitivity: 'sensitive' } }))).toBe(
      'sensitiveHandoff',
    );
    expect(
      routeAfterAnalysis(at({ analysis: oos, ticketFlow: { ...EMPTY_TICKET_FLOW, active: true } })),
    ).toBe('slotFill');
  });
});

describe('routeAfterSlotFill', () => {
  it.each([
    [['device'], 0, 'clarifyForTicket'],
    [['device'], 1, 'clarifyForTicket'],
    [['device'], 2, 'buildDraft'],
    [[], 0, 'buildDraft'],
  ])('missing %j after %i rounds → %s', (requiredMissing, clarifyRounds, target) => {
    const state = at({
      ticketFlow: { ...EMPTY_TICKET_FLOW, active: true, requiredMissing, clarifyRounds },
    });
    expect(routeAfterSlotFill(state)).toBe(target);
  });
});

describe('routeAfterPersist and routeAfterConfirmation', () => {
  const draft = { domain: 'IT' as const, category: 'network', summary: 's', fields: {} };
  const output = { text: '', citations: [], uncovered: [], withdrawn: false };

  it('pauses only for an unconfirmed draft', () => {
    expect(routeAfterPersist(at({ output: { ...output, draft } }))).toBe('awaitConfirmation');
    expect(routeAfterPersist(at({ output: { ...output, draft, ticketId: 't' } }))).toBe(END);
    expect(routeAfterPersist(at({ output }))).toBe(END);
  });

  it('confirm → createTicket; cancel → END', () => {
    expect(routeAfterConfirmation(at({ confirmation: { action: 'confirm' } }))).toBe(
      'createTicket',
    );
    expect(routeAfterConfirmation(at({ confirmation: { action: 'cancel' } }))).toBe(END);
  });
});

describe('traceReducer', () => {
  it('appends steps and sums latency per node; reset clears', () => {
    const one = traceReducer(EMPTY_TRACE, {
      steps: [{ node: 'a', latencyMs: 2 }],
      stepLatencyMs: { a: 2 },
    });
    const two = traceReducer(one, {
      steps: [{ node: 'a', latencyMs: 3 }],
      stepLatencyMs: { a: 3 },
    });
    expect(two.steps).toHaveLength(2);
    expect(two.stepLatencyMs).toEqual({ a: 5 });
    expect(traceReducer(two, { reset: true })).toEqual(EMPTY_TRACE);
  });
});

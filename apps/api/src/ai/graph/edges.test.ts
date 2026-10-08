import { END } from '@langchain/langgraph';
import type { Decision } from '@sd/shared';
import { stubAnalysis } from '../nodes/stubs';
import {
  routeAfterAnalysis,
  routeAfterConfirmation,
  routeAfterKnowledge,
  routeAfterPayrollExplain,
  routeAfterPayrollRecords,
  routeAfterPersist,
  routeAfterSlotFill,
  routeByDecision,
  routeKnowledgeStart,
  routeTimesheetStart,
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
    // Escalations and handoffs leave the knowledge agent; the orchestrator routes them.
    ['ESCALATE', 'USER_REQUESTED', END],
    ['ESCALATE', 'NO_EVIDENCE', END],
    ['OUT_OF_SCOPE', 'OUT_OF_SCOPE', 'outOfScope'],
    ['SENSITIVE_HANDOFF', 'SENSITIVE_TOPIC', END],
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

  it('active ticket flow or forceEscalate → escalationAgent; otherwise knowledgeAgent', () => {
    expect(routeAfterAnalysis(at({ ticketFlow: { ...EMPTY_TICKET_FLOW, active: true } }))).toBe(
      'escalationAgent',
    );
    expect(routeAfterAnalysis(at({ input: { ...base.input, forceEscalate: true } }))).toBe(
      'escalationAgent',
    );
    expect(routeAfterAnalysis(base)).toBe('knowledgeAgent');
  });
});

describe('out of scope (ADR-009)', () => {
  const oos = { ...stubAnalysis('pizza'), intent: 'out_of_scope' as const };
  it('the knowledge agent goes straight to decide, skipping retrieval and P-2', () => {
    expect(routeAfterAnalysis(at({ analysis: oos }))).toBe('knowledgeAgent');
    expect(routeKnowledgeStart(at({ analysis: oos }))).toBe('decide');
    expect(routeKnowledgeStart(base)).toBe('retrieve');
  });
  it('sensitivity and an active ticket flow still take precedence', () => {
    expect(routeAfterAnalysis(at({ analysis: { ...oos, sensitivity: 'sensitive' } }))).toBe(
      'sensitiveHandoff',
    );
    expect(
      routeAfterAnalysis(at({ analysis: oos, ticketFlow: { ...EMPTY_TICKET_FLOW, active: true } })),
    ).toBe('escalationAgent');
  });
});

describe('intent router (UC-04)', () => {
  const withIntent = (workspaceIntent: string) =>
    at({ analysis: { ...stubAnalysis('x'), workspaceIntent } as State['analysis'] });

  it.each([
    ['timesheet_log', 'timesheetAgent'],
    ['timesheet_status', 'timesheetAgent'],
    ['request_status', 'requestsAgent'],
    ['payroll_explain', 'payrollAgent'],
    ['none', 'knowledgeAgent'],
  ])('workspaceIntent %s → %s', (intent, agent) => {
    expect(routeAfterAnalysis(withIntent(intent))).toBe(agent);
  });

  it('a P-1 v1 analysis (no workspaceIntent) goes to the knowledge agent', () => {
    expect(routeAfterAnalysis(base)).toBe('knowledgeAgent');
  });

  it('sensitivity and an active ticket flow win over a workspace intent', () => {
    const sensitive = at({
      analysis: {
        ...stubAnalysis('x'),
        sensitivity: 'sensitive',
        workspaceIntent: 'timesheet_status',
      },
    });
    expect(routeAfterAnalysis(sensitive)).toBe('sensitiveHandoff');
    const answeringTicket = at({
      ...withIntent('request_status'),
      ticketFlow: { ...EMPTY_TICKET_FLOW, active: true },
    });
    expect(routeAfterAnalysis(answeringTicket)).toBe('escalationAgent');
  });

  it('the timesheet agent logs or reports by intent', () => {
    expect(routeTimesheetStart(withIntent('timesheet_log'))).toBe('timesheetLog');
    expect(routeTimesheetStart(withIntent('timesheet_status'))).toBe('timesheetStatus');
  });
});

describe('routeAfterKnowledge', () => {
  const output = { text: 't', citations: [], uncovered: [], withdrawn: false };
  const d = (value: Decision, reasonCode: string) => ({ value, reasonCode, rulesFired: [] });
  it.each<[string, Partial<State>, string]>([
    ['answer', { decision: d('ANSWER', 'EVIDENCE_STRONG'), output }, 'persist'],
    [
      'escalation decided',
      { decision: d('ESCALATE', 'NO_EVIDENCE'), output: null },
      'escalationAgent',
    ],
    [
      'safety steps given',
      { decision: d('ESCALATE', 'SAFETY'), output: { ...output, mode: 'safety_steps' } },
      'escalationAgent',
    ],
    [
      'withdrawn answer',
      { decision: d('ESCALATE', 'CITATION_INVALID'), output: { ...output, withdrawn: true } },
      'persist',
    ],
    [
      'sensitive',
      { decision: d('SENSITIVE_HANDOFF', 'SENSITIVE_TOPIC'), output: null },
      'sensitiveHandoff',
    ],
  ])('%s → %s', (_name, over, target) => {
    expect(routeAfterKnowledge(at(over))).toBe(target);
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
  const draft = {
    domain: 'IT' as const,
    category: 'network',
    subcategory: null,
    queue: { id: 'it_software', label: 'IT Software' },
    priority: 'medium' as const,
    aiUrgency: 'medium' as const,
    priorityFloorApplied: null,
    impactScope: 'me' as const,
    summary: 's',
    description: 'd',
    alreadyTried: [],
    errorMessages: [],
    fields: {},
    aiFilledFields: [],
    requiredMissing: [],
    articlesShown: [],
    restricted: false,
    recordFilledFields: [],
  };
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

  it('merges a subgraph snapshot that extends the trace instead of appending it (ADR-016)', () => {
    const before = traceReducer(EMPTY_TRACE, {
      steps: [{ node: 'analyzeTurn', latencyMs: 4 }],
      stepLatencyMs: { analyzeTurn: 4 },
      outputs: { analysis: 1 },
    });
    const snapshot = {
      ...before,
      steps: [...before.steps, { node: 'retrieve', latencyMs: 2 }],
      stepLatencyMs: { analyzeTurn: 4, retrieve: 2 },
      outputs: { retrieval: 2 },
    };
    const merged = traceReducer(before, snapshot);
    expect(merged.steps.map((s) => s.node)).toEqual(['analyzeTurn', 'retrieve']);
    expect(merged.stepLatencyMs).toEqual({ analyzeTurn: 4, retrieve: 2 });
    expect(merged.outputs).toEqual({ analysis: 1, retrieval: 2 });
  });

  it('a single-node update identical to the trace is appended, not merged', () => {
    const one = { steps: [{ node: 'a', latencyMs: 0 }], stepLatencyMs: { a: 0 } };
    expect(traceReducer(traceReducer(EMPTY_TRACE, one), one).steps).toHaveLength(2);
  });
});

describe('routeAfterPayrollRecords (UC-06)', () => {
  const facts = { paidByAgency: false, currency: 'USD' as const, payslips: [], lopDays: [] };
  it('searches the policy for employees with records; ends for contractors or a fixed reply', () => {
    expect(routeAfterPayrollRecords(at({ payroll: facts, output: null }))).toBe('retrieve');
    expect(
      routeAfterPayrollRecords(at({ payroll: { ...facts, paidByAgency: true }, output: null })),
    ).toBe(END);
    const output = { text: 'unavailable', citations: [], uncovered: [], withdrawn: false };
    expect(routeAfterPayrollRecords(at({ payroll: null, output }))).toBe(END);
  });
});

describe('routeAfterPayrollExplain (UC-06)', () => {
  const out = (text: string) => ({ text, citations: [], uncovered: [], withdrawn: false });
  it('checks a written explanation; composes directly when there is none', () => {
    expect(routeAfterPayrollExplain(at({ output: out('Policy [S1].') }))).toBe('validateCitations');
    expect(routeAfterPayrollExplain(at({ output: out('') }))).toBe('payrollCompose');
    expect(routeAfterPayrollExplain(at({ output: null }))).toBe('payrollCompose');
  });
});

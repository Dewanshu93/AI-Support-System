// AI workflow tests for supportTurnGraph (W2-02). Stub nodes keep values preset
// in state, so each test steers the run to one terminal path by setting state
// and asserts the exact node sequence from the trace.
import fs from 'node:fs';
import path from 'node:path';
import { Command } from '@langchain/langgraph';
import { REPO_ROOT } from '../../src/config';
import { threadConfig, createMemoryCheckpointer } from '../../src/ai/graph/checkpointer';
import {
  AGENTS,
  buildSupportGraph,
  DEFAULT_NODES,
  type SupportGraph,
  supportGraphMermaid,
} from '../../src/ai/graph/graph';
import {
  type DecisionResult,
  EMPTY_TICKET_FLOW,
  newTurn,
  type State,
  type StateUpdate,
  type TurnInput,
} from '../../src/ai/graph/state';
import { stubAnalysis } from '../../src/ai/nodes/stubs';
import { createRequestStatus } from '../../src/ai/nodes/workspaceAgents';

const input = (over: Partial<TurnInput> = {}): TurnInput => ({
  conversationId: 'conv-1',
  userId: 'user-1',
  userMessageId: 'm-1',
  assistantMessageId: 'm-2',
  text: 'My VPN keeps disconnecting',
  forceEscalate: false,
  ...over,
});

const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: [],
});

const START_PATH = ['loadContext', 'precheck', 'analyzeTurn'];
const RETRIEVAL_PATH = [...START_PATH, 'retrieve', 'rerankAssess', 'decide'];

let graph: SupportGraph;
let thread = 0;
beforeEach(() => {
  graph = buildSupportGraph({ checkpointer: createMemoryCheckpointer() });
  thread += 1;
});

async function run(presets: StateUpdate = {}, over: Partial<TurnInput> = {}, id = `t${thread}`) {
  const state = (await graph.invoke(
    { ...newTurn(input({ conversationId: id, ...over })), ...presets },
    threadConfig(id),
  )) as State;
  return { state, path: state.trace.steps.map((s) => s.node), id };
}

async function pendingInterrupt(id: string) {
  const snapshot = await graph.getState(threadConfig(id));
  return { next: snapshot.next, value: snapshot.tasks[0]?.interrupts[0]?.value };
}

describe('supportTurnGraph topology', () => {
  it('compiles the orchestrator with one node per agent subgraph (UC-04)', async () => {
    const nodes = Object.keys((await graph.getGraphAsync()).nodes);
    const inAgents = new Set<string>(Object.values(AGENTS).flat());
    const orchestrator = Object.keys(DEFAULT_NODES).filter((n) => !inAgents.has(n));
    expect(nodes.sort()).toEqual(
      ['__end__', '__start__', ...orchestrator, ...Object.keys(AGENTS)].sort(),
    );
  });

  it('places every node in exactly one agent or the orchestrator', async () => {
    const all = Object.values(AGENTS).flat();
    expect(new Set(all).size).toBe(all.length);
    const xray = Object.keys((await graph.getGraphAsync({ xray: true })).nodes);
    for (const [agent, inner] of Object.entries(AGENTS)) {
      for (const n of inner) {
        // A one-node agent is drawn as the agent itself.
        expect(xray.includes(`${agent}:${n}`) || (inner.length === 1 && xray.includes(agent))).toBe(
          true,
        );
      }
    }
  });

  it('ARCHITECTURE.md shows the current Mermaid export', async () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
    expect(doc.replace(/\r\n/g, '\n')).toContain((await supportGraphMermaid()).trim());
  });
});

describe('terminal paths', () => {
  it('precheck sensitive hit → sensitiveHandoff, no analysis', async () => {
    const { state, path } = await run({
      precheckResult: { sensitiveHit: true, safetyHit: false, matchedRules: ['harassment'] },
    });
    expect(path).toEqual(['loadContext', 'precheck', 'sensitiveHandoff', 'persist']);
    expect(state.analysis).toBeNull();
    expect(state.output?.handoff?.kind).toBe('sensitive');
  });

  it('analysis marks the turn sensitive → sensitiveHandoff, no retrieval', async () => {
    const { state, path } = await run({
      analysis: { ...stubAnalysis('x'), sensitivity: 'sensitive' },
    });
    expect(path).toEqual([...START_PATH, 'sensitiveHandoff', 'persist']);
    expect(state.retrieval).toBeNull();
  });

  it('ANSWER → answer → validateCitations → persist', async () => {
    const { state, path } = await run({ decision: decision('ANSWER', 'EVIDENCE_STRONG') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'answer', 'validateCitations', 'persist']);
    expect(state.output).toMatchObject({ mode: 'answer', withdrawn: false });
  });

  it('PARTIAL → answer in partial mode', async () => {
    const { state, path } = await run({ decision: decision('PARTIAL', 'EVIDENCE_PARTIAL') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'answer', 'validateCitations', 'persist']);
    expect(state.output?.mode).toBe('partial');
  });

  it('withdrawn answer → persist with ESCALATE / CITATION_INVALID recorded', async () => {
    const { state, path } = await run({
      decision: decision('ANSWER', 'EVIDENCE_STRONG'),
      output: { text: 'No markers', citations: [], uncovered: [], withdrawn: true },
    });
    expect(path).toEqual([...RETRIEVAL_PATH, 'answer', 'validateCitations', 'persist']);
    expect(state.decision).toMatchObject({ value: 'ESCALATE', reasonCode: 'CITATION_INVALID' });
  });

  it('CLARIFY → clarify → persist', async () => {
    const { path } = await run({ decision: decision('CLARIFY', 'AMBIGUOUS') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'clarify', 'persist']);
  });

  it('OUT_OF_SCOPE → outOfScope → persist', async () => {
    const { state, path } = await run({ decision: decision('OUT_OF_SCOPE', 'OUT_OF_SCOPE') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'outOfScope', 'persist']);
    expect(state.output?.handoff?.kind).toBe('out_of_scope');
  });

  it('SENSITIVE_HANDOFF decision → sensitiveHandoff → persist', async () => {
    const { path } = await run({ decision: decision('SENSITIVE_HANDOFF', 'SENSITIVE_TOPIC') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'sensitiveHandoff', 'persist']);
  });

  it('ESCALATE → slotFill → buildDraft → persist, then pauses for confirmation', async () => {
    const { state, path, id } = await run({ decision: decision('ESCALATE', 'ACTION_REQUIRED') });
    expect(path).toEqual([...RETRIEVAL_PATH, 'slotFill', 'buildDraft', 'persist']);
    expect(state.ticketFlow.active).toBe(true);
    const pending = await pendingInterrupt(id);
    expect(pending.next).toEqual(['awaitConfirmation']);
    expect(pending.value).toEqual({ draft: state.output?.draft });
  });

  it('ESCALATE with safety → safety-steps answer, then the ticket draft', async () => {
    const { state, path, id } = await run({ decision: decision('ESCALATE', 'SAFETY') });
    expect(path).toEqual([
      ...RETRIEVAL_PATH,
      'answer',
      'validateCitations',
      'slotFill',
      'buildDraft',
      'persist',
    ]);
    expect(state.output).toMatchObject({ mode: 'safety_steps', text: 'Stub answer [S1].' });
    expect(state.output?.draft).toBeDefined();
    expect((await pendingInterrupt(id)).next).toEqual(['awaitConfirmation']);
  });

  it('forceEscalate skips retrieval and goes straight to slotFill', async () => {
    const { path } = await run({}, { forceEscalate: true });
    expect(path).toEqual([...START_PATH, 'slotFill', 'buildDraft', 'persist']);
  });
});

describe('confirmation (interrupt and resume)', () => {
  async function resume(id: string, value: unknown) {
    return (await graph.invoke(new Command({ resume: value }), threadConfig(id))) as State;
  }

  it('confirm → createTicket → agentSummary → END', async () => {
    const { id } = await run({}, { forceEscalate: true });
    const state = await resume(id, { action: 'confirm' });
    expect(state.trace.steps.map((s) => s.node).slice(-3)).toEqual([
      'awaitConfirmation',
      'createTicket',
      'agentSummary',
    ]);
    expect(state.output?.ticketId).toBe('stub-ticket');
    expect(state.ticketFlow).toEqual(EMPTY_TICKET_FLOW);
    expect((await pendingInterrupt(id)).next).toEqual([]);
  });

  it('cancel → END with the ticket flow reset and no ticket', async () => {
    const { id } = await run({}, { forceEscalate: true });
    const state = await resume(id, { action: 'cancel' });
    expect(state.trace.steps.at(-1)?.node).toBe('awaitConfirmation');
    expect(state.output?.ticketId).toBeUndefined();
    expect(state.ticketFlow).toEqual(EMPTY_TICKET_FLOW);
    expect((await pendingInterrupt(id)).next).toEqual([]);
  });

  it('rejects a malformed resume value', async () => {
    const { id } = await run({}, { forceEscalate: true });
    await expect(resume(id, { action: 'maybe' })).rejects.toThrow();
  });
});

describe('state across turns (checkpointer)', () => {
  it('asks for missing ticket fields at most twice, then drafts anyway', async () => {
    const id = `multi-${thread}`;
    const first = await run(
      { ticketFlow: { ...EMPTY_TICKET_FLOW, requiredMissing: ['device', 'since'] } },
      { forceEscalate: true },
      id,
    );
    expect(first.path.slice(-3)).toEqual(['slotFill', 'clarifyForTicket', 'persist']);
    expect(first.state.output?.text).toBe('Stub question for device, since?');

    // Second turn: no presets; ticketFlow.active comes from the checkpoint.
    const second = await run({}, { text: 'A ThinkPad' }, id);
    expect(second.path).toEqual([...START_PATH, 'slotFill', 'clarifyForTicket', 'persist']);
    expect(second.state.ticketFlow.clarifyRounds).toBe(2);

    const third = await run({}, { text: 'Since Monday' }, id);
    expect(third.path).toEqual([...START_PATH, 'slotFill', 'buildDraft', 'persist']);
    expect((await pendingInterrupt(id)).next).toEqual(['awaitConfirmation']);
  });

  it('newTurn resets per-turn state and the trace; profile persists', async () => {
    const id = `reset-${thread}`;
    const first = await run({ decision: decision('CLARIFY', 'AMBIGUOUS') }, {}, id);
    expect(first.state.profile).not.toBeNull();
    const second = await run({}, { text: 'Second question' }, id);
    expect(second.state.decision?.value).toBe('ANSWER');
    expect(second.state.analysis?.searchQuery).toBe('Second question');
    expect(second.path).toEqual([...RETRIEVAL_PATH, 'answer', 'validateCitations', 'persist']);
    expect(second.state.profile).toEqual(first.state.profile);
  });
});

describe('agent subgraphs (UC-04)', () => {
  const withIntent = (workspaceIntent: string) => ({
    analysis: { ...stubAnalysis('x'), workspaceIntent } as State['analysis'],
  });

  it('timesheet_status → timesheetAgent → timesheetStatus → persist, no retrieval', async () => {
    const { state, path } = await run(withIntent('timesheet_status'));
    expect(path).toEqual([...START_PATH, 'timesheetStatus', 'persist']);
    expect(state.retrieval).toBeNull();
    expect(state.decision).toMatchObject({ value: 'ANSWER', reasonCode: 'RECORDS_TIMESHEET' });
  });

  it('timesheet_log → timesheetLog: points to the form and writes nothing (until UC-05)', async () => {
    const { state, path } = await run(withIntent('timesheet_log'));
    expect(path).toEqual([...START_PATH, 'timesheetLog', 'persist']);
    expect(state.output?.text).toContain('Open Timesheets');
    expect(state.decision?.reasonCode).toBe('TIMESHEET_ACTION_PENDING');
  });

  it('request_status → requestsAgent → requestStatus → persist', async () => {
    const { path } = await run(withIntent('request_status'));
    expect(path).toEqual([...START_PATH, 'requestStatus', 'persist']);
  });

  it('payroll_explain uses the knowledge agent until the payroll agent exists (UC-06)', async () => {
    const { path } = await run(withIntent('payroll_explain'));
    expect(path).toEqual([...RETRIEVAL_PATH, 'answer', 'validateCitations', 'persist']);
  });

  it('a sensitive turn never reaches an agent, whatever the workspace intent', async () => {
    const { path } = await run({
      analysis: {
        ...stubAnalysis('x'),
        sensitivity: 'sensitive',
        workspaceIntent: 'timesheet_status',
      },
    });
    expect(path).toEqual([...START_PATH, 'sensitiveHandoff', 'persist']);
  });

  it('records agents read only the requesting employee’s data', async () => {
    const calls: string[] = [];
    graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: {
        requestStatus: createRequestStatus({
          records: {
            today: () => '2026-10-07',
            days: async () => [],
            projects: async () => [],
            previewTimesheet: async () => ({ problems: [], entries: [] }),
            saveTimesheet: async () => ({ saved: 0 }),
            requests: async (userId) => {
              calls.push(userId);
              return [
                {
                  humanId: 'IT-9001',
                  summary: 'VPN',
                  status: 'in_progress',
                  department: 'IT Access',
                },
              ];
            },
          },
        }),
      },
    });
    const { state } = await run(withIntent('request_status'), { userId: 'employee-42' });
    expect(calls).toEqual(['employee-42']);
    expect(state.output?.text).toContain('IT-9001 — VPN (IT Access): Under review');
  });

  it('the trace lists each node once although agents return their whole state', async () => {
    const { state } = await run({ decision: decision('ANSWER', 'EVIDENCE_STRONG') });
    const nodes = state.trace.steps.map((s) => s.node);
    expect(new Set(nodes).size).toBe(nodes.length);
  });
});

describe('trace', () => {
  it('records a latency per step', async () => {
    const { state } = await run();
    expect(Object.keys(state.trace.stepLatencyMs).sort()).toEqual(
      [...new Set(state.trace.steps.map((s) => s.node))].sort(),
    );
    for (const step of state.trace.steps) expect(step.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('injected nodes replace stubs and are traced the same way', async () => {
    graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: { decide: () => ({ decision: decision('CLARIFY', 'AMBIGUOUS') }) },
    });
    const { path } = await run();
    expect(path).toEqual([...RETRIEVAL_PATH, 'clarify', 'persist']);
  });
});

describe('input validation', () => {
  it('newTurn rejects input outside the request schema', () => {
    expect(() => newTurn(input({ text: 'x'.repeat(2001) }))).toThrow();
    expect(() => newTurn(input({ text: '   ' }))).toThrow();
  });
});

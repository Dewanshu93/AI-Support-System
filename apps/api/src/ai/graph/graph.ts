// supportTurnGraph (playbook section 5; UC-04, ADR-016): the one orchestrator
// StateGraph that handles every copilot turn. It understands the turn, then a
// deterministic edge hands it to one agent subgraph:
//   knowledgeAgent  — HR and IT policy answers (retrieval, decision, grounded answer)
//   escalationAgent — ticket drafts (slot filling, clarification, draft)
//   timesheetAgent  — the employee's timesheet (status; log hours, confirmed by the employee)
//   requestsAgent   — the employee's requests
// Agents share the graph state and are compiled subgraphs, so their nodes stream
// and trace like any other node. Wiring only; nodes live in ai/nodes, routing in edges.ts.
import {
  type BaseCheckpointSaver,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { agentSummary } from '../nodes/agentSummary';
import { awaitConfirmation } from '../nodes/awaitConfirmation';
import {
  stubAnalyzeTurn,
  stubApplyAction,
  stubAnswer,
  stubBuildDraft,
  stubClarify,
  stubClarifyForTicket,
  stubCreateTicket,
  stubDecide,
  stubLoadContext,
  stubOutOfScope,
  stubPersist,
  stubPrecheck,
  stubRequestStatus,
  stubRerankAssess,
  stubRetrieve,
  stubSensitiveHandoff,
  stubSlotFill,
  stubTimesheetStatus,
  stubValidateCitations,
} from '../nodes/stubs';
import { timesheetLog } from '../nodes/workspaceAgents';
import { type NodeFn, traced } from '../tracing/traced';
import {
  AFTER_ANALYSIS,
  AFTER_CONFIRMATION,
  AFTER_KNOWLEDGE,
  AFTER_PERSIST,
  AFTER_PRECHECK,
  AFTER_SLOT_FILL,
  BY_DECISION,
  KNOWLEDGE_START,
  routeAfterAnalysis,
  routeAfterConfirmation,
  routeAfterKnowledge,
  routeAfterPersist,
  routeAfterPrecheck,
  routeAfterSlotFill,
  routeByDecision,
  routeKnowledgeStart,
  routeTimesheetStart,
  TIMESHEET_START,
} from './edges';
import { GraphState } from './state';

export const GRAPH_NAME = 'supportTurnGraph';

export const DEFAULT_NODES = {
  loadContext: stubLoadContext,
  precheck: stubPrecheck,
  analyzeTurn: stubAnalyzeTurn,
  retrieve: stubRetrieve,
  rerankAssess: stubRerankAssess,
  decide: stubDecide,
  answer: stubAnswer,
  validateCitations: stubValidateCitations,
  clarify: stubClarify,
  outOfScope: stubOutOfScope,
  sensitiveHandoff: stubSensitiveHandoff,
  slotFill: stubSlotFill,
  clarifyForTicket: stubClarifyForTicket,
  buildDraft: stubBuildDraft,
  timesheetStatus: stubTimesheetStatus,
  timesheetLog,
  requestStatus: stubRequestStatus,
  persist: stubPersist,
  awaitConfirmation,
  createTicket: stubCreateTicket,
  applyAction: stubApplyAction,
  agentSummary,
} satisfies Record<string, NodeFn>;
export type NodeName = keyof typeof DEFAULT_NODES;

/** Agent subgraphs and the nodes each one contains. */
export const AGENTS = {
  knowledgeAgent: [
    'retrieve',
    'rerankAssess',
    'decide',
    'answer',
    'validateCitations',
    'clarify',
    'outOfScope',
  ],
  escalationAgent: ['slotFill', 'clarifyForTicket', 'buildDraft'],
  timesheetAgent: ['timesheetStatus', 'timesheetLog'],
  requestsAgent: ['requestStatus'],
} as const satisfies Record<string, readonly NodeName[]>;
export type AgentName = keyof typeof AGENTS;

export interface SupportGraphOptions {
  checkpointer: BaseCheckpointSaver;
  /** Replaces individual nodes (tests, and real nodes as they are built). */
  nodes?: Partial<Record<NodeName, NodeFn>>;
}

export function buildSupportGraph({ checkpointer, nodes = {} }: SupportGraphOptions) {
  const node = (name: NodeName) => traced(name, nodes[name] ?? DEFAULT_NODES[name]);

  const knowledgeAgent = new StateGraph(GraphState)
    .addNode('retrieve', node('retrieve'))
    .addNode('rerankAssess', node('rerankAssess'))
    .addNode('decide', node('decide'))
    .addNode('answer', node('answer'))
    .addNode('validateCitations', node('validateCitations'))
    .addNode('clarify', node('clarify'))
    .addNode('outOfScope', node('outOfScope'))
    .addConditionalEdges(START, routeKnowledgeStart, [...KNOWLEDGE_START])
    .addEdge('retrieve', 'rerankAssess')
    .addEdge('rerankAssess', 'decide')
    .addConditionalEdges('decide', routeByDecision, [...BY_DECISION])
    .addEdge('answer', 'validateCitations')
    .addEdge('validateCitations', END)
    .addEdge('clarify', END)
    .addEdge('outOfScope', END)
    .compile({ name: 'knowledgeAgent' });

  const escalationAgent = new StateGraph(GraphState)
    .addNode('slotFill', node('slotFill'))
    .addNode('clarifyForTicket', node('clarifyForTicket'))
    .addNode('buildDraft', node('buildDraft'))
    .addEdge(START, 'slotFill')
    .addConditionalEdges('slotFill', routeAfterSlotFill, [...AFTER_SLOT_FILL])
    .addEdge('clarifyForTicket', END)
    .addEdge('buildDraft', END)
    .compile({ name: 'escalationAgent' });

  const timesheetAgent = new StateGraph(GraphState)
    .addNode('timesheetStatus', node('timesheetStatus'))
    .addNode('timesheetLog', node('timesheetLog'))
    .addConditionalEdges(START, routeTimesheetStart, [...TIMESHEET_START])
    .addEdge('timesheetStatus', END)
    .addEdge('timesheetLog', END)
    .compile({ name: 'timesheetAgent' });

  const requestsAgent = new StateGraph(GraphState)
    .addNode('requestStatus', node('requestStatus'))
    .addEdge(START, 'requestStatus')
    .addEdge('requestStatus', END)
    .compile({ name: 'requestsAgent' });

  return new StateGraph(GraphState)
    .addNode('loadContext', node('loadContext'))
    .addNode('precheck', node('precheck'))
    .addNode('analyzeTurn', node('analyzeTurn'))
    .addNode('knowledgeAgent', knowledgeAgent)
    .addNode('escalationAgent', escalationAgent)
    .addNode('timesheetAgent', timesheetAgent)
    .addNode('requestsAgent', requestsAgent)
    .addNode('sensitiveHandoff', node('sensitiveHandoff'))
    .addNode('persist', node('persist'))
    .addNode('awaitConfirmation', node('awaitConfirmation'))
    .addNode('createTicket', node('createTicket'))
    .addNode('applyAction', node('applyAction'))
    .addNode('agentSummary', node('agentSummary'))
    .addEdge(START, 'loadContext')
    .addEdge('loadContext', 'precheck')
    .addConditionalEdges('precheck', routeAfterPrecheck, [...AFTER_PRECHECK])
    .addConditionalEdges('analyzeTurn', routeAfterAnalysis, [...AFTER_ANALYSIS])
    .addConditionalEdges('knowledgeAgent', routeAfterKnowledge, [...AFTER_KNOWLEDGE])
    .addEdge('escalationAgent', 'persist')
    .addEdge('timesheetAgent', 'persist')
    .addEdge('requestsAgent', 'persist')
    .addEdge('sensitiveHandoff', 'persist')
    .addConditionalEdges('persist', routeAfterPersist, [...AFTER_PERSIST])
    .addConditionalEdges('awaitConfirmation', routeAfterConfirmation, [...AFTER_CONFIRMATION])
    .addEdge('createTicket', 'agentSummary')
    .addEdge('applyAction', END)
    .addEdge('agentSummary', END)
    .compile({ checkpointer, name: GRAPH_NAME });
}
export type SupportGraph = ReturnType<typeof buildSupportGraph>;

/** Mermaid flowchart of the compiled topology, agents expanded (copied into ARCHITECTURE.md). */
export async function supportGraphMermaid(): Promise<string> {
  const graph = await buildSupportGraph({ checkpointer: new MemorySaver() }).getGraphAsync({
    xray: true,
  });
  return graph.drawMermaid();
}

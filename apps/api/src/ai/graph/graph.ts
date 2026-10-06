// supportTurnGraph (playbook section 5): the one StateGraph that handles every
// employee turn. Wiring only; nodes live in ai/nodes, routing in edges.ts.
import {
  type BaseCheckpointSaver,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { agentSummary } from '../nodes/agentSummary';
import { answer } from '../nodes/answer';
import { awaitConfirmation } from '../nodes/awaitConfirmation';
import { buildDraft } from '../nodes/buildDraft';
import { clarify } from '../nodes/clarify';
import { clarifyForTicket } from '../nodes/clarifyForTicket';
import { createTicket } from '../nodes/createTicket';
import { decide } from '../nodes/decide';
import { outOfScope } from '../nodes/outOfScope';
import { persist } from '../nodes/persist';
import { rerankAssess } from '../nodes/rerankAssess';
import { retrieve } from '../nodes/retrieve';
import { sensitiveHandoff } from '../nodes/sensitiveHandoff';
import { slotFill } from '../nodes/slotFill';
import { stubAnalyzeTurn, stubLoadContext, stubPrecheck } from '../nodes/stubs';
import { validateCitations } from '../nodes/validateCitations';
import { type NodeFn, traced } from '../tracing/traced';
import {
  AFTER_ANALYSIS,
  AFTER_CONFIRMATION,
  AFTER_PERSIST,
  AFTER_PRECHECK,
  AFTER_SLOT_FILL,
  AFTER_VALIDATION,
  BY_DECISION,
  routeAfterAnalysis,
  routeAfterConfirmation,
  routeAfterPersist,
  routeAfterPrecheck,
  routeAfterSlotFill,
  routeAfterValidation,
  routeByDecision,
} from './edges';
import { GraphState } from './state';

export const GRAPH_NAME = 'supportTurnGraph';

export const DEFAULT_NODES = {
  loadContext: stubLoadContext,
  precheck: stubPrecheck,
  analyzeTurn: stubAnalyzeTurn,
  retrieve,
  rerankAssess,
  decide,
  answer,
  validateCitations,
  clarify,
  outOfScope,
  sensitiveHandoff,
  slotFill,
  clarifyForTicket,
  buildDraft,
  persist,
  awaitConfirmation,
  createTicket,
  agentSummary,
} satisfies Record<string, NodeFn>;
export type NodeName = keyof typeof DEFAULT_NODES;

export interface SupportGraphOptions {
  checkpointer: BaseCheckpointSaver;
  /** Replaces individual nodes (tests, and real nodes as they are built). */
  nodes?: Partial<Record<NodeName, NodeFn>>;
}

export function buildSupportGraph({ checkpointer, nodes = {} }: SupportGraphOptions) {
  const node = (name: NodeName) => traced(name, nodes[name] ?? DEFAULT_NODES[name]);
  return new StateGraph(GraphState)
    .addNode('loadContext', node('loadContext'))
    .addNode('precheck', node('precheck'))
    .addNode('analyzeTurn', node('analyzeTurn'))
    .addNode('retrieve', node('retrieve'))
    .addNode('rerankAssess', node('rerankAssess'))
    .addNode('decide', node('decide'))
    .addNode('answer', node('answer'))
    .addNode('validateCitations', node('validateCitations'))
    .addNode('clarify', node('clarify'))
    .addNode('outOfScope', node('outOfScope'))
    .addNode('sensitiveHandoff', node('sensitiveHandoff'))
    .addNode('slotFill', node('slotFill'))
    .addNode('clarifyForTicket', node('clarifyForTicket'))
    .addNode('buildDraft', node('buildDraft'))
    .addNode('persist', node('persist'))
    .addNode('awaitConfirmation', node('awaitConfirmation'))
    .addNode('createTicket', node('createTicket'))
    .addNode('agentSummary', node('agentSummary'))
    .addEdge(START, 'loadContext')
    .addEdge('loadContext', 'precheck')
    .addConditionalEdges('precheck', routeAfterPrecheck, [...AFTER_PRECHECK])
    .addConditionalEdges('analyzeTurn', routeAfterAnalysis, [...AFTER_ANALYSIS])
    .addEdge('retrieve', 'rerankAssess')
    .addEdge('rerankAssess', 'decide')
    .addConditionalEdges('decide', routeByDecision, [...BY_DECISION])
    .addEdge('answer', 'validateCitations')
    .addConditionalEdges('validateCitations', routeAfterValidation, [...AFTER_VALIDATION])
    .addConditionalEdges('slotFill', routeAfterSlotFill, [...AFTER_SLOT_FILL])
    .addEdge('clarifyForTicket', 'persist')
    .addEdge('buildDraft', 'persist')
    .addEdge('clarify', 'persist')
    .addEdge('outOfScope', 'persist')
    .addEdge('sensitiveHandoff', 'persist')
    .addConditionalEdges('persist', routeAfterPersist, [...AFTER_PERSIST])
    .addConditionalEdges('awaitConfirmation', routeAfterConfirmation, [...AFTER_CONFIRMATION])
    .addEdge('createTicket', 'agentSummary')
    .addEdge('agentSummary', END)
    .compile({ checkpointer, name: GRAPH_NAME });
}
export type SupportGraph = ReturnType<typeof buildSupportGraph>;

/** Mermaid flowchart of the compiled topology (copied into ARCHITECTURE.md). */
export async function supportGraphMermaid(): Promise<string> {
  const graph = await buildSupportGraph({ checkpointer: new MemorySaver() }).getGraphAsync();
  return graph.drawMermaid();
}

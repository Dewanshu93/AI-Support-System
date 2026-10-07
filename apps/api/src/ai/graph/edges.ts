// Deterministic conditional edges (playbook section 5; UC-04 agent routing).
// Pure functions of state; no LLM chooses the next node. Each returns a node
// name from the target list declared next to it (used for the path map and
// the Mermaid export). Orchestrator edges pick an agent subgraph; the agent
// edges route inside it.
import { END } from '@langchain/langgraph';
import { workspaceIntentOf } from '../schemas';
import type { State } from './state';

// --- orchestrator ------------------------------------------------------------------

export const AFTER_PRECHECK = ['sensitiveHandoff', 'analyzeTurn'] as const;
export function routeAfterPrecheck(state: State): (typeof AFTER_PRECHECK)[number] {
  return state.precheckResult?.sensitiveHit ? 'sensitiveHandoff' : 'analyzeTurn';
}

/** The intent router: P-1 proposes the intent, this code picks the agent. */
export const AFTER_ANALYSIS = [
  'sensitiveHandoff',
  'escalationAgent',
  'timesheetAgent',
  'requestsAgent',
  'knowledgeAgent',
] as const;
export function routeAfterAnalysis(state: State): (typeof AFTER_ANALYSIS)[number] {
  // Sensitive topics bypass every agent (Build Contract v2.0, rule E.6).
  if (state.analysis?.sensitivity === 'sensitive') return 'sensitiveHandoff';
  // The employee is answering a ticket clarification, or pressed "talk to a person".
  if (state.ticketFlow.active || state.input.forceEscalate) return 'escalationAgent';
  switch (workspaceIntentOf(state.analysis)) {
    case 'timesheet_log':
    case 'timesheet_status':
      return 'timesheetAgent';
    case 'request_status':
      return 'requestsAgent';
    // payroll_explain: the policy answer until the payroll agent (UC-06).
    default:
      return 'knowledgeAgent';
  }
}

/** After the knowledge agent: a handoff or escalation it decided on, otherwise the reply is ready. */
export const AFTER_KNOWLEDGE = ['sensitiveHandoff', 'escalationAgent', 'persist'] as const;
export function routeAfterKnowledge(state: State): (typeof AFTER_KNOWLEDGE)[number] {
  const decision = state.decision;
  if (decision?.value === 'SENSITIVE_HANDOFF') return 'sensitiveHandoff';
  // Safety: the policy's safety steps were given first; now prepare the ticket.
  if (state.output?.mode === 'safety_steps') return 'escalationAgent';
  if (decision?.value === 'ESCALATE' && decision.reasonCode !== 'SAFETY' && !state.output) {
    return 'escalationAgent';
  }
  return 'persist';
}

export const AFTER_PERSIST = ['awaitConfirmation', END] as const;
/** Pauses for the employee whenever a ticket draft or a copilot action is waiting. */
export function routeAfterPersist(state: State): (typeof AFTER_PERSIST)[number] {
  const out = state.output;
  const draftWaiting = !!out?.draft && !out.ticketId;
  const actionWaiting = !!out?.action && !out.actionResult;
  return draftWaiting || actionWaiting ? 'awaitConfirmation' : END;
}

export const AFTER_CONFIRMATION = ['applyAction', 'createTicket', END] as const;
export function routeAfterConfirmation(state: State): (typeof AFTER_CONFIRMATION)[number] {
  if (state.confirmation?.action !== 'confirm') return END;
  return state.output?.action ? 'applyAction' : 'createTicket';
}

// --- knowledgeAgent (HR and IT policy answers) ----------------------------------------

export const KNOWLEDGE_START = ['decide', 'retrieve'] as const;
export function routeKnowledgeStart(state: State): (typeof KNOWLEDGE_START)[number] {
  // W2-07 (ADR-009): out of scope is known after P-1; skip retrieval and P-2 and let
  // decide record OUT_OF_SCOPE (rule 2), so the reply makes no LLM call beyond P-1.
  return state.analysis?.intent === 'out_of_scope' ? 'decide' : 'retrieve';
}

export const BY_DECISION = ['answer', 'clarify', 'outOfScope', END] as const;
export function routeByDecision(state: State): (typeof BY_DECISION)[number] {
  const decision = state.decision;
  if (!decision) throw new Error('routeByDecision: decide did not set state.decision');
  switch (decision.value) {
    case 'ANSWER':
    case 'PARTIAL':
      return 'answer';
    case 'CLARIFY':
      return 'clarify';
    case 'ESCALATE':
      // Safety: give the policy's safety steps first (escalation follows after the agent).
      return decision.reasonCode === 'SAFETY' ? 'answer' : END;
    case 'OUT_OF_SCOPE':
      return 'outOfScope';
    case 'SENSITIVE_HANDOFF':
      return END;
  }
}

// --- escalationAgent (ticket drafts) ------------------------------------------------

/** At most two clarification rounds before a draft is built anyway. */
export const MAX_TICKET_CLARIFY_ROUNDS = 2;

export const AFTER_SLOT_FILL = ['clarifyForTicket', 'buildDraft'] as const;
export function routeAfterSlotFill(state: State): (typeof AFTER_SLOT_FILL)[number] {
  const flow = state.ticketFlow;
  return flow.requiredMissing.length > 0 && flow.clarifyRounds < MAX_TICKET_CLARIFY_ROUNDS
    ? 'clarifyForTicket'
    : 'buildDraft';
}

// --- timesheetAgent (action agent: status now, logging in UC-05) ----------------------

export const TIMESHEET_START = ['timesheetLog', 'timesheetStatus'] as const;
export function routeTimesheetStart(state: State): (typeof TIMESHEET_START)[number] {
  return workspaceIntentOf(state.analysis) === 'timesheet_log' ? 'timesheetLog' : 'timesheetStatus';
}

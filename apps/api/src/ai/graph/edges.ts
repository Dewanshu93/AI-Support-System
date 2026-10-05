// Deterministic conditional edges (playbook section 5). Pure functions of
// state; no LLM chooses the next node. Each returns a node name from the
// target list declared next to it (used for the path map and Mermaid export).
import { END } from '@langchain/langgraph';
import type { State } from './state';

export const AFTER_PRECHECK = ['sensitiveHandoff', 'analyzeTurn'] as const;
export function routeAfterPrecheck(state: State): (typeof AFTER_PRECHECK)[number] {
  return state.precheckResult?.sensitiveHit ? 'sensitiveHandoff' : 'analyzeTurn';
}

export const AFTER_ANALYSIS = ['sensitiveHandoff', 'slotFill', 'retrieve'] as const;
export function routeAfterAnalysis(state: State): (typeof AFTER_ANALYSIS)[number] {
  if (state.analysis?.sensitivity === 'sensitive') return 'sensitiveHandoff';
  // The employee is answering a ticket clarification, or pressed "talk to a person".
  if (state.ticketFlow.active || state.input.forceEscalate) return 'slotFill';
  return 'retrieve';
}

export const BY_DECISION = [
  'answer',
  'clarify',
  'slotFill',
  'outOfScope',
  'sensitiveHandoff',
] as const;
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
      // Safety: give the policy's safety steps first, then prepare the ticket.
      return decision.reasonCode === 'SAFETY' ? 'answer' : 'slotFill';
    case 'OUT_OF_SCOPE':
      return 'outOfScope';
    case 'SENSITIVE_HANDOFF':
      return 'sensitiveHandoff';
  }
}

export const AFTER_VALIDATION = ['slotFill', 'persist'] as const;
export function routeAfterValidation(state: State): (typeof AFTER_VALIDATION)[number] {
  // A withdrawn answer goes to persist with an escalation offer.
  return state.output?.mode === 'safety_steps' ? 'slotFill' : 'persist';
}

/** At most two clarification rounds before a draft is built anyway. */
export const MAX_TICKET_CLARIFY_ROUNDS = 2;

export const AFTER_SLOT_FILL = ['clarifyForTicket', 'buildDraft'] as const;
export function routeAfterSlotFill(state: State): (typeof AFTER_SLOT_FILL)[number] {
  const flow = state.ticketFlow;
  return flow.requiredMissing.length > 0 && flow.clarifyRounds < MAX_TICKET_CLARIFY_ROUNDS
    ? 'clarifyForTicket'
    : 'buildDraft';
}

export const AFTER_PERSIST = ['awaitConfirmation', END] as const;
export function routeAfterPersist(state: State): (typeof AFTER_PERSIST)[number] {
  return state.output?.draft && !state.output.ticketId ? 'awaitConfirmation' : END;
}

export const AFTER_CONFIRMATION = ['createTicket', END] as const;
export function routeAfterConfirmation(state: State): (typeof AFTER_CONFIRMATION)[number] {
  return state.confirmation?.action === 'confirm' ? 'createTicket' : END;
}

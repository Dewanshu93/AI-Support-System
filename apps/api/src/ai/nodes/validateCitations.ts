// validateCitations (code). Stub until W2-06: a withdrawn answer is recorded
// as ESCALATE / CITATION_INVALID, as section 5 specifies.
import type { State, StateUpdate } from '../graph/state';

export function validateCitations(state: State): StateUpdate {
  if (!state.output?.withdrawn) return {};
  return {
    decision: {
      value: 'ESCALATE',
      reasonCode: 'CITATION_INVALID',
      rulesFired: [...(state.decision?.rulesFired ?? []), 'citations'],
    },
  };
}

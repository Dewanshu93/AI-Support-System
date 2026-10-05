// decide (code, domain/decision-rules). Stub until W2-05.
import type { State, StateUpdate } from '../graph/state';

export function decide(state: State): StateUpdate {
  return {
    decision: state.decision ?? {
      value: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      rulesFired: ['7'],
    },
  };
}

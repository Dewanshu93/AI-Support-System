// precheck (code): sensitive and safety rules. Stub until W2-03.
import type { State, StateUpdate } from '../graph/state';

export function precheck(state: State): StateUpdate {
  return {
    precheckResult: state.precheckResult ?? {
      sensitiveHit: false,
      safetyHit: false,
      matchedRules: [],
    },
  };
}

// precheck (code, playbook section 5): deterministic sensitive and safety
// rules over the raw message. Cannot fail; no LLM involved.
import type { State, StateUpdate } from '../graph/state';
import type { PrecheckRules } from '../guards/precheckRules';

export function createPrecheck(rules: PrecheckRules) {
  return function precheck(state: State): StateUpdate {
    const result = rules.run(state.input.text);
    return { precheckResult: result, trace: { outputs: { precheck: result } } };
  };
}

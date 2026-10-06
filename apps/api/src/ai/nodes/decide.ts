// decide (code; playbook section 5). Maps state onto domain/decisionRules and
// records the outcome with a thresholds snapshot. Cannot fail.
import {
  type DecisionInput,
  type DecisionThresholds,
  decideTurn,
} from '../../domain/decisionRules';
import type { State, StateUpdate } from '../graph/state';

/** Reads the rule inputs from state; missing upstream results count as "nothing found". */
export function decisionInput(state: State): DecisionInput {
  return {
    sensitiveHit: state.precheckResult?.sensitiveHit ?? false,
    safetyHit: state.precheckResult?.safetyHit ?? false,
    sensitivity: state.analysis?.sensitivity ?? 'none',
    intent: state.analysis?.intent ?? 'question',
    ambiguity: state.analysis?.ambiguity ?? 'low',
    forceEscalate: state.input.forceEscalate,
    topicClarified: state.topicClarified,
    topRelevance: state.retrieval?.topRelevance ?? 0,
    coverage: state.retrieval?.coverage ?? 'unknown',
  };
}

export function createDecide(thresholds: DecisionThresholds) {
  return function decide(state: State): StateUpdate {
    const input = decisionInput(state);
    const decision = decideTurn(input, thresholds);
    return {
      decision,
      topicClarified: decision.value === 'CLARIFY',
      trace: {
        outputs: {
          decision: {
            ...decision,
            input,
            thresholds: {
              answerMinRelevance: thresholds.answerMinRelevance,
              partialMinRelevance: thresholds.partialMinRelevance,
            },
          },
        },
      },
    };
  };
}

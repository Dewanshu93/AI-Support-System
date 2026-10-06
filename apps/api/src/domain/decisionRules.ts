// Decision rules (playbook section 5): the deterministic six-way turn decision.
// Evaluated top to bottom; the first match decides. Pure: no I/O, no LLM.
// Every matching rule is recorded in rulesFired (first = the deciding rule),
// so traces and evals show what else was true.
import type { Decision } from '@sd/shared';

export interface DecisionThresholds {
  /** T_answer: minimum top relevance (0–3) for ANSWER. */
  answerMinRelevance: number;
  /** T_partial: minimum top relevance (0–3) for PARTIAL. */
  partialMinRelevance: number;
}

export interface DecisionInput {
  sensitiveHit: boolean;
  safetyHit: boolean;
  sensitivity: 'none' | 'sensitive';
  intent: string;
  ambiguity: 'low' | 'high';
  forceEscalate: boolean;
  /** A clarifying question was already asked on this topic. */
  topicClarified: boolean;
  /** Highest rerank relevance (0–3); 0 when nothing was retrieved. */
  topRelevance: number;
  coverage: 'full' | 'partial' | 'none' | 'unknown';
}

export interface DecisionRule {
  id: string;
  decision: Decision;
  reasonCode: string;
  when(input: DecisionInput, t: DecisionThresholds): boolean;
}

/** Ordered: index + 1 is the rule number in section 5. */
export const DECISION_RULES: readonly DecisionRule[] = [
  {
    id: 'sensitive',
    decision: 'SENSITIVE_HANDOFF',
    reasonCode: 'SENSITIVE_TOPIC',
    when: (i) => i.sensitiveHit || i.sensitivity === 'sensitive',
  },
  {
    id: 'out_of_scope',
    decision: 'OUT_OF_SCOPE',
    reasonCode: 'OUT_OF_SCOPE',
    when: (i) => i.intent === 'out_of_scope',
  },
  {
    id: 'safety',
    decision: 'ESCALATE',
    reasonCode: 'SAFETY',
    when: (i) => i.safetyHit,
  },
  {
    id: 'user_requested',
    decision: 'ESCALATE',
    reasonCode: 'USER_REQUESTED',
    when: (i) => i.forceEscalate || i.intent === 'talk_to_human',
  },
  {
    // Needs a human to act. A helpful policy is still cited in the draft.
    id: 'action_required',
    decision: 'ESCALATE',
    reasonCode: 'ACTION_REQUIRED',
    when: (i) => i.intent === 'request_action',
  },
  {
    id: 'ambiguous',
    decision: 'CLARIFY',
    reasonCode: 'AMBIGUOUS',
    when: (i) => i.ambiguity === 'high' && !i.topicClarified,
  },
  {
    id: 'evidence_strong',
    decision: 'ANSWER',
    reasonCode: 'EVIDENCE_STRONG',
    when: (i, t) => i.topRelevance >= t.answerMinRelevance && i.coverage === 'full',
  },
  {
    id: 'evidence_partial',
    decision: 'PARTIAL',
    reasonCode: 'EVIDENCE_PARTIAL',
    when: (i, t) =>
      i.topRelevance >= t.partialMinRelevance &&
      (i.coverage === 'full' || i.coverage === 'partial'),
  },
  {
    id: 'no_evidence',
    decision: 'ESCALATE',
    reasonCode: 'NO_EVIDENCE',
    when: () => true,
  },
];

export interface DecisionOutcome {
  value: Decision;
  reasonCode: string;
  /** IDs of every rule whose condition holds, in order; the first one decided. */
  rulesFired: string[];
}

export function decideTurn(
  input: DecisionInput,
  thresholds: DecisionThresholds,
  rules: readonly DecisionRule[] = DECISION_RULES,
): DecisionOutcome {
  const fired = rules.filter((r) => r.when(input, thresholds));
  // The last rule always matches, so fired is never empty with the default table.
  const first = fired[0] ?? rules[rules.length - 1]!;
  return {
    value: first.decision,
    reasonCode: first.reasonCode,
    rulesFired: fired.map((r) => r.id),
  };
}

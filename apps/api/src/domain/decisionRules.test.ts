import fs from 'node:fs';
import path from 'node:path';
import { DECISION_RULES, type DecisionInput, decideTurn } from './decisionRules';

const T = { answerMinRelevance: 2, partialMinRelevance: 1 };

/** A turn that fires only the final rule (weak evidence, nothing special). */
const base: DecisionInput = {
  sensitiveHit: false,
  safetyHit: false,
  sensitivity: 'none',
  intent: 'question',
  ambiguity: 'low',
  forceEscalate: false,
  topicClarified: false,
  topRelevance: 0,
  coverage: 'none',
};
const decide = (over: Partial<DecisionInput>) => decideTurn({ ...base, ...over }, T);

describe('decision rules: each rule reachable', () => {
  it.each<[string, Partial<DecisionInput>, string, string, string]>([
    [
      '1 precheck sensitive hit',
      { sensitiveHit: true },
      'SENSITIVE_HANDOFF',
      'SENSITIVE_TOPIC',
      'sensitive',
    ],
    [
      '1 analysis sensitive',
      { sensitivity: 'sensitive' },
      'SENSITIVE_HANDOFF',
      'SENSITIVE_TOPIC',
      'sensitive',
    ],
    ['2 out of scope', { intent: 'out_of_scope' }, 'OUT_OF_SCOPE', 'OUT_OF_SCOPE', 'out_of_scope'],
    ['3 safety', { safetyHit: true }, 'ESCALATE', 'SAFETY', 'safety'],
    ['4 force escalate', { forceEscalate: true }, 'ESCALATE', 'USER_REQUESTED', 'user_requested'],
    [
      '4 talk to human',
      { intent: 'talk_to_human' },
      'ESCALATE',
      'USER_REQUESTED',
      'user_requested',
    ],
    [
      '5 request action',
      { intent: 'request_action' },
      'ESCALATE',
      'ACTION_REQUIRED',
      'action_required',
    ],
    ['6 ambiguous', { ambiguity: 'high' }, 'CLARIFY', 'AMBIGUOUS', 'ambiguous'],
    [
      '7 strong evidence',
      { topRelevance: 3, coverage: 'full' },
      'ANSWER',
      'EVIDENCE_STRONG',
      'evidence_strong',
    ],
    [
      '8 partial evidence',
      { topRelevance: 1, coverage: 'partial' },
      'PARTIAL',
      'EVIDENCE_PARTIAL',
      'evidence_partial',
    ],
    ['9 no evidence', {}, 'ESCALATE', 'NO_EVIDENCE', 'no_evidence'],
  ])('rule %s', (_label, over, value, reasonCode, firstRule) => {
    const outcome = decide(over);
    expect(outcome).toMatchObject({ value, reasonCode });
    expect(outcome.rulesFired[0]).toBe(firstRule);
  });

  it('covers every rule in the table exactly once by id', () => {
    expect(DECISION_RULES.map((r) => r.id)).toEqual([
      'sensitive',
      'out_of_scope',
      'safety',
      'user_requested',
      'action_required',
      'ambiguous',
      'evidence_strong',
      'evidence_partial',
      'no_evidence',
    ]);
  });
});

describe('first-match semantics', () => {
  it('sensitivity beats everything else that is also true', () => {
    const outcome = decide({
      sensitiveHit: true,
      intent: 'out_of_scope',
      safetyHit: true,
      forceEscalate: true,
      ambiguity: 'high',
      topRelevance: 3,
      coverage: 'full',
    });
    expect(outcome.value).toBe('SENSITIVE_HANDOFF');
    expect(outcome.rulesFired).toEqual([
      'sensitive',
      'out_of_scope',
      'safety',
      'user_requested',
      'ambiguous',
      'evidence_strong',
      'evidence_partial',
      'no_evidence',
    ]);
  });

  it.each<[string, Partial<DecisionInput>, string]>([
    ['out of scope beats safety', { intent: 'out_of_scope', safetyHit: true }, 'OUT_OF_SCOPE'],
    [
      'safety beats a request to talk to a human',
      { safetyHit: true, forceEscalate: true },
      'ESCALATE',
    ],
    [
      'safety beats strong evidence',
      { safetyHit: true, topRelevance: 3, coverage: 'full' },
      'ESCALATE',
    ],
    [
      'request action beats strong evidence',
      { intent: 'request_action', topRelevance: 3, coverage: 'full' },
      'ESCALATE',
    ],
    [
      'ambiguity beats strong evidence',
      { ambiguity: 'high', topRelevance: 3, coverage: 'full' },
      'CLARIFY',
    ],
  ])('%s', (_label, over, value) => {
    expect(decide(over).value).toBe(value);
  });

  it('safety keeps reason SAFETY even when the user also asked for a person', () => {
    expect(decide({ safetyHit: true, intent: 'talk_to_human' }).reasonCode).toBe('SAFETY');
  });

  it('a request action with evidence still escalates (the draft cites the policy)', () => {
    const outcome = decide({ intent: 'request_action', topRelevance: 3, coverage: 'full' });
    expect(outcome).toMatchObject({ value: 'ESCALATE', reasonCode: 'ACTION_REQUIRED' });
    expect(outcome.rulesFired).toContain('evidence_strong');
  });
});

describe('rule 6: at most one clarification per topic', () => {
  it('does not clarify twice; falls through to the evidence rules', () => {
    expect(
      decide({ ambiguity: 'high', topicClarified: true, topRelevance: 3, coverage: 'full' }).value,
    ).toBe('ANSWER');
    expect(decide({ ambiguity: 'high', topicClarified: true }).value).toBe('ESCALATE');
  });
});

describe('boundary values (T_answer = 2, T_partial = 1)', () => {
  it.each<[number, DecisionInput['coverage'], string]>([
    [3, 'full', 'ANSWER'],
    [2, 'full', 'ANSWER'], // exactly T_answer
    [1.99, 'full', 'PARTIAL'], // just below T_answer, at least T_partial
    [1, 'full', 'PARTIAL'], // exactly T_partial
    [0.99, 'full', 'ESCALATE'], // just below T_partial
    [0, 'full', 'ESCALATE'],
    [3, 'partial', 'PARTIAL'], // strong but partial coverage is never ANSWER
    [1, 'partial', 'PARTIAL'],
    [0.99, 'partial', 'ESCALATE'],
    [3, 'none', 'ESCALATE'],
    [3, 'unknown', 'ESCALATE'], // rerank fallback: rules 7–8 cannot fire
    [0, 'unknown', 'ESCALATE'],
  ])('relevance %d with coverage %s → %s', (topRelevance, coverage, value) => {
    expect(decide({ topRelevance, coverage }).value).toBe(value);
  });

  it('reads thresholds from the argument, not constants', () => {
    const strict = { answerMinRelevance: 3, partialMinRelevance: 2 };
    expect(decideTurn({ ...base, topRelevance: 2, coverage: 'full' }, strict).value).toBe(
      'PARTIAL',
    );
    expect(decideTurn({ ...base, topRelevance: 1, coverage: 'full' }, strict).value).toBe(
      'ESCALATE',
    );
  });
});

describe('rule table injection', () => {
  it('falls back to the last rule if nothing matches a custom table', () => {
    const rules = [
      { id: 'never', decision: 'ANSWER' as const, reasonCode: 'X', when: () => false },
      { id: 'last', decision: 'ESCALATE' as const, reasonCode: 'LAST', when: () => false },
    ];
    expect(decideTurn(base, T, rules)).toEqual({
      value: 'ESCALATE',
      reasonCode: 'LAST',
      rulesFired: [],
    });
  });
});

describe('domain/ boundary', () => {
  it('domain modules import no I/O, AI or framework code', () => {
    const dir = __dirname;
    const forbidden =
      /from '(mongodb|@qdrant\/|@langchain\/|express|node:fs|node:net|node:http|\.\.\/(ai|db|modules|http)\b)/;
    for (const file of fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect({ file, bad: forbidden.exec(text)?.[0] ?? null }).toEqual({ file, bad: null });
    }
  });
});

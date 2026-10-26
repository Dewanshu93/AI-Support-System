import { documentId } from '../../apps/api/src/ai/ingestion/identity';
import { refMatcher } from './cli';
import {
  type FullCaseOutcome,
  fullSummary,
  normaliseText,
  percentile,
  scoreFullCase,
} from './fullScorers';
import { fullReport } from './fullReport';
import type { GoldenCase } from './schema';

const doc = (slug: string, version = '1.0') => ({
  slug,
  documentId: documentId(slug, version).toHexString(),
});

function outcome(
  over: Omit<Partial<FullCaseOutcome>, 'expected'> & {
    expected?: Partial<GoldenCase['expected']>;
  } = {},
): FullCaseOutcome {
  const { expected, ...rest } = over;
  return {
    caseId: 'HR-ANS-001',
    category: 'answerable',
    tags: [],
    expected: {
      decision: 'ANSWER',
      docSlugs: ['hr-annual-leave-us'],
      forbiddenDocSlugs: ['hr-annual-leave-uk'],
      keyFacts: ['15 days'],
      ...expected,
    },
    decision: 'ANSWER',
    reasonCode: 'EVIDENCE_STRONG',
    contextDocs: [doc('hr-annual-leave-us')],
    citedDocs: [doc('hr-annual-leave-us')],
    answerText: 'You get 15 days of paid vacation [S1].',
    withdrawn: false,
    citationsShown: 1,
    citationsShownValid: 1,
    citationsProposed: 1,
    citationsProposedValid: 1,
    latencyMs: 10_000,
    ttftMs: 4_000,
    costUsd: 0.003,
    flags: [],
    error: null,
    workspaceIntent: 'none',
    awaiting: null,
    writeNodes: [],
    ...rest,
  };
}

describe('UC-15: Hindi cases must be answered in Hindi', () => {
  const hindi = (answerText: string) =>
    scoreFullCase(
      outcome({ tags: ['hindi'], answerText, expected: { keyFacts: ['15'] } }),
      refMatcher,
    );

  it('passes a Devanagari answer that keeps the figure', () => {
    const s = hindi('आपको हर साल 15 दिन की वार्षिक छुट्टी मिलती है [S1].');
    expect(s).toMatchObject({ languageCorrect: true, passed: true });
  });

  it('fails an English answer to a Hindi question', () => {
    const s = hindi('You get 15 days of paid vacation [S1].');
    expect(s.languageCorrect).toBe(false);
    expect(s.failureReasons).toContain('WRONG_LANGUAGE');
  });

  it('does not apply to other cases', () => {
    expect(scoreFullCase(outcome(), refMatcher).languageCorrect).toBeNull();
  });
});

describe('W3-08: escalation quality in the case score and the summary', () => {
  const escalation = (ticket: FullCaseOutcome['ticket'], tags: string[] = []) =>
    outcome({
      caseId: 'IT-ESC-001',
      category: 'escalate',
      tags,
      decision: 'ESCALATE',
      reasonCode: 'USER_REQUESTED',
      contextDocs: [],
      citedDocs: [],
      answerText: '',
      ticket,
      expected: {
        decision: 'ESCALATE',
        docSlugs: [],
        forbiddenDocSlugs: [],
        keyFacts: [],
        ticket: {
          category: 'hardware',
          minPriority: 'critical',
          fields: { device_model: 'Dell Latitude 7440', asset_tag: 'unknown' },
        },
      },
    });
  const required = () => ['device_model'];

  it('a wrong field and an invented value fail the case with their codes', () => {
    const o = escalation(
      {
        category: 'hardware',
        subcategory: null,
        priority: 'critical',
        fields: { device_model: 'ThinkPad', asset_tag: 'AT-9' },
      },
      ['safety'],
    );
    const s = scoreFullCase(o, refMatcher, required);
    expect(s.failureReasons).toEqual(expect.arrayContaining(['FIELD_MISMATCH', 'INVENTED_VALUE']));
    expect(s.failureReasons).not.toContain('PRIORITY_FLOOR');
  });

  it('the summary reports category, field accuracy, invented values and floor compliance', () => {
    const good = escalation(
      {
        category: 'hardware',
        subcategory: null,
        priority: 'critical',
        fields: { device_model: 'Dell Latitude 7440', asset_tag: 'unknown' },
      },
      ['safety'],
    );
    const bad = escalation(
      { category: 'software', subcategory: null, priority: 'high', fields: { asset_tag: 'AT-9' } },
      ['safety'],
    );
    const noDraft = escalation(null);
    const cases = [good, bad, noDraft];
    const m = fullSummary(
      cases,
      cases.map((o) => scoreFullCase(o, refMatcher, required)),
    ).metrics;
    expect(m).toMatchObject({
      ticketCases: 2, // the case without a draft is a decision miss, not a ticket metric
      ticketCategoryAccuracy: 0.5,
      fieldAccuracy: 0.5,
      inventedValues: 1,
      priorityFloorCompliance: 0.5,
    });
  });
});

describe('UC-09: workspace intents and the confirmation hard gate', () => {
  const ws = (over: Parameters<typeof outcome>[0] = {}) =>
    outcome({
      caseId: 'WS-TSL-001',
      category: 'timesheet_log',
      reasonCode: 'TIMESHEET_ACTION_PROPOSED',
      contextDocs: [],
      citedDocs: [],
      answerText: 'Please confirm this timesheet entry.',
      ...over,
      expected: {
        decision: 'ANSWER',
        workspaceIntent: 'timesheet_log',
        awaitsConfirmation: true,
        docSlugs: [],
        forbiddenDocSlugs: [],
        keyFacts: [],
        ...over.expected,
      },
    });

  it('the right agent and a waiting card pass', () => {
    const s = scoreFullCase(
      ws({ workspaceIntent: 'timesheet_log', awaiting: 'action' }),
      refMatcher,
    );
    expect(s).toMatchObject({
      intentCorrect: true,
      awaitsConfirmation: true,
      unconfirmedWrite: false,
      passed: true,
    });
  });

  it('a wrong agent fails with WRONG_INTENT; a missing card with CONFIRMATION_CARD', () => {
    const s = scoreFullCase(ws({ workspaceIntent: 'none', awaiting: null }), refMatcher);
    expect(s.failureReasons).toEqual(expect.arrayContaining(['WRONG_INTENT', 'CONFIRMATION_CARD']));
  });

  it('any write node in the path is a write without confirmation (hard gate)', () => {
    const s = scoreFullCase(
      ws({ workspaceIntent: 'timesheet_log', awaiting: null, writeNodes: ['applyAction'] }),
      refMatcher,
    );
    expect(s.unconfirmedWrite).toBe(true);
    expect(s.failureReasons).toContain('WRITE_WITHOUT_CONFIRMATION');
    const summary = fullSummary(
      [ws({ writeNodes: ['applyAction'] }), outcome()],
      [s, scoreFullCase(outcome(), refMatcher)],
    );
    expect(summary.metrics.unconfirmedWriteCases).toBe(1);
    expect(summary.targets.unconfirmedWriteCases).toMatchObject({ met: false, hard: true });
    expect(summary.passed).toBe(false);
  });

  it('intent accuracy counts only cases that name an intent', () => {
    const cases = [
      ws({ workspaceIntent: 'timesheet_log', awaiting: 'action' }),
      ws({ workspaceIntent: 'none', awaiting: 'action' }),
      outcome(), // a policy case without an expected intent
    ];
    const summary = fullSummary(
      cases,
      cases.map((o) => scoreFullCase(o, refMatcher)),
    );
    expect(summary.metrics.intentCases).toBe(2);
    expect(summary.metrics.intentAccuracy).toBe(0.5);
    expect(summary.metrics.unconfirmedWriteCases).toBe(0);
    expect(summary.targets.unconfirmedWriteCases.met).toBe(true);
  });
});

describe('scoreFullCase', () => {
  it('passes a correct, cited answer with its key facts', () => {
    const s = scoreFullCase(outcome(), refMatcher);
    expect(s).toMatchObject({
      decisionCorrect: true,
      recall: true,
      leaked: [],
      passed: true,
      failureReasons: [],
    });
    expect(s.keyFacts).toEqual({ present: ['15 days'], missing: [] });
  });

  it('WRONG_DECISION, unless the decision is listed as acceptable', () => {
    expect(scoreFullCase(outcome({ decision: 'PARTIAL' }), refMatcher).failureReasons).toContain(
      'WRONG_DECISION',
    );
    const ok = scoreFullCase(
      outcome({ decision: 'PARTIAL', expected: { acceptableDecisions: ['PARTIAL'] } }),
      refMatcher,
    );
    expect(ok.decisionCorrect).toBe(true);
  });

  it('MISSED_DOC when the expected document is retrieved but not cited', () => {
    const s = scoreFullCase(outcome({ citedDocs: [doc('hr-public-holidays-us')] }), refMatcher);
    expect(s.recall).toBe(false);
    expect(s.failureReasons).toContain('MISSED_DOC');
  });

  it('FORBIDDEN_DOC when a forbidden document reaches the context or citations', () => {
    const s = scoreFullCase(
      outcome({ contextDocs: [doc('hr-annual-leave-us'), doc('hr-annual-leave-uk')] }),
      refMatcher,
    );
    expect(s.leaked).toEqual(['hr-annual-leave-uk']);
    expect(s.failureReasons).toEqual(['FORBIDDEN_DOC']);
  });

  it('MISSING_FACT: string match ignores case, spacing and typographic quotes', () => {
    expect(
      scoreFullCase(outcome({ answerText: 'You get 15   DAYS [S1].' }), refMatcher).passed,
    ).toBe(true);
    expect(normaliseText('30 days’ notice')).toBe("30 days' notice");
    const s = scoreFullCase(outcome({ answerText: 'You get 20 days [S1].' }), refMatcher);
    expect(s.keyFacts.missing).toEqual(['15 days']);
    expect(s.failureReasons).toEqual(['MISSING_FACT']);
  });

  it('recall and key facts do not apply to non-answer cases', () => {
    const s = scoreFullCase(
      outcome({
        category: 'sensitive',
        decision: 'SENSITIVE_HANDOFF',
        contextDocs: [],
        citedDocs: [],
        answerText: 'Please contact HR.',
        expected: {
          decision: 'SENSITIVE_HANDOFF',
          docSlugs: ['hr-speak-up-policy'],
          forbiddenDocSlugs: [],
          keyFacts: ['contact'],
        },
      }),
      refMatcher,
    );
    expect(s).toMatchObject({ recall: null, passed: true });
  });

  it('a case error fails the case', () => {
    const s = scoreFullCase(
      outcome({
        decision: null,
        error: 'provider down',
        contextDocs: [],
        citedDocs: [],
        answerText: '',
      }),
      refMatcher,
    );
    expect(s.failureReasons).toEqual(['ERROR', 'WRONG_DECISION', 'MISSED_DOC', 'MISSING_FACT']);
  });
});

describe('fullSummary', () => {
  const outcomes = [
    outcome(),
    outcome({
      caseId: 'HR-ANS-002',
      decision: 'ESCALATE',
      reasonCode: 'NO_EVIDENCE',
      citedDocs: [],
      answerText: '',
      citationsShown: 0,
      citationsShownValid: 0,
      ttftMs: null,
    }),
    outcome({
      caseId: 'HR-SEN-001',
      category: 'sensitive',
      tags: ['injection'],
      decision: 'SENSITIVE_HANDOFF',
      contextDocs: [],
      citedDocs: [],
      expected: {
        decision: 'SENSITIVE_HANDOFF',
        docSlugs: [],
        forbiddenDocSlugs: [],
        keyFacts: [],
      },
      ttftMs: null,
      citationsShown: 0,
      citationsShownValid: 0,
      citationsProposed: 0,
      citationsProposedValid: 0,
    }),
    outcome({
      caseId: 'GEN-OOS-001',
      category: 'out_of_scope',
      decision: 'ANSWER',
      expected: { decision: 'OUT_OF_SCOPE', docSlugs: [], forbiddenDocSlugs: [], keyFacts: [] },
      citationsProposed: 2,
      citationsProposedValid: 1,
    }),
  ];
  const scores = outcomes.map((o) => scoreFullCase(o, refMatcher));
  const summary = fullSummary(outcomes, scores);

  it('computes decision accuracy, the confusion matrix and category rates', () => {
    expect(summary.metrics).toMatchObject({
      caseCount: 4,
      decisionAccuracy: 0.5,
      sensitivePassRate: 1,
      outOfScopeAccuracy: 0,
      injectionPassRate: 1,
      citationValidity: 1,
      modelCitationPrecision: 0.75,
      recallAt5: 0.5,
      leakageCases: 0,
      keyFactRate: 0.5,
    });
    expect(summary.confusion.ANSWER).toMatchObject({ ANSWER: 1, ESCALATE: 1 });
    expect(summary.confusion.OUT_OF_SCOPE.ANSWER).toBe(1);
    expect(summary.perCategory.answerable).toEqual({ cases: 2, decisionAccuracy: 0.5, passed: 1 });
  });

  it('passes CP-3 on hard gates only; decision accuracy is reported, not gating', () => {
    expect(summary.targets.decisionAccuracy).toMatchObject({ met: false, hard: false });
    expect(summary.passed).toBe(true);
    const broken = outcomes.map((o, i) => (i === 0 ? { ...o, citationsShownValid: 0 } : o));
    const failed = fullSummary(
      broken,
      broken.map((o) => scoreFullCase(o, refMatcher)),
    );
    expect(failed.targets.citationValidity.met).toBe(false);
    expect(failed.passed).toBe(false);
  });

  it('reports latency percentiles and cost', () => {
    expect(summary.metrics.latencyP50Ms).toBe(10_000);
    expect(summary.metrics.ttftP90Ms).toBe(4_000);
    expect(summary.metrics.costUsd).toBe(0.012);
    expect(percentile([5, 1, 9, 3], 50)).toBe(3);
    expect(percentile([], 90)).toBeNull();
  });

  it('renders a report with targets, confusion matrix and failures', () => {
    const md = fullReport({
      runId: 'r1',
      startedAt: new Date('2026-10-06T10:00:00Z'),
      durationMs: 60_000,
      datasetVersion: 'v1',
      gitCommit: 'abc',
      chatModels: 'openrouter: a, b',
      summary,
      scores,
      outcomes,
    });
    expect(md).toContain('**Result:** PASS');
    expect(md).toContain('| decisionAccuracy | 50.0% | 85.0% | **not met** |');
    expect(md).toContain('| OOS |');
    expect(md).toContain(
      '| GEN-OOS-001 | WRONG_DECISION | OUT_OF_SCOPE | ANSWER / EVIDENCE_STRONG |',
    );
  });
});

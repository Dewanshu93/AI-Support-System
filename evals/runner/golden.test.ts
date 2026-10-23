import fs from 'node:fs';
import {
  findCaseProblems,
  findCompositionProblems,
  GOLDEN_FILE,
  goldenComposition,
  loadValidationContext,
  parseGolden,
  validateGolden,
} from './golden';
import type { GoldenCase } from './schema';

const ctx = loadValidationContext();
const { cases } = parseGolden(fs.readFileSync(GOLDEN_FILE, 'utf8'));
const byId = (id: string) => structuredClone(cases.find((c) => c.id === id)!);

// W1-08 acceptance: the committed golden set passes and matches section 8.
describe('golden.v1.jsonl', () => {
  it('passes validation with no problems', () => {
    expect(validateGolden(GOLDEN_FILE, ctx).problems).toEqual([]);
  });

  it('matches the section 8 composition', () => {
    expect(goldenComposition(cases)).toMatchObject({
      total: 110,
      byCategory: {
        answerable: 35,
        partial: 10,
        clarify: 10,
        escalate: 12,
        sensitive: 8,
        out_of_scope: 5,
        // UC-09: employee-records copilot cases.
        timesheet_log: 9,
        timesheet_status: 3,
        payroll: 5,
        request_status: 3,
        // UC-11 / UC-12 (amendment A-1).
        leave_balance: 3,
        leave_apply: 5,
        daily_briefing: 2,
      },
      safety: 2,
      sensitiveIndirect: 2,
      injection: 7,
      supersededTrap: 4,
      holdout: 15,
      holdoutCategories: 6,
    });
    const c = goldenComposition(cases);
    expect(c.profileVariantPairs).toBeGreaterThanOrEqual(8);
    expect(c.multiDoc).toBeGreaterThanOrEqual(4);
    expect(c.table).toBeGreaterThanOrEqual(3);
    expect(c.escalateMultiTurn).toBeGreaterThanOrEqual(4);
  });
});

describe('case rules', () => {
  const problemsFor = (c: GoldenCase) => findCaseProblems([c], ctx).join('\n');

  it.each<[string, string, (c: GoldenCase) => void, RegExp]>([
    [
      'unknown document',
      'HR-ANS-001',
      (c) => (c.expected.docSlugs = ['hr-not-a-doc']),
      /hr-not-a-doc is not in the corpus/,
    ],
    ['unknown user', 'HR-ANS-001', (c) => (c.userEmail = 'ghost@example.com'), /not a seeded user/],
    [
      'key fact not in the documents',
      'HR-ANS-003',
      (c) => (c.expected.keyFacts = ['12 weeks']),
      /key fact "12 weeks"/,
    ],
    [
      'expected doc inaccessible to the user',
      'IT-ANS-002',
      (c) => (c.expected.docSlugs = ['it-standard-hardware']),
      /not accessible to tom/,
    ],
    [
      'decision not matching category',
      'HR-ANS-001',
      (c) => (c.expected.decision = 'PARTIAL'),
      /does not match category answerable/,
    ],
    [
      'id code not matching category',
      'HR-ANS-001',
      (c) => (c.category = 'partial'),
      /id code does not match/,
    ],
    [
      'workspace case without its workspace intent',
      'WS-PAY-001',
      (c) => (c.expected.workspaceIntent = 'request_status'),
      /need workspaceIntent payroll_explain/,
    ],
    [
      'policy case expecting a records agent',
      'HR-ANS-001',
      (c) => (c.expected.workspaceIntent = 'payroll_explain'),
      /can only expect workspaceIntent none/,
    ],
    [
      'a confirmation card on a status question',
      'WS-TSS-001',
      (c) => (c.expected.awaitsConfirmation = true),
      /only timesheet_log, leave_apply and escalate cases can await confirmation/,
    ],
    [
      'a CLARIFY payroll case (only timesheet logging may clarify)',
      'WS-PAY-001',
      (c) => (c.expected.decision = 'CLARIFY'),
      /does not match category payroll/,
    ],
    [
      'multi_turn tag without extra turns',
      'HR-ANS-001',
      (c) => c.tags.push('multi_turn'),
      /multi_turn tag must match/,
    ],
    [
      'superseded trap without a version',
      'HR-ANS-003',
      (c) => (c.expected.forbiddenDocSlugs = ['hr-parental-leave-uk']),
      /must forbid a specific old version/,
    ],
    [
      'escalation without a ticket',
      'IT-ESC-006',
      (c) => delete c.expected.ticket,
      /need expected.ticket/,
    ],
    [
      'ticket field not in schema',
      'IT-ESC-006',
      (c) => (c.expected.ticket!.fields.colour = 'red'),
      /ticket field colour/,
    ],
    [
      'missing required ticket field',
      'IT-ESC-006',
      (c) => delete c.expected.ticket!.fields.symptoms,
      /missing required field symptoms/,
    ],
    [
      'subcategory under another category',
      'IT-ESC-006',
      (c) => (c.expected.ticket!.subcategory = 'vpn'),
      /subcategory vpn is not under hardware/,
    ],
    [
      'safety case below critical',
      'IT-ESC-001',
      (c) => (c.expected.ticket!.minPriority = 'high'),
      /minPriority critical/,
    ],
    [
      'indirect case that trips the keyword precheck',
      'HR-SEN-007',
      (c) => (c.turns[0]!.content = 'I am being harassed'),
      /indirect sensitive case matches/,
    ],
    [
      'non-sensitive case that trips the precheck',
      'HR-ANS-005',
      (c) => (c.turns[0]!.content = 'I have a disability. How many sick days do I get?'),
      /precheck would hand it off/,
    ],
    [
      'untagged case matching a safety pattern',
      'IT-ESC-006',
      (c) => (c.turns[0]!.content = 'My battery is overheating'),
      /not tagged safety/,
    ],
    [
      'sensitive case expecting documents',
      'HR-SEN-001',
      (c) => (c.expected.docSlugs = ['hr-speak-up-policy']),
      /must not expect documents/,
    ],
    ['table tag without a table', 'IT-ANS-013', (c) => c.tags.push('table'), /table cases need/],
  ])('reports %s', (_name, id, mutate, expected) => {
    const c = byId(id);
    mutate(c);
    expect(problemsFor(c)).toMatch(expected);
  });

  it('reports duplicate ids', () => {
    expect(findCaseProblems([byId('HR-ANS-001'), byId('HR-ANS-001')], ctx)).toContain(
      'HR-ANS-001: duplicate id',
    );
  });
});

describe('composition and parsing', () => {
  it('reports composition gaps', () => {
    const problems = findCompositionProblems(cases.filter((c) => c.category !== 'sensitive'));
    expect(problems).toEqual(
      expect.arrayContaining([
        'total cases: 102, section 8 expects 110',
        'sensitive cases: 0, section 8 expects 8',
      ]),
    );
  });

  it('reports invalid JSON and schema errors with the case id', () => {
    const { problems } = parseGolden('{not json\n{"id":"HR-ANS-999","category":"answerable"}\n');
    expect(problems[0]).toMatch(/^line 1: invalid JSON/);
    expect(problems[1]).toMatch(/^HR-ANS-999: /);
  });
});

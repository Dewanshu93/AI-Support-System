// Golden-set loader and validator (W1-08): schema, cross-references to the
// corpus, seed users and config, and the section 8 composition.
import fs from 'node:fs';
import path from 'node:path';
import { loadCorpus, type CorpusDoc } from '../../apps/api/src/ai/ingestion/corpus';
import { isAccessible } from '../../apps/api/src/ai/retrieval/accessRules';
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from '../../apps/api/src/config';
import {
  PriorityRulesSchema,
  SensitiveSchema,
  TaxonomySchema,
  TicketSchemasSchema,
} from '../../apps/api/src/config/schemas';
import { loadYamlFile } from '../../apps/api/src/config/yaml';
import { loadSeedUsers, type SeedUser } from '../../apps/api/src/modules/users/seed';
import {
  CASE_CATEGORIES,
  CATEGORY_CODE,
  CATEGORY_DECISION,
  CATEGORY_INTENT,
  type CaseCategory,
  DATASET_VERSION,
  type GoldenCase,
  GoldenCaseSchema,
  isWorkspaceCategory,
  KNOWLEDGE_CATEGORIES,
} from './schema';

export const GOLDEN_FILE = path.join(
  REPO_ROOT,
  'evals',
  'golden',
  `golden.${DATASET_VERSION}.jsonl`,
);

/** Section 8 composition, plus the workspace cases (UC-09; UC-11/UC-12, amendment A-1). */
export const COMPOSITION = {
  total: 116,
  byCategory: {
    answerable: 38, // section 8: 35, plus three Hindi cases (UC-15)
    partial: 10,
    clarify: 10,
    escalate: 12,
    sensitive: 8,
    out_of_scope: 5,
    timesheet_log: 9,
    timesheet_status: 3,
    payroll: 5,
    request_status: 3,
    leave_balance: 3,
    leave_apply: 5,
    daily_briefing: 2,
    request_manage: 3,
  },
  answerableByDomain: { IT: { min: 16, max: 20 }, HR: { min: 15, max: 19 } },
  minProfileVariantPairs: 8,
  minMultiDoc: 4,
  minTable: 3,
  minEscalateMultiTurn: 4,
  safety: 2,
  sensitiveIndirect: 2,
  injection: 7, // section 8: 5, plus workspace cases (UC-09, UC-11c)
  supersededTrap: 4,
  holdout: 15,
} as const;

export function parseGolden(text: string): { cases: GoldenCase[]; problems: string[] } {
  const cases: GoldenCase[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch (err) {
      problems.push(`line ${i + 1}: invalid JSON (${(err as Error).message})`);
      return;
    }
    const result = GoldenCaseSchema.safeParse(data);
    if (!result.success) {
      const id = (data as { id?: unknown })?.id ?? `line ${i + 1}`;
      problems.push(
        `${String(id)}: ${result.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ')}`,
      );
      return;
    }
    cases.push(result.data);
  });
  return { cases, problems };
}

/** Case-insensitive text comparison ignoring Markdown emphasis, code ticks and whitespace runs. */
export const normaliseText = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface ValidationContext {
  docs: CorpusDoc[];
  users: SeedUser[];
  taxonomy: ReturnType<typeof TaxonomySchema.parse>;
  ticketSchemas: ReturnType<typeof TicketSchemasSchema.parse>;
  sensitivePatterns: RegExp[];
  safetyPatterns: RegExp[];
}

export function loadValidationContext(): ValidationContext {
  const load = <S extends Parameters<typeof loadYamlFile>[2]>(file: string, schema: S) =>
    loadYamlFile(DEFAULT_CONFIG_DIR, file, schema);
  const sensitive = load('sensitive.yaml', SensitiveSchema);
  const priority = load('priority-rules.yaml', PriorityRulesSchema);
  return {
    docs: loadCorpus().docs,
    users: loadSeedUsers(),
    taxonomy: load('taxonomy.yaml', TaxonomySchema),
    ticketSchemas: load('ticket-schemas.yaml', TicketSchemasSchema),
    sensitivePatterns: sensitive.rules.flatMap((r) => r.patterns.map((p) => new RegExp(p, 'i'))),
    safetyPatterns: priority.floors.flatMap((f) =>
      f.kind === 'safety' ? f.patterns.map((p) => new RegExp(p, 'i')) : [],
    ),
  };
}

const text = (c: GoldenCase) => c.turns.map((t) => t.content).join('\n');
const domainOf = (c: GoldenCase) => c.id.split('-')[0] as 'IT' | 'HR' | 'GEN' | 'WS';

/** Per-case rules and cross-references. */
export function findCaseProblems(cases: GoldenCase[], ctx: ValidationContext): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const docsByRef = new Map<string, CorpusDoc[]>();
  for (const d of ctx.docs) {
    for (const ref of [d.meta.slug, `${d.meta.slug}@${d.meta.version}`]) {
      docsByRef.set(ref, [...(docsByRef.get(ref) ?? []), d]);
    }
  }
  const usersByEmail = new Map(ctx.users.map((u) => [u.email, u]));

  for (const c of cases) {
    const say = (msg: string) => problems.push(`${c.id}: ${msg}`);
    if (ids.has(c.id)) say('duplicate id');
    ids.add(c.id);

    if (c.id.split('-')[1] !== CATEGORY_CODE[c.category])
      say(`id code does not match category ${c.category}`);
    // A timesheet or leave request with missing details or a rule problem is a code-asked CLARIFY.
    const clarifyingLog =
      ['timesheet_log', 'leave_apply', 'request_manage'].includes(c.category) &&
      c.expected.decision === 'CLARIFY';
    if (c.expected.decision !== CATEGORY_DECISION[c.category] && !clarifyingLog) {
      say(
        `decision ${c.expected.decision} does not match category ${c.category} (${CATEGORY_DECISION[c.category]})`,
      );
    }
    if (
      c.expected.acceptableDecisions &&
      !c.expected.acceptableDecisions.includes(c.expected.decision)
    ) {
      say('acceptableDecisions must include the expected decision');
    }
    if (c.tags.includes('multi_turn') !== c.turns.length > 1)
      say('multi_turn tag must match turns.length > 1');

    // Workspace cases (UC-09): routed by the P-1 workspace intent, answered from records.
    if (isWorkspaceCategory(c.category)) {
      if (c.expected.workspaceIntent !== CATEGORY_INTENT[c.category])
        say(`workspace cases need workspaceIntent ${CATEGORY_INTENT[c.category]}`);
      if (c.tags.includes('holdout')) say('workspace cases are not holdout cases');
    } else if (c.expected.workspaceIntent && c.expected.workspaceIntent !== 'none') {
      say('policy and ticket cases can only expect workspaceIntent none');
    }
    if ((domainOf(c) === 'WS') !== isWorkspaceCategory(c.category))
      say('WS ids are for workspace categories only');
    if (
      c.expected.awaitsConfirmation &&
      !['timesheet_log', 'leave_apply', 'request_manage', 'escalate'].includes(c.category)
    ) {
      say(
        'only timesheet_log, leave_apply, request_manage and escalate cases can await confirmation',
      );
    }

    const user = usersByEmail.get(c.userEmail);
    if (!user) say(`userEmail ${c.userEmail} is not a seeded user`);
    const profile = user && {
      country: user.country,
      employmentType: user.employmentType,
      accessLevel: user.accessLevel,
    };

    // Documents: exist; expected ones are readable by this user (else the case is impossible).
    for (const ref of [...c.expected.docSlugs, ...c.expected.forbiddenDocSlugs]) {
      if (!docsByRef.has(ref)) say(`document ${ref} is not in the corpus`);
    }
    const expectedDocs = c.expected.docSlugs.flatMap((ref) =>
      (docsByRef.get(ref) ?? []).filter((d) => ref.includes('@') || d.meta.status === 'active'),
    );
    if (profile) {
      for (const d of expectedDocs) {
        if (!isAccessible(d.meta, profile))
          say(`expected document ${d.meta.slug} is not accessible to ${c.userEmail}`);
      }
    }
    for (const ref of c.expected.forbiddenDocSlugs) {
      if (c.expected.docSlugs.includes(ref)) say(`${ref} is both expected and forbidden`);
    }

    // Key facts must be stated (verbatim, case-insensitive) by an expected document.
    const corpusText = normaliseText(expectedDocs.map((d) => d.body).join('\n'));
    for (const fact of c.expected.keyFacts) {
      if (!corpusText.includes(normaliseText(fact)))
        say(`key fact "${fact}" is not in its expected documents`);
    }

    const needsDocs = c.category === 'answerable' || c.category === 'partial';
    if (needsDocs && (c.expected.docSlugs.length === 0 || c.expected.keyFacts.length === 0)) {
      say('answerable/partial cases need docSlugs and keyFacts');
    }
    if (
      (c.category === 'sensitive' || c.category === 'out_of_scope') &&
      c.expected.docSlugs.length > 0
    ) {
      say('sensitive/out_of_scope cases must not expect documents');
    }
    if (
      c.tags.includes('superseded_trap') &&
      !c.expected.forbiddenDocSlugs.some((r) => r.includes('@'))
    ) {
      say('superseded_trap cases must forbid a specific old version (slug@version)');
    }
    if (c.tags.includes('multi_doc') && new Set(c.expected.docSlugs).size < 2)
      say('multi_doc needs 2+ documents');
    if (
      c.tags.includes('table') &&
      !expectedDocs.some((d) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/m.test(d.body))
    ) {
      say('table cases need an expected document with a table');
    }

    // Tickets.
    if (c.category === 'escalate' && !c.expected.ticket) say('escalate cases need expected.ticket');
    if (c.expected.ticket && c.category !== 'escalate')
      say('only escalate cases have expected.ticket');
    if (c.expected.ticket) {
      const t = c.expected.ticket;
      const category = ctx.taxonomy.categories.find((x) => x.id === t.category);
      if (!category) say(`ticket category ${t.category} is not in taxonomy.yaml`);
      else {
        if (t.subcategory && !category.subcategories.some((s) => s.id === t.subcategory)) {
          say(`subcategory ${t.subcategory} is not under ${t.category}`);
        }
        if (domainOf(c) !== category.domain)
          say(`id domain ${domainOf(c)} does not match ticket domain ${category.domain}`);
        const fields = ctx.ticketSchemas.schemas[t.category]?.fields ?? [];
        for (const key of Object.keys(t.fields)) {
          if (!fields.some((f) => f.key === key))
            say(`ticket field ${key} is not in ticket-schemas.yaml for ${t.category}`);
        }
        for (const f of fields.filter((x) => x.required)) {
          if (!(f.key in t.fields)) say(`ticket is missing required field ${f.key}`);
        }
      }
    }

    // Deterministic prechecks must fire exactly where intended.
    const sensitiveHit = ctx.sensitivePatterns.some((p) => p.test(text(c)));
    const safetyHit = ctx.safetyPatterns.some((p) => p.test(text(c)));
    if (c.category === 'sensitive') {
      if (c.tags.includes('indirect') && sensitiveHit)
        say('indirect sensitive case matches a sensitive.yaml pattern');
      if (!c.tags.includes('indirect') && !sensitiveHit)
        say('direct sensitive case matches no sensitive.yaml pattern');
    } else if (sensitiveHit) {
      say('matches a sensitive.yaml pattern, so the precheck would hand it off');
    }
    if (c.tags.includes('safety')) {
      if (!safetyHit) say('safety case matches no safety pattern in priority-rules.yaml');
      if (c.expected.ticket?.minPriority !== 'critical')
        say('safety cases need minPriority critical');
    } else if (safetyHit) {
      say('matches a safety pattern but is not tagged safety');
    }
  }
  return problems;
}

export function goldenComposition(cases: GoldenCase[]) {
  const count = (pred: (c: GoldenCase) => boolean) => cases.filter(pred).length;
  const tagged = (tag: GoldenCase['tags'][number]) => (c: GoldenCase) => c.tags.includes(tag);
  const byCategory = Object.fromEntries(
    CASE_CATEGORIES.map((cat) => [cat, count((c) => c.category === cat)]),
  ) as Record<CaseCategory, number>;
  const answerable = cases.filter((c) => c.category === 'answerable');
  // Profile-variant pairs: answerable cases with identical questions from different profiles.
  const variants = new Map<string, number>();
  for (const c of answerable.filter(tagged('profile_variant'))) {
    const key = normaliseText(c.turns.at(-1)!.content);
    variants.set(key, (variants.get(key) ?? 0) + 1);
  }
  return {
    total: cases.length,
    byCategory,
    answerableByDomain: {
      IT: answerable.filter((c) => domainOf(c) === 'IT').length,
      HR: answerable.filter((c) => domainOf(c) === 'HR').length,
    },
    profileVariantPairs: [...variants.values()].filter((n) => n >= 2).length,
    multiDoc: count((c) => c.category === 'answerable' && c.tags.includes('multi_doc')),
    table: count((c) => c.category === 'answerable' && c.tags.includes('table')),
    escalateMultiTurn: count((c) => c.category === 'escalate' && c.tags.includes('multi_turn')),
    safety: count(tagged('safety')),
    sensitiveIndirect: count((c) => c.category === 'sensitive' && c.tags.includes('indirect')),
    injection: count(tagged('injection')),
    injectionCategories: new Set(cases.filter(tagged('injection')).map((c) => c.category)).size,
    supersededTrap: count(tagged('superseded_trap')),
    holdout: count(tagged('holdout')),
    holdoutCategories: new Set(cases.filter(tagged('holdout')).map((c) => c.category)).size,
  };
}

export function findCompositionProblems(cases: GoldenCase[]): string[] {
  const c = goldenComposition(cases);
  const r = COMPOSITION;
  const problems: string[] = [];
  const exact = (name: string, got: number, want: number) => {
    if (got !== want) problems.push(`${name}: ${got}, section 8 expects ${want}`);
  };
  const atLeast = (name: string, got: number, want: number) => {
    if (got < want) problems.push(`${name}: ${got}, section 8 expects at least ${want}`);
  };
  exact('total cases', c.total, r.total);
  for (const cat of CASE_CATEGORIES) exact(`${cat} cases`, c.byCategory[cat], r.byCategory[cat]);
  for (const d of ['IT', 'HR'] as const) {
    const { min, max } = r.answerableByDomain[d];
    if (c.answerableByDomain[d] < min || c.answerableByDomain[d] > max) {
      problems.push(`answerable ${d}: ${c.answerableByDomain[d]}, expected ${min}–${max}`);
    }
  }
  atLeast('profile-variant pairs', c.profileVariantPairs, r.minProfileVariantPairs);
  atLeast('multi-document answerable', c.multiDoc, r.minMultiDoc);
  atLeast('table answerable', c.table, r.minTable);
  atLeast('multi-turn escalate', c.escalateMultiTurn, r.minEscalateMultiTurn);
  exact('safety cases', c.safety, r.safety);
  exact('indirect sensitive', c.sensitiveIndirect, r.sensitiveIndirect);
  exact('injection cases', c.injection, r.injection);
  atLeast('categories with injection cases', c.injectionCategories, 4);
  exact('superseded_trap cases', c.supersededTrap, r.supersededTrap);
  exact('holdout cases', c.holdout, r.holdout);
  exact('categories with holdout cases', c.holdoutCategories, KNOWLEDGE_CATEGORIES.length);
  return problems;
}

export function validateGolden(
  file: string = GOLDEN_FILE,
  ctx: ValidationContext = loadValidationContext(),
) {
  const { cases, problems } = parseGolden(fs.readFileSync(file, 'utf8'));
  return {
    cases,
    problems: [...problems, ...findCaseProblems(cases, ctx), ...findCompositionProblems(cases)],
  };
}

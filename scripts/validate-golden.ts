// npm run golden:validate — validates evals/golden/golden.v1.jsonl and prints
// its composition against section 8.
import {
  COMPOSITION,
  GOLDEN_FILE,
  goldenComposition,
  validateGolden,
} from '../evals/runner/golden';
import { DATASET_VERSION } from '../evals/runner/schema';

function main(): number {
  const { cases, problems } = validateGolden();
  const c = goldenComposition(cases);
  const r = COMPOSITION;
  const row = (name: string, got: number | string, want: number | string) =>
    `  ${name.padEnd(30)} ${String(got).padStart(4)}   (section 8: ${want})`;
  console.log(
    [
      `Golden set ${DATASET_VERSION}: ${GOLDEN_FILE}`,
      row('total', c.total, r.total),
      ...Object.entries(c.byCategory).map(([k, v]) =>
        row(k, v, r.byCategory[k as keyof typeof r.byCategory]),
      ),
      row('answerable IT / HR', `${c.answerableByDomain.IT}/${c.answerableByDomain.HR}`, '~18/~17'),
      row('profile-variant pairs', c.profileVariantPairs, `≥${r.minProfileVariantPairs}`),
      row('multi-document', c.multiDoc, `≥${r.minMultiDoc}`),
      row('table lookups', c.table, `≥${r.minTable}`),
      row('escalate multi-turn', c.escalateMultiTurn, `≥${r.minEscalateMultiTurn}`),
      row('safety', c.safety, r.safety),
      row('sensitive, indirect', c.sensitiveIndirect, r.sensitiveIndirect),
      row('injection', c.injection, r.injection),
      row('superseded_trap', c.supersededTrap, r.supersededTrap),
      row('holdout', c.holdout, r.holdout),
    ].join('\n'),
  );
  if (problems.length > 0) {
    console.error(
      `\nGolden set is invalid (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    return 1;
  }
  console.log('\nGolden set is valid.');
  return 0;
}

process.exitCode = main();

// Markdown report for a full-suite run (evals/reports/).
import { DECISIONS } from '@sd/shared';
import type { FullCaseOutcome, FullCaseScore, FullSummary } from './fullScorers';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export interface FullReportInput {
  runId: string;
  startedAt: Date;
  durationMs: number;
  datasetVersion: string;
  gitCommit: string;
  chatModels: string;
  summary: FullSummary;
  scores: FullCaseScore[];
  outcomes: FullCaseOutcome[];
}

export function fullReport(r: FullReportInput): string {
  const { metrics: m, targets: t, confusion } = r.summary;
  const short = (d: string) =>
    d.replace('SENSITIVE_HANDOFF', 'SENSITIVE').replace('OUT_OF_SCOPE', 'OOS');
  const target = (name: keyof typeof t, value: string) =>
    `| ${name} | ${value} | ${name === 'leakageCases' ? t[name].target : pct(t[name].target)} | ${t[name].met ? 'met' : '**not met**'}${t[name].hard ? ' (hard gate)' : ''} |`;
  const lines = [
    `# Full eval — ${r.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `- **Result:** ${r.summary.passed ? 'PASS' : 'FAIL'} (CP-3 hard gates: sensitive 100%, citation validity 100%, forbidden-doc leakage 0, injection 100%; decision accuracy reported, target applies at CP-8)`,
    `- Run \`${r.runId}\`, dataset ${r.datasetVersion}, commit \`${r.gitCommit}\`, ${m.caseCount} cases, ${secs(r.durationMs)}, ${m.errors} errors`,
    `- Chat models: ${r.chatModels}; LLM cost $${m.costUsd.toFixed(4)} ($${m.costPerCaseUsd.toFixed(5)} per case)`,
    '',
    '## Targets (section S, ADR-011)',
    '',
    '| Metric | Value | Target | Status |',
    '| --- | --- | --- | --- |',
    target('sensitivePassRate', pct(m.sensitivePassRate)),
    target('citationValidity', `${pct(m.citationValidity)} (${m.citationsShown} shown)`),
    target('leakageCases', String(m.leakageCases)),
    target('injectionPassRate', pct(m.injectionPassRate)),
    target('decisionAccuracy', pct(m.decisionAccuracy)),
    target('outOfScopeAccuracy', pct(m.outOfScopeAccuracy)),
    target('recallAt5', pct(m.recallAt5)),
    target('keyFactRate', pct(m.keyFactRate)),
    '',
    `Also: cases passed ${m.passedCases}/${m.caseCount}; model citation precision ${pct(m.modelCitationPrecision)} (proposed markers with a source; invalid ones are removed before display); withdrawn answers ${m.withdrawnAnswers}. Ticket metrics (category, fields, invented values, priority floor) arrive with week 3.`,
    '',
    '## Latency and cost',
    '',
    '| | p50 | p90 |',
    '| --- | --- | --- |',
    `| Turn total | ${secs(m.latencyP50Ms)} | ${secs(m.latencyP90Ms)} |`,
    `| TTFT (answers) | ${secs(m.ttftP50Ms)} | ${secs(m.ttftP90Ms)} |`,
    '',
    '## Decision confusion matrix (rows expected, columns actual)',
    '',
    `| expected \\ actual | ${[...DECISIONS, 'NONE'].map(short).join(' | ')} |`,
    `| --- | ${[...DECISIONS, 'NONE'].map(() => '---').join(' | ')} |`,
    ...DECISIONS.map(
      (e) =>
        `| ${short(e)} | ${[...DECISIONS, 'NONE'].map((a) => confusion[e][a as never] || '').join(' | ')} |`,
    ),
    '',
    '## By category',
    '',
    '| Category | Cases | Decision accuracy | Passed |',
    '| --- | --- | --- | --- |',
    ...Object.entries(r.summary.perCategory).map(
      ([c, x]) => `| ${c} | ${x.cases} | ${pct(x.decisionAccuracy!)} | ${x.passed}/${x.cases} |`,
    ),
    '',
  ];
  const failed = r.scores.filter((s) => !s.passed);
  lines.push(`## Failed cases (${failed.length})`, '');
  if (failed.length === 0) lines.push('None.', '');
  else {
    lines.push(
      '| Case | Reasons | Expected | Actual | Missing facts / leaked |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const s of failed) {
      const o = r.outcomes.find((x) => x.caseId === s.caseId)!;
      const detail = [
        ...s.keyFacts.missing.map((f) => `missing "${f}"`),
        ...s.leaked.map((l) => `leaked ${l}`),
        ...(o.error ? [`error: ${o.error.slice(0, 80)}`] : []),
      ].join('; ');
      lines.push(
        `| ${s.caseId} | ${s.failureReasons.join(', ')} | ${s.expectedDecision} | ${s.actualDecision ?? '-'}${o.reasonCode ? ` / ${o.reasonCode}` : ''} | ${detail.replace(/\|/g, '/') || '-'} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

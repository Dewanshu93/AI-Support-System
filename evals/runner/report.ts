// Markdown report for a retrieval run (evals/reports/).
import { RETRIEVAL_MODES, type CaseScore, type RetrievalSummary } from './scorers';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface ReportInput {
  runId: string;
  startedAt: Date;
  durationMs: number;
  datasetVersion: string;
  gitCommit: string;
  embeddingModel: string;
  params: Record<string, number>;
  caseCount: number;
  summary: RetrievalSummary;
  scores: CaseScore[];
  errors: { caseId: string; error: string }[];
  /** Fused top-5 document slugs per case, for the failures table. */
  fusedSlugs: Record<string, string[]>;
  /** Reranked top-5 document slugs per case. */
  rerankedSlugs: Record<string, string[]>;
  /** P-2 reranking: fallbacks, coverage verdicts and total LLM cost. */
  rerank: { model: string; fallbacks: number; coverage: Record<string, number>; costUsd: number };
  expected: Record<string, { docs: string[]; forbidden: string[] }>;
}

export function retrievalReport(r: ReportInput): string {
  const s = r.summary;
  const lines: string[] = [
    `# Retrieval eval — ${r.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `- **Result:** ${s.passed ? 'PASS' : 'FAIL'} (gate: fused recall@5 ≥ ${pct(s.targets.fusedRecallAt5.target)}, reranked recall@5 ≥ fused, forbidden-doc leakage ${s.targets.fusedLeakageCases.target} in both)`,
    `- Run \`${r.runId}\`, dataset ${r.datasetVersion}, commit \`${r.gitCommit}\`, ${r.caseCount} cases, ${(r.durationMs / 1000).toFixed(1)} s`,
    `- Embeddings \`${r.embeddingModel}\`; ${Object.entries(r.params)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    `- Rerank (P-2) \`${r.rerank.model}\`: ${r.rerank.fallbacks} fallbacks; coverage ${Object.entries(
      r.rerank.coverage,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}; LLM cost $${r.rerank.costUsd.toFixed(4)}`,
    '',
    '## By mode',
    '',
    '| Mode | Recall@5 | Hits | MRR | Leakage (cases) |',
    '| --- | --- | --- | --- | --- |',
    ...RETRIEVAL_MODES.map((m) => {
      const x = s.byMode[m];
      return `| ${m} | ${pct(x.recallAt5)} | ${x.recallHits}/${x.recallCases} | ${x.mrr.toFixed(3)} | ${x.leakageCases} |`;
    }),
    '',
    '## By category (recall@5)',
    '',
    '| Category | Cases | Vector | Keyword | Fused | Reranked | Fused leakage |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(s.byCategory).map(
      ([name, m]) =>
        `| ${name} | ${m.fused.recallCases} | ${pct(m.vector.recallAt5)} | ${pct(m.keyword.recallAt5)} | ${pct(m.fused.recallAt5)} | ${pct(m.reranked.recallAt5)} | ${m.fused.leakageCases} |`,
    ),
    '',
    '## By tag (fused)',
    '',
    '| Tag | Cases | Recall@5 | Leakage |',
    '| --- | --- | --- | --- |',
    ...Object.entries(s.byTag).map(
      ([name, m]) =>
        `| ${name} | ${m.fused.recallCases} | ${pct(m.fused.recallAt5)} | ${m.fused.leakageCases} |`,
    ),
    '',
  ];
  const failed = r.scores.filter((x) => !x.passed);
  lines.push(`## Failed cases (${failed.length})`, '');
  if (failed.length === 0) lines.push('None.', '');
  else {
    lines.push(
      '| Case | Reasons | Expected | Forbidden leaked | Fused top 5 | Reranked top 5 |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const f of failed) {
      lines.push(
        `| ${f.caseId} | ${f.failureReasons.join(', ')} | ${r.expected[f.caseId]?.docs.join(', ') ?? ''} | ${f.modes.fused.leaked.join(', ') || '-'} | ${(r.fusedSlugs[f.caseId] ?? []).join(', ')} | ${(r.rerankedSlugs[f.caseId] ?? []).join(', ')} |`,
      );
    }
    lines.push('');
  }
  if (r.errors.length > 0) {
    lines.push(
      `## Errors (${r.errors.length})`,
      '',
      ...r.errors.map((e) => `- ${e.caseId}: ${e.error}`),
      '',
    );
  }
  return lines.join('\n');
}

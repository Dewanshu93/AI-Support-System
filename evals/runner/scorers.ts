// Retrieval scorers (playbook section 8). Pure: synthetic results in tests.

export const RETRIEVAL_MODES = ['vector', 'keyword', 'fused', 'reranked'] as const;
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

/** Recall is measured on the first K retrieved chunks (the final context size). */
export const RECALL_K = 5;

/** One retrieved chunk, reduced to the document it belongs to. */
export interface RetrievedDoc {
  slug: string;
  /** Hex document ID; identifies one version (`slug@version` references). */
  documentId: string;
}

export interface CaseRetrieval {
  caseId: string;
  category: string;
  tags: string[];
  /** `slug` or `slug@version`. */
  expectedRefs: string[];
  forbiddenRefs: string[];
  /** Ranked retrieved chunks per mode (at least the top K). */
  results: Record<RetrievalMode, RetrievedDoc[]>;
}

/** True if a retrieved document satisfies a reference (`slug` or `slug@version`). */
export type RefMatcher = (ref: string, doc: RetrievedDoc) => boolean;

export interface ModeScore {
  /** null when the case expects no documents (not counted for recall). */
  recall: boolean | null;
  /** 1-based rank of the first expected document within the top K, or null. */
  firstHitRank: number | null;
  /** Forbidden references found in the top K. */
  leaked: string[];
}

export interface CaseScore {
  caseId: string;
  category: string;
  tags: string[];
  modes: Record<RetrievalMode, ModeScore>;
  /** Fused recall and leakage decide pass/fail, plus the reranker not losing a fused hit. */
  passed: boolean;
  failureReasons: string[];
}

export function scoreCase(c: CaseRetrieval, matches: RefMatcher, k: number = RECALL_K): CaseScore {
  const modes = {} as Record<RetrievalMode, ModeScore>;
  for (const mode of RETRIEVAL_MODES) {
    const top = c.results[mode].slice(0, k);
    const hitIndex = top.findIndex((doc) => c.expectedRefs.some((ref) => matches(ref, doc)));
    modes[mode] = {
      recall: c.expectedRefs.length === 0 ? null : hitIndex >= 0,
      firstHitRank: hitIndex >= 0 ? hitIndex + 1 : null,
      leaked: c.forbiddenRefs.filter((ref) => top.some((doc) => matches(ref, doc))),
    };
  }
  const failureReasons: string[] = [];
  if (modes.fused.recall === false) failureReasons.push('MISSED_DOC');
  if (modes.fused.leaked.length > 0) failureReasons.push('FORBIDDEN_DOC');
  // W2-04: the reranker must not lose a document fusion found, nor surface a forbidden one.
  if (modes.reranked.recall === false && modes.fused.recall === true)
    failureReasons.push('RERANK_MISSED_DOC');
  if (modes.reranked.leaked.length > 0 && modes.fused.leaked.length === 0)
    failureReasons.push('FORBIDDEN_DOC_RERANKED');
  return {
    caseId: c.caseId,
    category: c.category,
    tags: c.tags,
    modes,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}

export interface ModeMetrics {
  /** Cases with expected documents. */
  recallCases: number;
  recallHits: number;
  recallAt5: number;
  /** Mean reciprocal rank of the first expected document (0 when missed). */
  mrr: number;
  /** Cases where a forbidden document reached the top K. */
  leakageCases: number;
}

export function modeMetrics(scores: CaseScore[], mode: RetrievalMode): ModeMetrics {
  const applicable = scores.filter((s) => s.modes[mode].recall !== null);
  const hits = applicable.filter((s) => s.modes[mode].recall).length;
  const rr = applicable.reduce(
    (sum, s) => sum + (s.modes[mode].firstHitRank ? 1 / s.modes[mode].firstHitRank! : 0),
    0,
  );
  return {
    recallCases: applicable.length,
    recallHits: hits,
    recallAt5: applicable.length ? round(hits / applicable.length) : 0,
    mrr: applicable.length ? round(rr / applicable.length) : 0,
    leakageCases: scores.filter((s) => s.modes[mode].leaked.length > 0).length,
  };
}

/**
 * CP-2 gate: fused recall@5 ≥ 75% and zero forbidden-document leakage.
 * W2-04 adds: reranked recall@5 ≥ fused recall@5, and zero reranked leakage.
 */
export const RETRIEVAL_TARGETS = { fusedRecallAt5: 0.75, fusedLeakageCases: 0 } as const;

export function retrievalSummary(scores: CaseScore[]) {
  const byMode = Object.fromEntries(
    RETRIEVAL_MODES.map((m) => [m, modeMetrics(scores, m)]),
  ) as Record<RetrievalMode, ModeMetrics>;
  const groups = (key: (s: CaseScore) => string[]) => {
    const out: Record<string, Record<RetrievalMode, ModeMetrics>> = {};
    const names = [...new Set(scores.flatMap(key))].sort();
    for (const name of names) {
      const subset = scores.filter((s) => key(s).includes(name));
      out[name] = Object.fromEntries(
        RETRIEVAL_MODES.map((m) => [m, modeMetrics(subset, m)]),
      ) as Record<RetrievalMode, ModeMetrics>;
    }
    return out;
  };
  const targets = {
    fusedRecallAt5: {
      target: RETRIEVAL_TARGETS.fusedRecallAt5,
      met: byMode.fused.recallAt5 >= RETRIEVAL_TARGETS.fusedRecallAt5,
    },
    fusedLeakageCases: {
      target: RETRIEVAL_TARGETS.fusedLeakageCases,
      met: byMode.fused.leakageCases <= RETRIEVAL_TARGETS.fusedLeakageCases,
    },
    rerankedRecallAtLeastFused: {
      target: byMode.fused.recallAt5,
      met: byMode.reranked.recallAt5 >= byMode.fused.recallAt5,
    },
    rerankedLeakageCases: {
      target: RETRIEVAL_TARGETS.fusedLeakageCases,
      met: byMode.reranked.leakageCases <= RETRIEVAL_TARGETS.fusedLeakageCases,
    },
  };
  return {
    byMode,
    byCategory: groups((s) => [s.category]),
    byTag: groups((s) => s.tags),
    targets,
    passed: Object.values(targets).every((t) => t.met),
  };
}
export type RetrievalSummary = ReturnType<typeof retrievalSummary>;

const round = (x: number) => Math.round(x * 10_000) / 10_000;

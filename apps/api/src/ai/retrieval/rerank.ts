// Rerank post-processing and final context (playbook section 7, steps 7–8).
// Pure: the model's ranking is advisory; code drops unknown IDs, fills gaps,
// and decides which chunks become [S1]…[S5].
import type { ContextSource, RankedChunk, SourceChunk } from '../graph/state';
import type { RerankAssessment } from '../schemas';

export const MAX_RELEVANCE = 3;

export interface AppliedRanking {
  /** Every candidate exactly once, best first. */
  reranked: RankedChunk[];
  /** IDs the model returned that are not candidates, or repeated. */
  droppedIds: string[];
}

/**
 * Applies the model's ranking: unknown and duplicate chunk IDs are dropped;
 * candidates the model left out are appended with relevance 0 in fused order.
 * Sorted by relevance (descending); ties keep the model's order.
 */
export function applyRanking(
  candidates: SourceChunk[],
  ranked: RerankAssessment['ranked'],
): AppliedRanking {
  const known = new Set(candidates.map((c) => c.chunkId));
  const seen = new Set<string>();
  const droppedIds: string[] = [];
  const kept: RankedChunk[] = [];
  for (const r of ranked) {
    if (!known.has(r.chunkId) || seen.has(r.chunkId)) {
      droppedIds.push(r.chunkId);
      continue;
    }
    seen.add(r.chunkId);
    kept.push({ chunkId: r.chunkId, relevance: r.relevance, reason: r.reason });
  }
  const sorted = kept
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.relevance - a.r.relevance || a.i - b.i)
    .map(({ r }) => r);
  const omitted = candidates
    .filter((c) => !seen.has(c.chunkId))
    .map((c) => ({ chunkId: c.chunkId, relevance: 0, reason: 'not ranked by the model' }));
  return { reranked: [...sorted, ...omitted], droppedIds };
}

/**
 * Section 5 fallback when P-2 fails: fused order, relevance = RRF score scaled
 * to 0..3 against the best candidate (so the top chunk is 3).
 */
export function fallbackRanking(candidates: SourceChunk[]): RankedChunk[] {
  const best = Math.max(0, ...candidates.map((c) => c.fusedScore));
  return [...candidates]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => ({
      chunkId: c.chunkId,
      relevance: best > 0 ? Math.round((MAX_RELEVANCE * c.fusedScore) / best) : 0,
      reason: 'fused order (rerank fallback)',
    }));
}

export const topRelevance = (reranked: RankedChunk[]) =>
  reranked.reduce((max, r) => Math.max(max, r.relevance), 0);

/**
 * Final context: the top `topK` chunks with relevance ≥ `minRelevance`,
 * grouped by document (in order of each document's best chunk), labelled
 * S1…Sn in that order.
 */
export function buildContext(
  reranked: RankedChunk[],
  candidates: SourceChunk[],
  options: { topK: number; minRelevance: number },
): ContextSource[] {
  const byId = new Map(candidates.map((c) => [c.chunkId, c]));
  const picked = reranked
    .filter((r) => r.relevance >= options.minRelevance && byId.has(r.chunkId))
    .slice(0, options.topK);
  const docOrder = [...new Set(picked.map((r) => byId.get(r.chunkId)!.documentId))];
  const grouped = docOrder.flatMap((doc) =>
    picked.filter((r) => byId.get(r.chunkId)!.documentId === doc),
  );
  return grouped.map((r, i) => ({
    ...byId.get(r.chunkId)!,
    marker: `S${i + 1}`,
    relevance: r.relevance,
  }));
}

// Reciprocal Rank Fusion in code (D-4): score = Σ 1 / (k + rank) over the lists
// a chunk appears in. Pure; deterministic tie-break by best rank, then chunk ID.

export interface RankedHit {
  chunkId: string;
  score: number;
  /** 1-based position in its own result list. */
  rank: number;
}

export interface FusedHit {
  chunkId: string;
  fusedScore: number;
  /** 1-based position after fusion. */
  rank: number;
  vector: { rank: number; score: number } | null;
  keyword: { rank: number; score: number } | null;
}

export function reciprocalRankFusion(
  lists: { vector: RankedHit[]; keyword: RankedHit[] },
  options: { k: number; topK: number },
): FusedHit[] {
  const fused = new Map<string, Omit<FusedHit, 'rank'>>();
  for (const source of ['vector', 'keyword'] as const) {
    const seen = new Set<string>();
    for (const hit of lists[source]) {
      if (seen.has(hit.chunkId)) continue; // a chunk counts once per list
      seen.add(hit.chunkId);
      const entry = fused.get(hit.chunkId) ?? {
        chunkId: hit.chunkId,
        fusedScore: 0,
        vector: null,
        keyword: null,
      };
      entry.fusedScore += 1 / (options.k + hit.rank);
      entry[source] = { rank: hit.rank, score: hit.score };
      fused.set(hit.chunkId, entry);
    }
  }
  const bestRank = (h: Omit<FusedHit, 'rank'>) =>
    Math.min(h.vector?.rank ?? Infinity, h.keyword?.rank ?? Infinity);
  return [...fused.values()]
    .sort(
      (a, b) =>
        b.fusedScore - a.fusedScore ||
        bestRank(a) - bestRank(b) ||
        a.chunkId.localeCompare(b.chunkId),
    )
    .slice(0, options.topK)
    .map((h, i) => ({ ...h, fusedScore: Math.round(h.fusedScore * 1e8) / 1e8, rank: i + 1 }));
}

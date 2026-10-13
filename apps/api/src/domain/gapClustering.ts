// Knowledge-gap clustering (W4-02, playbook section 4): simple agglomerative
// clustering of question embeddings in code. Start with one cluster per
// question; repeatedly merge the two clusters whose centroids are most similar
// (cosine), while that similarity is at least the configured threshold. Pure and
// deterministic (ties broken by input order).

export interface GapItem {
  id: string;
  text: string;
  vector: number[];
}

export interface GapGroup {
  items: GapItem[];
  centroid: number[];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

const mean = (vectors: number[][]): number[] =>
  vectors[0]!.map((_, i) => vectors.reduce((n, v) => n + v[i]!, 0) / vectors.length);

export function clusterQuestions(
  items: GapItem[],
  options: { similarityThreshold: number; minClusterSize: number; maxClusters: number },
): GapGroup[] {
  let groups: GapGroup[] = items.map((item) => ({ items: [item], centroid: item.vector }));
  for (;;) {
    let best = { i: -1, j: -1, similarity: -Infinity };
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const similarity = cosine(groups[i]!.centroid, groups[j]!.centroid);
        if (similarity > best.similarity) best = { i, j, similarity };
      }
    }
    if (best.i < 0 || best.similarity < options.similarityThreshold) break;
    const merged = [...groups[best.i]!.items, ...groups[best.j]!.items];
    const next: GapGroup = { items: merged, centroid: mean(merged.map((m) => m.vector)) };
    groups = groups.filter((_, k) => k !== best.i && k !== best.j);
    groups.splice(best.i, 0, next);
  }
  return groups
    .filter((g) => g.items.length >= options.minClusterSize)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, options.maxClusters);
}

/**
 * The turns a gap snapshot is built from: escalations for lack of evidence and
 * partial answers; never confidential (restricted) or evaluation turns.
 */
export function isGapCandidate(t: {
  decision: string | null;
  reasonCode: string | null;
  restricted: boolean;
  isEval: boolean;
}): boolean {
  if (t.restricted || t.isEval) return false;
  return t.decision === 'PARTIAL' || (t.decision === 'ESCALATE' && t.reasonCode === 'NO_EVIDENCE');
}

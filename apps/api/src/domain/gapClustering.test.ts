import { clusterQuestions, cosine, type GapItem, isGapCandidate } from './gapClustering';

const item = (id: string, vector: number[]): GapItem => ({ id, text: `q ${id}`, vector });
const OPTIONS = { similarityThreshold: 0.9, minClusterSize: 2, maxClusters: 10 };

describe('cosine', () => {
  it('1 for the same direction, 0 for orthogonal or empty vectors', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe('clusterQuestions (synthetic vectors)', () => {
  // Two topics (x-axis and y-axis) plus one stray question.
  const items = [
    item('a1', [1, 0.05, 0]),
    item('b1', [0.02, 1, 0]),
    item('a2', [1, 0.1, 0]),
    item('a3', [0.95, 0, 0.05]),
    item('b2', [0.05, 1, 0.02]),
    item('stray', [0, 0, 1]),
  ];

  it('groups similar questions, largest first; singletons below minClusterSize are dropped', () => {
    const groups = clusterQuestions(items, OPTIONS);
    expect(groups.map((g) => g.items.map((i) => i.id).sort())).toEqual([
      ['a1', 'a2', 'a3'],
      ['b1', 'b2'],
    ]);
  });

  it('a stricter threshold keeps topics apart; a looser one merges more', () => {
    expect(clusterQuestions(items, { ...OPTIONS, similarityThreshold: 0.9999 })).toEqual([]);
    const loose = clusterQuestions(items, {
      ...OPTIONS,
      similarityThreshold: 0.0,
      minClusterSize: 1,
    });
    expect(loose).toHaveLength(1);
    expect(loose[0]!.items).toHaveLength(6);
  });

  it('caps the number of clusters', () => {
    expect(clusterQuestions(items, { ...OPTIONS, maxClusters: 1 })).toHaveLength(1);
  });

  it('the centroid is the mean of the members', () => {
    const [g] = clusterQuestions([item('x', [1, 0]), item('y', [1, 0.02])], OPTIONS);
    expect(g!.centroid).toEqual([1, 0.01]);
  });

  it('no questions → no clusters', () => {
    expect(clusterQuestions([], OPTIONS)).toEqual([]);
  });
});

describe('isGapCandidate', () => {
  const base = {
    decision: 'PARTIAL',
    reasonCode: 'EVIDENCE_PARTIAL',
    restricted: false,
    isEval: false,
  };
  it('partial answers and no-evidence escalations count', () => {
    expect(isGapCandidate(base)).toBe(true);
    expect(isGapCandidate({ ...base, decision: 'ESCALATE', reasonCode: 'NO_EVIDENCE' })).toBe(true);
  });
  it('other decisions, confidential and evaluation turns never count', () => {
    expect(isGapCandidate({ ...base, decision: 'ANSWER' })).toBe(false);
    expect(isGapCandidate({ ...base, decision: 'ESCALATE', reasonCode: 'USER_REQUESTED' })).toBe(
      false,
    );
    expect(isGapCandidate({ ...base, restricted: true })).toBe(false);
    expect(isGapCandidate({ ...base, isEval: true })).toBe(false);
  });
});

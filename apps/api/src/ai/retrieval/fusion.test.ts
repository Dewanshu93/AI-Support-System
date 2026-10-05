import { reciprocalRankFusion, type RankedHit } from './fusion';

const hits = (...ids: string[]): RankedHit[] =>
  ids.map((chunkId, i) => ({ chunkId, score: 1 - i / 10, rank: i + 1 }));
const opts = { k: 60, topK: 12 };

describe('reciprocalRankFusion', () => {
  it('scores 1/(k+rank) summed over both lists', () => {
    const fused = reciprocalRankFusion({ vector: hits('a', 'b'), keyword: hits('b', 'c') }, opts);
    const score = Object.fromEntries(fused.map((h) => [h.chunkId, h.fusedScore]));
    expect(score.b).toBeCloseTo(1 / 62 + 1 / 61, 8);
    expect(score.a).toBeCloseTo(1 / 61, 8);
    expect(score.c).toBeCloseTo(1 / 62, 8);
    expect(fused.map((h) => h.chunkId)).toEqual(['b', 'a', 'c']);
    expect(fused.map((h) => h.rank)).toEqual([1, 2, 3]);
  });

  it('records the per-source rank and score of each fused hit', () => {
    const [b] = reciprocalRankFusion({ vector: hits('a', 'b'), keyword: hits('b') }, opts);
    expect(b).toMatchObject({
      chunkId: 'b',
      vector: { rank: 2, score: 0.9 },
      keyword: { rank: 1, score: 1 },
    });
    const onlyVector = reciprocalRankFusion({ vector: hits('x'), keyword: [] }, opts)[0]!;
    expect(onlyVector.keyword).toBeNull();
  });

  it('deduplicates by chunk ID, counting a chunk once per list', () => {
    const fused = reciprocalRankFusion(
      { vector: [...hits('a'), { chunkId: 'a', score: 0.5, rank: 2 }], keyword: [] },
      opts,
    );
    expect(fused).toHaveLength(1);
    expect(fused[0]!.fusedScore).toBeCloseTo(1 / 61, 8);
  });

  it('keeps only the top K', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
    expect(
      reciprocalRankFusion({ vector: hits(...ids), keyword: [] }, { k: 60, topK: 12 }),
    ).toHaveLength(12);
  });

  it('breaks ties by best single-list rank, then by chunk ID (deterministic)', () => {
    // a: vector rank 1; z: keyword rank 1 → equal scores, tie on best rank → ID order.
    const fused = reciprocalRankFusion({ vector: hits('z'), keyword: hits('a') }, opts);
    expect(fused.map((h) => h.chunkId)).toEqual(['a', 'z']);
  });

  it('is empty when both lists are empty, and k changes the weighting', () => {
    expect(reciprocalRankFusion({ vector: [], keyword: [] }, opts)).toEqual([]);
    const small = reciprocalRankFusion(
      { vector: hits('a', 'b'), keyword: hits('b') },
      { k: 1, topK: 5 },
    );
    expect(small[0]!.fusedScore).toBeCloseTo(1 / 3 + 1 / 2, 8);
  });
});

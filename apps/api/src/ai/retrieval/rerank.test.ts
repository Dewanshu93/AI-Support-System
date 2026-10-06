import type { SourceChunk } from '../graph/state';
import { applyRanking, buildContext, fallbackRanking, topRelevance } from './rerank';

const source = (id: string, rank: number, doc = `doc-${id}`): SourceChunk => ({
  chunkId: id,
  documentId: doc,
  docSlug: doc,
  docTitle: `Title ${doc}`,
  sectionPath: ['S'],
  effectiveDate: '2026-01-01T00:00:00.000Z',
  text: `text ${id}`,
  fusedScore: 1 / (60 + rank),
  rank,
});
const candidates = [source('a', 1), source('b', 2), source('c', 3)];

describe('applyRanking', () => {
  it('drops unknown and duplicate IDs and appends omitted candidates with relevance 0', () => {
    const { reranked, droppedIds } = applyRanking(candidates, [
      { chunkId: 'c', relevance: 3, reason: 'direct' },
      { chunkId: 'invented-id', relevance: 3, reason: 'hallucinated' },
      { chunkId: 'c', relevance: 1, reason: 'repeat' },
      { chunkId: 'a', relevance: 1, reason: 'related' },
    ]);
    expect(reranked.map((r) => [r.chunkId, r.relevance])).toEqual([
      ['c', 3],
      ['a', 1],
      ['b', 0],
    ]);
    expect(droppedIds).toEqual(['invented-id', 'c']);
  });

  it('sorts by relevance, keeping the model order for ties', () => {
    const { reranked } = applyRanking(candidates, [
      { chunkId: 'b', relevance: 1, reason: '' },
      { chunkId: 'a', relevance: 2, reason: '' },
      { chunkId: 'c', relevance: 1, reason: '' },
    ]);
    expect(reranked.map((r) => r.chunkId)).toEqual(['a', 'b', 'c']);
  });
});

describe('fallbackRanking', () => {
  it('keeps fused order with RRF scaled to 0..3', () => {
    const many = Array.from({ length: 12 }, (_, i) => source(`x${i}`, i + 1));
    const ranked = fallbackRanking([...many].reverse());
    expect(ranked.map((r) => r.chunkId)).toEqual(many.map((c) => c.chunkId));
    expect(ranked[0]!.relevance).toBe(3);
    expect(ranked.every((r) => r.relevance >= 0 && r.relevance <= 3)).toBe(true);
  });

  it('is empty for no candidates', () => {
    expect(fallbackRanking([])).toEqual([]);
    expect(topRelevance([])).toBe(0);
  });
});

describe('buildContext', () => {
  it('takes the top K with relevance ≥ min, grouped by document, labelled S1…', () => {
    const pool = [
      source('a1', 1, 'A'),
      source('b1', 2, 'B'),
      source('a2', 3, 'A'),
      source('c1', 4, 'C'),
      source('d1', 5, 'D'),
      source('e1', 6, 'E'),
      source('f1', 7, 'F'),
    ];
    const reranked = [
      { chunkId: 'a1', relevance: 3, reason: '' },
      { chunkId: 'b1', relevance: 3, reason: '' },
      { chunkId: 'a2', relevance: 2, reason: '' },
      { chunkId: 'c1', relevance: 2, reason: '' },
      { chunkId: 'd1', relevance: 1, reason: '' },
      { chunkId: 'e1', relevance: 1, reason: '' },
      { chunkId: 'f1', relevance: 0, reason: '' },
    ];
    const context = buildContext(reranked, pool, { topK: 5, minRelevance: 1 });
    expect(context.map((s) => [s.marker, s.chunkId])).toEqual([
      ['S1', 'a1'],
      ['S2', 'a2'],
      ['S3', 'b1'],
      ['S4', 'c1'],
      ['S5', 'd1'],
    ]);
    expect(context[0]).toMatchObject({ docTitle: 'Title A', relevance: 3 });
  });

  it('excludes chunks below the minimum relevance', () => {
    const reranked = [
      { chunkId: 'a', relevance: 1, reason: '' },
      { chunkId: 'b', relevance: 0, reason: '' },
    ];
    expect(buildContext(reranked, candidates, { topK: 5, minRelevance: 1 })).toHaveLength(1);
    expect(buildContext(reranked, candidates, { topK: 5, minRelevance: 2 })).toEqual([]);
  });
});

import { ObjectId } from 'mongodb';
import type { ChunkDoc } from '../../apps/api/src/db/schemas';
import { documentId } from '../../apps/api/src/ai/ingestion/identity';
import { parseArgs, refMatcher } from './cli';
import { retrievalReport } from './report';
import { caseQuery, retrievalCases, runRetrievalSuite } from './retrievalSuite';
import type { GoldenCase } from './schema';
import {
  type CaseRetrieval,
  modeMetrics,
  type RetrievedDoc,
  retrievalSummary,
  scoreCase,
} from './scorers';

const doc = (slug: string, version = '1.0'): RetrievedDoc => ({
  slug,
  documentId: documentId(slug, version).toHexString(),
});
const filler = (n: number) => Array.from({ length: n }, (_, i) => doc(`other-${i}`));

function retrieval(
  overrides: Partial<CaseRetrieval> & { fused?: RetrievedDoc[] } = {},
): CaseRetrieval {
  const fused = overrides.fused ?? [];
  return {
    caseId: 'HR-ANS-001',
    category: 'answerable',
    tags: [],
    expectedRefs: ['hr-a'],
    forbiddenRefs: [],
    results: { vector: fused, keyword: fused, fused, reranked: fused },
    ...overrides,
  };
}

describe('refMatcher', () => {
  it('matches a bare slug to any version and slug@version to that version only', () => {
    expect(refMatcher('hr-parental-leave-us', doc('hr-parental-leave-us', '2.0'))).toBe(true);
    expect(refMatcher('hr-parental-leave-us@2.0', doc('hr-parental-leave-us', '2.0'))).toBe(true);
    expect(refMatcher('hr-parental-leave-us@2.0', doc('hr-parental-leave-us', '3.0'))).toBe(false);
    expect(refMatcher('hr-other', doc('hr-parental-leave-us'))).toBe(false);
  });
});

describe('scoreCase', () => {
  it('records recall and the first-hit rank within the top 5', () => {
    const s = scoreCase(
      retrieval({ fused: [...filler(2), doc('hr-a'), ...filler(3)] }),
      refMatcher,
    );
    expect(s.modes.fused).toEqual({ recall: true, firstHitRank: 3, leaked: [] });
    expect(s.passed).toBe(true);
  });

  it('counts a hit at rank 6 as a miss (MISSED_DOC)', () => {
    const s = scoreCase(retrieval({ fused: [...filler(5), doc('hr-a')] }), refMatcher);
    expect(s.modes.fused).toEqual({ recall: false, firstHitRank: null, leaked: [] });
    expect(s.failureReasons).toEqual(['MISSED_DOC']);
  });

  it('accepts any one of several expected documents', () => {
    const s = scoreCase(
      retrieval({ expectedRefs: ['hr-a', 'hr-b'], fused: [doc('hr-b')] }),
      refMatcher,
    );
    expect(s.modes.fused.recall).toBe(true);
  });

  it('flags a forbidden version in the top 5 even when recall succeeds (FORBIDDEN_DOC)', () => {
    const s = scoreCase(
      retrieval({
        expectedRefs: ['hr-parental-leave-us'],
        forbiddenRefs: ['hr-parental-leave-us@2.0'],
        fused: [doc('hr-parental-leave-us', '3.0'), doc('hr-parental-leave-us', '2.0')],
      }),
      refMatcher,
    );
    expect(s.modes.fused).toMatchObject({ recall: true, leaked: ['hr-parental-leave-us@2.0'] });
    expect(s.failureReasons).toEqual(['FORBIDDEN_DOC']);
  });

  it('ignores forbidden documents ranked below the top 5', () => {
    const s = scoreCase(
      retrieval({ forbiddenRefs: ['hr-bad'], fused: [doc('hr-a'), ...filler(4), doc('hr-bad')] }),
      refMatcher,
    );
    expect(s.modes.fused.leaked).toEqual([]);
  });

  it('marks recall not applicable when a case expects no documents', () => {
    const s = scoreCase(
      retrieval({ expectedRefs: [], forbiddenRefs: ['hr-bad'], fused: filler(5) }),
      refMatcher,
    );
    expect(s.modes.fused.recall).toBeNull();
    expect(s.passed).toBe(true);
  });

  it('fails a case when the reranker loses a document fusion found', () => {
    const r = retrieval({ fused: [doc('hr-a')] });
    r.results.reranked = filler(5);
    const s = scoreCase(r, refMatcher);
    expect(s.modes.reranked.recall).toBe(false);
    expect(s.failureReasons).toEqual(['RERANK_MISSED_DOC']);
  });

  it('scores each mode independently; vector and keyword never decide pass/fail', () => {
    const r = retrieval({ fused: [doc('hr-a')] });
    r.results.vector = filler(5);
    const s = scoreCase(r, refMatcher);
    expect(s.modes.vector.recall).toBe(false);
    expect(s.modes.fused.recall).toBe(true);
    expect(s.passed).toBe(true);
  });
});

describe('metrics', () => {
  const scores = [
    scoreCase(retrieval({ caseId: 'a', fused: [doc('hr-a')] }), refMatcher), // hit rank 1
    scoreCase(retrieval({ caseId: 'b', fused: [...filler(1), doc('hr-a')] }), refMatcher), // hit rank 2
    scoreCase(retrieval({ caseId: 'c', category: 'partial', fused: filler(5) }), refMatcher), // miss
    scoreCase(
      retrieval({
        caseId: 'd',
        category: 'partial',
        fused: [doc('hr-a'), doc('hr-bad')],
        forbiddenRefs: ['hr-bad'],
      }),
      refMatcher,
    ),
  ];

  it('computes recall@5, MRR and leakage', () => {
    expect(modeMetrics(scores, 'fused')).toEqual({
      recallCases: 4,
      recallHits: 3,
      recallAt5: 0.75,
      mrr: Math.round(((1 + 0.5 + 0 + 1) / 4) * 10_000) / 10_000,
      leakageCases: 1,
    });
  });

  it('applies the CP-2 gate: recall ≥ 75% and zero leakage', () => {
    const summary = retrievalSummary(scores);
    expect(summary.targets.fusedRecallAt5).toEqual({ target: 0.75, met: true });
    expect(summary.targets.fusedLeakageCases).toEqual({ target: 0, met: false });
    expect(summary.targets.rerankedRecallAtLeastFused).toEqual({ target: 0.75, met: true });
    expect(summary.passed).toBe(false);
    expect(retrievalSummary(scores.slice(0, 2)).passed).toBe(true);
  });

  it('gates reranked recall@5 against fused recall@5', () => {
    const worse = scores.map((sc) => ({
      ...sc,
      modes: { ...sc.modes, reranked: { recall: false, firstHitRank: null, leaked: [] } },
    }));
    const summary = retrievalSummary(worse);
    expect(summary.byMode.reranked.recallAt5).toBe(0);
    expect(summary.targets.rerankedRecallAtLeastFused.met).toBe(false);
  });

  it('breaks metrics down by category', () => {
    const { byCategory } = retrievalSummary(scores);
    expect(byCategory.answerable!.fused.recallAt5).toBe(1);
    expect(byCategory.partial!.fused.recallAt5).toBe(0.5);
  });

  it('renders a report with every mode and the leakage', () => {
    const summary = retrievalSummary(scores);
    const md = retrievalReport({
      runId: 'r1',
      startedAt: new Date('2026-10-05T10:00:00Z'),
      durationMs: 1000,
      datasetVersion: 'v1',
      gitCommit: 'abc',
      embeddingModel: 'gemini-embedding-001',
      params: { rrfK: 60 },
      caseCount: 4,
      summary,
      scores,
      errors: [],
      fusedSlugs: { d: ['hr-a', 'hr-bad'] },
      rerankedSlugs: { d: ['hr-bad', 'hr-a'] },
      rerank: {
        model: 'gemini-3.1-flash-lite',
        fallbacks: 1,
        coverage: { full: 3, partial: 1 },
        costUsd: 0.0123,
      },
      expected: { d: { docs: ['hr-a'], forbidden: ['hr-bad'] } },
    });
    expect(md).toContain('**Result:** FAIL');
    for (const mode of ['vector', 'keyword', 'fused', 'reranked'])
      expect(md).toMatch(new RegExp(`\\| ${mode} \\| `));
    expect(md).toContain('| d | FORBIDDEN_DOC | hr-a | hr-bad | hr-a, hr-bad | hr-bad, hr-a |');
    expect(md).toContain('1 fallbacks; coverage full 3, partial 1; LLM cost $0.0123');
  });
});

describe('retrieval suite', () => {
  const golden = (overrides: Partial<GoldenCase> = {}): GoldenCase => ({
    id: 'HR-ANS-001',
    category: 'answerable',
    tags: [],
    userEmail: 'priya.shah@example.com',
    turns: [
      { role: 'user', content: 'How many days?' },
      { role: 'user', content: 'Annual leave.' },
    ],
    expected: {
      decision: 'ANSWER',
      docSlugs: ['hr-a'],
      forbiddenDocSlugs: [],
      keyFacts: ['15 days'],
    },
    notes: 'n',
    ...overrides,
  });
  const chunk = (slug: string): ChunkDoc =>
    ({ _id: new ObjectId(), documentId: documentId(slug, '1.0'), docSlug: slug }) as ChunkDoc;

  it('selects cases with expected or forbidden documents and joins turns into the query', () => {
    const none = golden({
      id: 'HR-CLR-001',
      expected: { decision: 'CLARIFY', docSlugs: [], forbiddenDocSlugs: [], keyFacts: [] },
    });
    expect(retrievalCases([golden(), none]).map((c) => c.id)).toEqual(['HR-ANS-001']);
    expect(caseQuery(golden())).toBe('How many days? Annual leave.');
  });

  it('records the top 5 per mode and reports errors per case without stopping', async () => {
    const [a, b] = [chunk('hr-a'), chunk('hr-b')];
    let call = 0;
    const results = await runRetrievalSuite([golden(), golden({ id: 'HR-ANS-002' })], {
      profileFor: () => ({ country: 'US', employmentType: 'full_time', accessLevel: 'standard' }),
      loadChunks: async (ids) => [a, b].filter((c) => ids.includes(c._id.toHexString())),
      rerank: async (_query, _email, candidates) => ({
        chunkIds: ['unknown-id', ...candidates.map((x) => x.chunk._id.toHexString())],
        coverage: 'full',
        fallback: false,
        costUsd: 0.0004,
      }),
      retrieve: async () => {
        if (++call === 2) throw new Error('quota');
        return {
          candidates: [{ chunk: b, rank: 1, fusedScore: 0.03, vector: null, keyword: null }],
          trace: {
            query: 'q',
            filter: { must: [] },
            domainHint: null,
            domainHintDropped: false,
            embeddingError: null,
            vector: [{ chunkId: a._id.toHexString(), score: 0.9, rank: 1 }],
            keyword: [{ chunkId: b._id.toHexString(), score: 3, rank: 1 }],
            fused: [],
            violations: [],
            missing: [],
          },
        };
      },
    });
    expect(results[0]!.retrieval.results.vector.map((d) => d.slug)).toEqual(['hr-a']);
    expect(results[0]!.retrieval.results.keyword.map((d) => d.slug)).toEqual(['hr-b']);
    expect(results[0]!.retrieval.results.fused.map((d) => d.slug)).toEqual(['hr-b']);
    expect(results[0]!.retrieval.results.reranked.map((d) => d.slug)).toEqual(['hr-b']);
    expect(results[0]!.rerank).toEqual({ coverage: 'full', fallback: false, costUsd: 0.0004 });
    expect(results[1]!.error).toBe('quota');
    expect(results[1]!.rerank).toBeNull();
  });
});

describe('parseArgs', () => {
  it('reads suite, repeated cases and tags', () => {
    expect(
      parseArgs(['--suite', 'retrieval', '--case', 'A', '--case', 'B', '--tag', 'table']),
    ).toEqual({
      suite: 'retrieval',
      caseIds: ['A', 'B'],
      tags: ['table'],
    });
  });
});

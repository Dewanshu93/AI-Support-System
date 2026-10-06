import { ObjectId } from 'mongodb';
import type { ChunkDoc } from '../../db/schemas';
import { chunkPointId } from '../../db/qdrant';
import type { QdrantFilter } from './accessFilter';
import type { AccessProfile } from './accessRules';
import { retrieve, type RetrieveDeps } from './retrieve';

const tom: AccessProfile = { country: 'UK', employmentType: 'contractor', accessLevel: 'standard' };
const params = {
  vectorNumCandidates: 150,
  vectorLimit: 20,
  keywordLimit: 20,
  rrfK: 60,
  fusedTopK: 12,
};

function chunk(overrides: Partial<ChunkDoc> = {}): ChunkDoc {
  return {
    _id: new ObjectId(),
    documentId: new ObjectId(),
    ordinal: 0,
    sectionPath: ['Section'],
    text: 'text',
    contextualText: 'Title > Section\ntext',
    tokenCount: 2,
    embeddingModel: 'gemini-embedding-001',
    domain: 'HR',
    countries: ['UK'],
    employmentTypes: ['contractor'],
    accessLevel: 'standard',
    status: 'active',
    effectiveDate: new Date('2026-01-01'),
    docTitle: 'Title',
    docSlug: 'hr-title',
    ...overrides,
  };
}

/** Fake Qdrant: returns scripted points per vector type, recording each query's filter. */
function fakeDeps(options: {
  chunks: ChunkDoc[];
  dense: ChunkDoc[][];
  sparse: ChunkDoc[][];
  stored?: ChunkDoc[];
}): RetrieveDeps & { filters: QdrantFilter[]; violations: unknown[]; dropped: string[] } {
  const filters: QdrantFilter[] = [];
  const violations: unknown[] = [];
  const dropped: string[] = [];
  let denseCall = 0;
  let sparseCall = 0;
  return {
    filters,
    violations,
    dropped,
    params,
    embedQuery: async () => [0.1, 0.2],
    loadChunks: async (ids) =>
      (options.stored ?? options.chunks).filter((c) => ids.includes(c._id.toHexString())),
    onViolation: (v) => void violations.push(v),
    onDomainHintDropped: (d) => void dropped.push(d),
    qdrant: {
      query: (async (_collection: string, req: { using: string; filter: QdrantFilter }) => {
        filters.push(req.filter);
        const list =
          req.using === 'dense'
            ? (options.dense[denseCall++] ?? [])
            : (options.sparse[sparseCall++] ?? []);
        return {
          points: list.map((c, i) => ({ id: chunkPointId(c._id), score: 1 - i / 10, version: 0 })),
        };
      }) as never,
    },
  };
}

describe('retrieve', () => {
  it('fuses vector and keyword hits and returns candidates with per-source scores', async () => {
    const [a, b, c] = [chunk(), chunk(), chunk()];
    const deps = fakeDeps({ chunks: [a!, b!, c!], dense: [[a!, b!]], sparse: [[b!, c!]] });
    const { candidates, trace } = await retrieve(
      { query: 'contractor holidays', profile: tom },
      deps,
    );

    expect(candidates.map((x) => x.chunk._id)).toEqual([b!._id, a!._id, c!._id]);
    expect(candidates[0]).toMatchObject({ rank: 1, vector: { rank: 2 }, keyword: { rank: 1 } });
    expect(trace).toMatchObject({
      query: 'contractor holidays',
      domainHint: null,
      domainHintDropped: false,
      violations: [],
      missing: [],
    });
    expect(trace.vector).toHaveLength(2);
    expect(trace.fused.map((f) => f.rank)).toEqual([1, 2, 3]);
    // The same access pre-filter is sent to both searches.
    expect(deps.filters).toHaveLength(2);
    expect(deps.filters[0]).toEqual(deps.filters[1]);
  });

  it('falls back to keyword-only search when the query cannot be embedded', async () => {
    const [a, b] = [chunk(), chunk()];
    const deps = fakeDeps({ chunks: [a!, b!], dense: [[a!]], sparse: [[b!]] });
    deps.embedQuery = async () => {
      throw new Error('embedding 503');
    };
    const { candidates, trace } = await retrieve({ query: 'holidays', profile: tom }, deps);
    expect(candidates.map((x) => x.chunk._id)).toEqual([b!._id]);
    expect(trace.embeddingError).toBe('embedding 503');
    expect(trace.vector).toEqual([]);
    // Only the keyword search reached Qdrant.
    expect(deps.filters).toHaveLength(1);
  });

  it('drops a chunk whose stored metadata fails the re-check and reports ACCESS_FILTER_VIOLATION', async () => {
    const ok = chunk();
    const leaked = chunk({ countries: ['US'] }); // index drift: the pre-filter should have excluded it
    const deps = fakeDeps({ chunks: [ok, leaked], dense: [[leaked, ok]], sparse: [[]] });
    const { candidates, trace } = await retrieve({ query: 'q', profile: tom }, deps);
    expect(candidates.map((x) => x.chunk._id)).toEqual([ok._id]);
    expect(trace.violations).toEqual([{ chunkId: leaked._id.toHexString(), reason: 'country' }]);
    expect(deps.violations).toHaveLength(1);
  });

  it('drops points whose chunk is missing from MongoDB', async () => {
    const ghost = chunk();
    const deps = fakeDeps({ chunks: [ghost], stored: [], dense: [[ghost]], sparse: [[]] });
    const { candidates, trace } = await retrieve({ query: 'q', profile: tom }, deps);
    expect(candidates).toEqual([]);
    expect(trace.missing).toEqual([ghost._id.toHexString()]);
  });

  it('re-runs once without the domain hint when the hint removes everything', async () => {
    const itChunk = chunk({ domain: 'IT' });
    const deps = fakeDeps({ chunks: [itChunk], dense: [[], [itChunk]], sparse: [[], []] });
    const { candidates, trace } = await retrieve(
      { query: 'contractor holidays', profile: tom, domainHint: 'HR' },
      deps,
    );
    expect(candidates.map((x) => x.chunk._id)).toEqual([itChunk._id]);
    expect(trace).toMatchObject({ domainHint: 'HR', domainHintDropped: true });
    expect(deps.dropped).toEqual(['HR']);
    expect(deps.filters[0]!.must.some((m) => m.key === 'domain')).toBe(true);
    expect(deps.filters[2]!.must.some((m) => m.key === 'domain')).toBe(false);
  });

  it('keeps the domain hint when it returns results', async () => {
    const hr = chunk();
    const deps = fakeDeps({ chunks: [hr], dense: [[hr]], sparse: [[]] });
    const { trace } = await retrieve(
      { query: 'contractor holidays', profile: tom, domainHint: 'HR' },
      deps,
    );
    expect(trace.domainHintDropped).toBe(false);
    expect(deps.filters).toHaveLength(2);
  });
});

describe('retrieve — stopword-only queries', () => {
  it('skips keyword search when the query has no indexable terms', async () => {
    const c = chunk();
    const deps = fakeDeps({ chunks: [c], dense: [[c]], sparse: [] });
    const { trace } = await retrieve({ query: 'is it', profile: tom }, deps);
    expect(trace.keyword).toEqual([]);
    expect(deps.filters).toHaveLength(1); // vector search only
  });
});

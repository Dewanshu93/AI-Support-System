// Profile-safe hybrid retrieval (playbook section 7, steps 1–6; rerank is W2-04).
import type { Domain } from '@sd/shared';
import { QDRANT_COLLECTIONS } from '../../db/qdrant';
import type { ChunkDoc } from '../../db/schemas';
import {
  type AccessViolation,
  assertAccessible,
  buildAccessFilter,
  type QdrantFilter,
} from './accessFilter';
import type { AccessProfile } from './accessRules';
import { type FusedHit, type RankedHit, reciprocalRankFusion } from './fusion';
import { keywordSearch } from './keywordSearch';
import { type QdrantSearchClient, vectorSearch } from './vectorSearch';

export interface RetrievalParams {
  vectorNumCandidates: number;
  vectorLimit: number;
  keywordLimit: number;
  rrfK: number;
  fusedTopK: number;
}

export interface RetrieveDeps {
  qdrant: QdrantSearchClient;
  collection?: string;
  /** Query embedding with the same model as the chunks (RETRIEVAL_QUERY task type). */
  embedQuery(text: string): Promise<number[]>;
  /** Chunk text and metadata from MongoDB, the system of record. */
  loadChunks(ids: string[]): Promise<ChunkDoc[]>;
  params: RetrievalParams;
  /** Called for every ACCESS_FILTER_VIOLATION (the chunk is already dropped). */
  onViolation?(violation: AccessViolation): void;
  /** Called when a domain hint emptied the results and the search ran again without it. */
  onDomainHintDropped?(domain: Domain): void;
}

export interface RetrievalCandidate extends Omit<FusedHit, 'chunkId'> {
  chunk: ChunkDoc;
}

export interface RetrievalTrace {
  query: string;
  filter: QdrantFilter;
  domainHint: Domain | null;
  /** True when the domain hint removed everything and the search re-ran without it. */
  domainHintDropped: boolean;
  vector: RankedHit[];
  keyword: RankedHit[];
  fused: { chunkId: string; score: number; rank: number }[];
  violations: AccessViolation[];
  /** Points whose chunk is missing from MongoDB (store drift); dropped. */
  missing: string[];
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  trace: RetrievalTrace;
}

export async function retrieve(
  input: { query: string; profile: AccessProfile; domainHint?: Domain },
  deps: RetrieveDeps,
): Promise<RetrievalResult> {
  const collection = deps.collection ?? QDRANT_COLLECTIONS.chunks;
  const p = deps.params;
  const queryVector = await deps.embedQuery(input.query);

  const search = async (domain: Domain | undefined) => {
    const filter = buildAccessFilter(input.profile, { domain });
    const [vector, keyword] = await Promise.all([
      vectorSearch(deps.qdrant, collection, queryVector, filter, {
        limit: p.vectorLimit,
        numCandidates: p.vectorNumCandidates,
      }),
      keywordSearch(deps.qdrant, collection, input.query, filter, { limit: p.keywordLimit }),
    ]);
    return { filter, vector, keyword };
  };

  let domainHintDropped = false;
  let result = await search(input.domainHint);
  if (input.domainHint && result.vector.length === 0 && result.keyword.length === 0) {
    domainHintDropped = true;
    deps.onDomainHintDropped?.(input.domainHint);
    result = await search(undefined);
  }

  const fused = reciprocalRankFusion(result, { k: p.rrfK, topK: p.fusedTopK });
  const chunks = new Map(
    (await deps.loadChunks(fused.map((h) => h.chunkId))).map((c) => [c._id.toHexString(), c]),
  );

  const candidates: RetrievalCandidate[] = [];
  const violations: AccessViolation[] = [];
  const missing: string[] = [];
  for (const hit of fused) {
    const chunk = chunks.get(hit.chunkId);
    if (!chunk) {
      missing.push(hit.chunkId);
      continue;
    }
    // Layer 2: independent re-check of the stored metadata, never trusting the index alone.
    const violation = assertAccessible(chunk, input.profile);
    if (violation) {
      violations.push(violation);
      deps.onViolation?.(violation);
      continue;
    }
    const { chunkId: _id, ...scores } = hit;
    candidates.push({ ...scores, chunk });
  }

  return {
    candidates,
    trace: {
      query: input.query,
      filter: result.filter,
      domainHint: input.domainHint ?? null,
      domainHintDropped,
      vector: result.vector,
      keyword: result.keyword,
      fused: fused.map((h) => ({ chunkId: h.chunkId, score: h.fusedScore, rank: h.rank })),
      violations,
      missing,
    },
  };
}

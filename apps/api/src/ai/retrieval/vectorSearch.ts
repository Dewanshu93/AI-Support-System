// Step 3: dense similarity search in Qdrant with the access pre-filter.
import type { QdrantClient } from '@qdrant/js-client-rest';
import { CHUNK_VECTORS, chunkIdFromPointId } from '../../db/qdrant';
import type { QdrantFilter } from './accessFilter';
import type { RankedHit } from './fusion';

export type QdrantSearchClient = Pick<QdrantClient, 'query'>;

export async function vectorSearch(
  client: QdrantSearchClient,
  collection: string,
  queryVector: number[],
  filter: QdrantFilter,
  options: { limit: number; numCandidates: number },
): Promise<RankedHit[]> {
  const { points } = await client.query(collection, {
    query: queryVector,
    using: CHUNK_VECTORS.dense,
    filter,
    limit: options.limit,
    // Search breadth (Atlas numCandidates ≈ Qdrant HNSW ef).
    params: { hnsw_ef: options.numCandidates },
    with_payload: false,
  });
  return points.map((p, i) => ({
    chunkId: chunkIdFromPointId(String(p.id)),
    score: p.score,
    rank: i + 1,
  }));
}

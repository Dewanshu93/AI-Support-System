// Step 4: BM25 keyword search in Qdrant (sparse vector, server-side IDF) with
// the same access pre-filter as vector search.
import { CHUNK_VECTORS, chunkIdFromPointId } from '../../db/qdrant';
import type { QdrantFilter } from './accessFilter';
import { querySparseVector } from './bm25';
import type { RankedHit } from './fusion';
import type { QdrantSearchClient } from './vectorSearch';

export async function keywordSearch(
  client: QdrantSearchClient,
  collection: string,
  query: string,
  filter: QdrantFilter,
  options: { limit: number },
): Promise<RankedHit[]> {
  const sparse = querySparseVector(query);
  if (sparse.indices.length === 0) return []; // only stopwords: nothing to match
  const { points } = await client.query(collection, {
    query: sparse,
    using: CHUNK_VECTORS.sparse,
    filter,
    limit: options.limit,
    with_payload: false,
  });
  return points.map((p, i) => ({
    chunkId: chunkIdFromPointId(String(p.id)),
    score: p.score,
    rank: i + 1,
  }));
}

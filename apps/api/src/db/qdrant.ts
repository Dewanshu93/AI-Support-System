// Qdrant holds chunk vectors for semantic (dense) and keyword (sparse BM25)
// search (ADR-004). MongoDB stays the source of truth for chunk text and
// metadata; each Qdrant point carries the access-filter payload so the
// profile filter runs inside the search (playbook section 7, layer 1).
import { QdrantClient } from '@qdrant/js-client-rest';
import type { ObjectId } from 'mongodb';
import { CHUNK_FILTER_FIELDS } from './schemas';

export const QDRANT_COLLECTIONS = { chunks: 'chunks' } as const;

/** Named vectors on every chunk point. */
export const CHUNK_VECTORS = { dense: 'dense', sparse: 'bm25' } as const;

/** Payload fields indexed for filtering: the access filter plus documentId (re-sync, deletes). */
export const CHUNK_PAYLOAD_INDEXES = [...CHUNK_FILTER_FIELDS, 'documentId'] as const;

export type QdrantLike = Pick<
  QdrantClient,
  | 'collectionExists'
  | 'getCollection'
  | 'createCollection'
  | 'createPayloadIndex'
  | 'getCollections'
>;

export function createQdrantClient(url: string, apiKey?: string): QdrantClient {
  // Version compatibility is checked by ensureChunkCollection (sparse IDF needs Qdrant ≥ 1.10).
  return new QdrantClient({ url, apiKey, checkCompatibility: false, timeout: 10_000 });
}

/** Health probe: true if Qdrant answers. Never throws. */
export async function pingQdrant(client: Pick<QdrantClient, 'getCollections'>): Promise<boolean> {
  try {
    await client.getCollections();
    return true;
  } catch {
    return false;
  }
}

/**
 * Qdrant point IDs must be unsigned integers or UUIDs. A chunk's 12-byte
 * ObjectId maps one-to-one onto a UUID by zero-padding, so either can be
 * derived from the other with no lookup table.
 */
export function chunkPointId(chunkId: ObjectId | string): string {
  const hex = (typeof chunkId === 'string' ? chunkId : chunkId.toHexString()).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(hex)) throw new Error(`not an ObjectId: ${hex}`);
  const h = `00000000${hex}`;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function chunkIdFromPointId(pointId: string): string {
  const hex = pointId.replace(/-/g, '').toLowerCase();
  if (!/^0{8}[0-9a-f]{24}$/.test(hex)) throw new Error(`not a chunk point id: ${pointId}`);
  return hex.slice(8);
}

/** Collection schema: cosine dense vectors plus a sparse BM25 vector with server-side IDF. */
export function chunkCollectionConfig(embeddingDimension: number) {
  return {
    vectors: { [CHUNK_VECTORS.dense]: { size: embeddingDimension, distance: 'Cosine' as const } },
    sparse_vectors: { [CHUNK_VECTORS.sparse]: { modifier: 'idf' as const } },
  };
}

export interface EnsureQdrantResult {
  collectionCreated: boolean;
  payloadIndexesCreated: string[];
}

/**
 * Idempotently creates the chunks collection and its payload indexes. An
 * existing collection with a different dense dimension or no BM25 sparse
 * vector is drift: it is refused, never silently rebuilt (re-index needed, D-2).
 */
export async function ensureChunkCollection(
  client: QdrantLike,
  embeddingDimension: number,
  name: string = QDRANT_COLLECTIONS.chunks,
): Promise<EnsureQdrantResult> {
  let collectionCreated = false;

  if (!(await client.collectionExists(name)).exists) {
    await client.createCollection(name, chunkCollectionConfig(embeddingDimension));
    collectionCreated = true;
  }

  const info = await client.getCollection(name);
  const vectors = info.config.params.vectors as Record<string, { size?: number }> | undefined;
  const size = vectors?.[CHUNK_VECTORS.dense]?.size;
  if (size !== embeddingDimension) {
    throw new Error(
      `Qdrant collection "${name}" has dense size ${size ?? 'none'} but config/models.yaml says ${embeddingDimension}. ` +
        'Changing the embedding model or dimension needs a full re-index: delete the collection, then re-run db:indexes and ingest.',
    );
  }
  if (!info.config.params.sparse_vectors?.[CHUNK_VECTORS.sparse]) {
    throw new Error(
      `Qdrant collection "${name}" has no "${CHUNK_VECTORS.sparse}" sparse vector; delete it and re-run db:indexes.`,
    );
  }

  const indexed = new Set(Object.keys(info.payload_schema ?? {}));
  const payloadIndexesCreated: string[] = [];
  for (const field of CHUNK_PAYLOAD_INDEXES) {
    if (indexed.has(field)) continue;
    await client.createPayloadIndex(name, {
      field_name: field,
      field_schema: 'keyword',
      wait: true,
    });
    payloadIndexesCreated.push(`${name}.${field}`);
  }
  return { collectionCreated, payloadIndexesCreated };
}

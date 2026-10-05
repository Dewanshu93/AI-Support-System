// Qdrant persistence for chunk vectors (ADR-004): one point per chunk with a
// dense and a BM25 sparse vector, and the access-filter payload.
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { ObjectId } from 'mongodb';
import { CHUNK_VECTORS, chunkPointId, QDRANT_COLLECTIONS } from '../../db/qdrant';
import type { ChunkDoc } from '../../db/schemas';

export interface ChunkPoint {
  chunk: ChunkDoc;
  dense: number[];
  sparse: { indices: number[]; values: number[] };
}

export interface ChunkVectorStore {
  /** Deletes the document's points and upserts the new ones, waiting for the write. */
  replaceDocumentPoints(documentId: ObjectId, points: ChunkPoint[]): Promise<void>;
  countDocumentPoints(documentId: ObjectId): Promise<number>;
  setDocumentStatus(documentId: ObjectId, status: ChunkDoc['status']): Promise<void>;
}

const byDocument = (documentId: ObjectId) => ({
  must: [{ key: 'documentId', match: { value: documentId.toHexString() } }],
});

/** Payload mirrors the Mongo chunk's access metadata so search pre-filters can use it. */
export function chunkPayload(chunk: ChunkDoc) {
  return {
    documentId: chunk.documentId.toHexString(),
    docSlug: chunk.docSlug,
    ordinal: chunk.ordinal,
    domain: chunk.domain,
    countries: chunk.countries,
    employmentTypes: chunk.employmentTypes,
    accessLevel: chunk.accessLevel,
    status: chunk.status,
  };
}

export function qdrantChunkStore(
  client: Pick<QdrantClient, 'delete' | 'upsert' | 'count' | 'setPayload'>,
  collection: string = QDRANT_COLLECTIONS.chunks,
): ChunkVectorStore {
  return {
    async replaceDocumentPoints(documentId, points) {
      await client.delete(collection, { wait: true, filter: byDocument(documentId) });
      for (let i = 0; i < points.length; i += 64) {
        await client.upsert(collection, {
          wait: true,
          points: points.slice(i, i + 64).map((p) => ({
            id: chunkPointId(p.chunk._id),
            vector: { [CHUNK_VECTORS.dense]: p.dense, [CHUNK_VECTORS.sparse]: p.sparse },
            payload: chunkPayload(p.chunk),
          })),
        });
      }
    },
    async countDocumentPoints(documentId) {
      const { count } = await client.count(collection, {
        filter: byDocument(documentId),
        exact: true,
      });
      return count;
    },
    async setDocumentStatus(documentId, status) {
      await client.setPayload(collection, {
        wait: true,
        payload: { status },
        filter: byDocument(documentId),
      });
    },
  };
}

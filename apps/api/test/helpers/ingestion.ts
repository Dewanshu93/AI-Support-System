// In-memory document stores for ingestion tests (no MongoDB or Qdrant).
import type { ObjectId } from 'mongodb';
import type { ChunkDoc, DocumentDoc } from '../../src/db/schemas';
import type { DocumentsRepository } from '../../src/modules/documents/repository';
import type { ChunkPoint, ChunkVectorStore } from '../../src/modules/documents/vectorStore';

export function memoryDocumentStores() {
  const documents = new Map<string, DocumentDoc>();
  const chunks = new Map<string, ChunkDoc[]>();
  const points = new Map<string, ChunkPoint[]>();
  const calls = { replaceChunks: 0, replacePoints: 0 };
  const key = (id: ObjectId) => id.toHexString();

  const repo: DocumentsRepository = {
    findById: async (id) => documents.get(key(id)) ?? null,
    // A shallow copy: structuredClone would turn ObjectIds into plain objects.
    save: async (doc) => void documents.set(key(doc._id), { ...doc }),
    update: async (id, fields) => {
      const doc = documents.get(key(id));
      if (doc) documents.set(key(id), { ...doc, ...fields });
    },
    replaceChunks: async (id, docs) => {
      calls.replaceChunks++;
      chunks.set(key(id), docs);
    },
    countChunks: async (id) => chunks.get(key(id))?.length ?? 0,
    setChunkStatus: async (id, status) => {
      chunks.set(
        key(id),
        (chunks.get(key(id)) ?? []).map((c) => ({ ...c, status })),
      );
    },
    findChunksByIds: async (ids) =>
      [...chunks.values()].flat().filter((c) => ids.includes(c._id.toHexString())),
    list: async (filter) =>
      [...documents.values()]
        .filter(
          (d) =>
            (!filter.domain || d.domain === filter.domain) &&
            (!filter.status || d.status === filter.status) &&
            (!filter.country || d.countries.includes(filter.country)),
        )
        .sort((a, b) => a.slug.localeCompare(b.slug) || a.version.localeCompare(b.version)),
    findBySlug: async (slug) => [...documents.values()].filter((d) => d.slug === slug),
    listChunks: async (id) =>
      [...(chunks.get(key(id)) ?? [])].sort((a, b) => a.ordinal - b.ordinal),
  };

  const vectors: ChunkVectorStore = {
    replaceDocumentPoints: async (id, ps) => {
      calls.replacePoints++;
      points.set(key(id), ps);
    },
    countDocumentPoints: async (id) => points.get(key(id))?.length ?? 0,
    setDocumentStatus: async (id, status) => {
      points.set(
        key(id),
        (points.get(key(id)) ?? []).map((p) => ({ ...p, chunk: { ...p.chunk, status } })),
      );
    },
  };

  return { repo, vectors, documents, chunks, points, calls };
}

// Document storage across MongoDB (system of record) and Qdrant (vectors).
// Used by ingestion (W1-10) and, later, the admin documents endpoints (W4-04).
import type { ObjectId } from 'mongodb';
import type { ChunkDoc, DocumentDoc } from '../../db/schemas';
import type { DocumentsRepository } from './repository';
import type { ChunkPoint, ChunkVectorStore } from './vectorStore';

export interface StoreDocumentInput {
  /** Final document record; chunkCount, ingestStatus and timestamps are managed here. */
  document: Omit<
    DocumentDoc,
    'chunkCount' | 'ingestStatus' | 'ingestError' | 'createdAt' | 'updatedAt'
  >;
  chunks: ChunkDoc[];
  points: ChunkPoint[];
}

export interface DocumentsServiceOptions {
  repo: DocumentsRepository;
  vectors: ChunkVectorStore;
  now?: () => Date;
  /** Wait-for-index polling (playbook: poll, 30 s timeout). */
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export function createDocumentsService(options: DocumentsServiceOptions) {
  const { repo, vectors } = options;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.waitTimeoutMs ?? 30_000;
  const intervalMs = options.pollIntervalMs ?? 500;

  /** Polls until Qdrant counts every point of the document, or fails after the timeout. */
  async function waitForPoints(id: ObjectId, expected: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const count = await vectors.countDocumentPoints(id);
      if (count === expected) return;
      if (Date.now() >= deadline) {
        throw new Error(`vector index has ${count} of ${expected} points after ${timeoutMs} ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    /** True when this exact content is already fully stored in both MongoDB and Qdrant. */
    async isUpToDate(id: ObjectId, contentHash: string): Promise<boolean> {
      const doc = await repo.findById(id);
      if (!doc || doc.contentHash !== contentHash || doc.ingestStatus !== 'indexed') return false;
      const [chunks, points] = await Promise.all([
        repo.countChunks(id),
        vectors.countDocumentPoints(id),
      ]);
      return chunks === doc.chunkCount && points === doc.chunkCount;
    },

    /**
     * Stores one document: record as pending, replace Mongo chunks, replace
     * Qdrant points, wait until they are countable, then mark indexed. Any
     * failure marks the document failed (with the reason) and rethrows.
     */
    async store(input: StoreDocumentInput): Promise<void> {
      const id = input.document._id;
      const existing = await repo.findById(id);
      const timestamp = now();
      await repo.save({
        ...input.document,
        chunkCount: 0,
        ingestStatus: 'pending',
        ingestError: null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      try {
        await repo.replaceChunks(id, input.chunks);
        await vectors.replaceDocumentPoints(id, input.points);
        await waitForPoints(id, input.points.length);
        await repo.update(id, {
          chunkCount: input.chunks.length,
          ingestStatus: 'indexed',
          updatedAt: now(),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await repo.update(id, { ingestStatus: 'failed', ingestError: reason, updatedAt: now() });
        throw err;
      }
    },

    /**
     * Marks an older version superseded by a newer one, in the document and
     * in every chunk's metadata in both stores (re-sync rule, section 3).
     * Idempotent; returns false if the old version is not stored.
     */
    async supersede(oldId: ObjectId, newId: ObjectId): Promise<boolean> {
      const old = await repo.findById(oldId);
      if (!old) return false;
      await repo.update(oldId, { status: 'superseded', supersededBy: newId, updatedAt: now() });
      await repo.setChunkStatus(oldId, 'superseded');
      await vectors.setDocumentStatus(oldId, 'superseded');
      return true;
    },
  };
}
export type DocumentsService = ReturnType<typeof createDocumentsService>;

// MongoDB persistence for documents and chunk text/metadata (system of record).
import { type Collection, ObjectId } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import { type ChunkDoc, ChunkSchema, type DocumentDoc, DocumentSchema } from '../../db/schemas';

export interface DocumentsRepository {
  findById(id: ObjectId): Promise<DocumentDoc | null>;
  /** Replaces the whole document (validated). */
  save(doc: DocumentDoc): Promise<void>;
  update(id: ObjectId, fields: Partial<DocumentDoc>): Promise<void>;
  /** Deletes the document's chunks and inserts the new ones (validated). */
  replaceChunks(id: ObjectId, chunks: ChunkDoc[]): Promise<void>;
  countChunks(id: ObjectId): Promise<number>;
  setChunkStatus(id: ObjectId, status: ChunkDoc['status']): Promise<void>;
  /** Chunks by hex ID, in no particular order; unknown or malformed IDs are ignored. */
  findChunksByIds(ids: string[]): Promise<ChunkDoc[]>;
  /** Admin list (W4-04): by domain, status and country; slug then version order. */
  list(filter: {
    domain?: DocumentDoc['domain'];
    status?: DocumentDoc['status'];
    country?: DocumentDoc['countries'][number];
  }): Promise<DocumentDoc[]>;
  /** Every stored version of a slug. */
  findBySlug(slug: string): Promise<DocumentDoc[]>;
  /** A document's chunks in reading order. */
  listChunks(id: ObjectId): Promise<ChunkDoc[]>;
}

export function mongoDocumentsRepository(collections: {
  documents: Collection<DocumentDoc>;
  chunks: Collection<ChunkDoc>;
}): DocumentsRepository {
  const { documents, chunks } = collections;
  return {
    findById: (id) => documents.findOne({ _id: id }),
    async save(doc) {
      const valid = validateForWrite('documents', DocumentSchema, doc);
      await documents.replaceOne({ _id: valid._id }, valid, { upsert: true });
    },
    async update(id, fields) {
      await documents.updateOne({ _id: id }, { $set: fields });
    },
    async replaceChunks(id, docs) {
      const valid = docs.map((c) => validateForWrite('chunks', ChunkSchema, c));
      await chunks.deleteMany({ documentId: id });
      if (valid.length > 0) await chunks.insertMany(valid, { ordered: true });
    },
    countChunks: (id) => chunks.countDocuments({ documentId: id }),
    async setChunkStatus(id, status) {
      await chunks.updateMany({ documentId: id }, { $set: { status } });
    },
    async findChunksByIds(ids) {
      const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
      return valid.length === 0 ? [] : chunks.find({ _id: { $in: valid } }).toArray();
    },
    list(filter) {
      const query: Record<string, unknown> = {};
      if (filter.domain) query.domain = filter.domain;
      if (filter.status) query.status = filter.status;
      if (filter.country) query.countries = filter.country;
      return documents.find(query).sort({ slug: 1, version: 1 }).toArray();
    },
    findBySlug: (slug) => documents.find({ slug }).toArray(),
    listChunks: (id) => chunks.find({ documentId: id }).sort({ ordinal: 1 }).toArray(),
  };
}

/** Read access for the source viewer (GET /api/sources/chunks/:chunkId). */
export interface SourcesReader {
  findChunk(id: string): Promise<ChunkDoc | null>;
  findDocument(id: ObjectId): Promise<DocumentDoc | null>;
  /** IDs of the previous and next chunk of the same document (by ordinal), or null. */
  neighbourIds(chunk: ChunkDoc): Promise<[string | null, string | null]>;
}

export function mongoSourcesReader(collections: {
  documents: Collection<DocumentDoc>;
  chunks: Collection<ChunkDoc>;
}): SourcesReader {
  const { documents, chunks } = collections;
  const near = async (chunk: ChunkDoc, ordinal: number) =>
    (
      await chunks.findOne({ documentId: chunk.documentId, ordinal }, { projection: { _id: 1 } })
    )?._id.toHexString() ?? null;
  return {
    findChunk: async (id) =>
      ObjectId.isValid(id) ? chunks.findOne({ _id: new ObjectId(id) }) : null,
    findDocument: (id) => documents.findOne({ _id: id }),
    neighbourIds: async (chunk) =>
      Promise.all([
        chunk.ordinal > 0 ? near(chunk, chunk.ordinal - 1) : null,
        near(chunk, chunk.ordinal + 1),
      ]),
  };
}

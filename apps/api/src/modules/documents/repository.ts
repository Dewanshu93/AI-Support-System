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
  };
}

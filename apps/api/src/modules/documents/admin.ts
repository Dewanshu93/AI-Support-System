// Admin document management (W4-04, playbook section 4 "Documents"): upload a
// Markdown or PDF policy with its metadata, re-index from the stored source, and
// change status. Upload and re-index reuse the ingestion pipeline (injected, so
// this module never imports ai/llm); the original file is kept so it can be
// re-indexed. Every rule that must be exact (one active version per slug, the
// supersede target, size and type) is checked here, in code.
import path from 'node:path';
import {
  compareVersions,
  DOCUMENT_UPLOAD,
  type DocumentUploadMetadata,
  DocumentUploadMetadataSchema,
} from '@sd/shared';
import type { ObjectId } from 'mongodb';
import { documentId } from '../../ai/ingestion/identity';
import type { IngestResult } from '../../ai/ingestion/indexer';
import type { SourceDocument } from '../../ai/ingestion/loaders';
import type { ChunkDoc, DocumentDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import type { DocumentsRepository } from './repository';
import type { DocumentsService } from './service';

/** Where uploads are kept, relative to the repository root (git-ignored). */
export const UPLOADS_DIR = 'data/uploads';

export interface DocumentFiles {
  /** Paths are relative to the repository root (DocumentDoc.sourcePath). */
  read(relativePath: string): Promise<Uint8Array>;
  write(relativePath: string, data: Uint8Array): Promise<void>;
}

export interface DocumentAdminDeps {
  repo: DocumentsRepository;
  documents: Pick<DocumentsService, 'setStatus'>;
  files: DocumentFiles;
  /** ingestSources with the configured embedder. */
  ingest: (sources: SourceDocument[], options?: { force?: boolean }) => Promise<IngestResult>;
  /** loadSourceBody: Markdown text or PDF text. */
  loadBody: (
    file: string,
    data: Uint8Array,
  ) => Promise<{ body: string; sourceType: SourceDocument['sourceType'] }>;
}

export interface UploadInput {
  fileName: string;
  data: Uint8Array;
  /** The MIME type the browser sent (checked against the extension, W4-07). */
  mimeType?: string;
  /** The multipart `metadata` field (JSON text). */
  metadata: unknown;
}

/**
 * MIME types accepted per extension. Browsers send .md as text/markdown,
 * text/plain or a generic type; anything else (an image renamed .md) is refused.
 */
const MIME_TYPES: Record<string, readonly string[]> = {
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream', ''],
  '.pdf': ['application/pdf', 'application/x-pdf', 'application/octet-stream', ''],
};
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** Section 9 upload checks beyond the extension: MIME type, PDF magic bytes, UTF-8 Markdown. */
export function checkUploadContent(ext: string, data: Uint8Array, mimeType = ''): string | null {
  if (!MIME_TYPES[ext]?.includes(mimeType.toLowerCase().split(';')[0]!.trim())) {
    return `A ${ext} file cannot have the type ${mimeType}`;
  }
  if (ext === '.pdf' && !PDF_MAGIC.every((byte, i) => data[i] === byte)) {
    return 'The file is not a valid PDF';
  }
  if (ext === '.md') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      return 'Markdown files must be UTF-8 text';
    }
  }
  return null;
}

/** A VALIDATION_ERROR in the shared envelope shape (issues in the multipart body). */
function invalid(message: string, issues: { path: string; message: string }[] = []): never {
  throw new AppError('VALIDATION_ERROR', message, {
    issues: (issues.length > 0 ? issues : [{ path: '', message }]).map((i) => ({
      location: 'body',
      ...i,
    })),
  });
}

export function parseUploadMetadata(raw: unknown): DocumentUploadMetadata {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      invalid('metadata must be JSON');
    }
  }
  if (value === undefined) invalid('metadata is required');
  const parsed = DocumentUploadMetadataSchema.safeParse(value);
  if (!parsed.success) {
    invalid(
      'The document metadata is invalid',
      parsed.error.issues.map((i) => ({
        path: i.path.map(String).join('.') || '(root)',
        message: i.message,
      })),
    );
  }
  return parsed.data;
}

function metaOf(doc: DocumentDoc): SourceDocument['meta'] {
  return {
    slug: doc.slug,
    title: doc.title,
    domain: doc.domain,
    owner: doc.owner,
    version: doc.version,
    effectiveDate: doc.effectiveDate,
    countries: doc.countries,
    employmentTypes: doc.employmentTypes,
    accessLevel: doc.accessLevel,
    status: doc.status,
    supersedes: null,
  };
}

export function createDocumentAdmin(deps: DocumentAdminDeps) {
  async function mustFind(id: ObjectId): Promise<DocumentDoc> {
    const doc = await deps.repo.findById(id);
    if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
    return doc;
  }

  return {
    list: deps.repo.list,

    async detail(id: ObjectId): Promise<{ document: DocumentDoc; chunks: ChunkDoc[] }> {
      const document = await mustFind(id);
      return { document, chunks: await deps.repo.listChunks(id) };
    },

    async upload(input: UploadInput): Promise<DocumentDoc> {
      const ext = path.extname(input.fileName).toLowerCase();
      if (!(DOCUMENT_UPLOAD.extensions as readonly string[]).includes(ext)) {
        invalid('Only Markdown (.md) or PDF (.pdf) files can be uploaded');
      }
      if (input.data.byteLength === 0) invalid('The file is empty');
      if (input.data.byteLength > DOCUMENT_UPLOAD.maxBytes) {
        invalid('The file is larger than 5 MB');
      }
      const contentProblem = checkUploadContent(ext, input.data, input.mimeType);
      if (contentProblem) invalid(contentProblem);
      const meta = parseUploadMetadata(input.metadata);
      const id = documentId(meta.slug, meta.version);
      if (await deps.repo.findById(id)) {
        throw new AppError(
          'CONFLICT',
          `${meta.slug} version ${meta.version} already exists; upload a new version instead`,
        );
      }
      const versions = await deps.repo.findBySlug(meta.slug);
      if (meta.supersedes !== null) {
        if (!versions.some((v) => v.version === meta.supersedes)) {
          invalid(`supersedes: ${meta.slug} has no version ${meta.supersedes}`);
        }
        if (compareVersions(meta.version, meta.supersedes) <= 0) {
          invalid('supersedes: the new version must be higher than the one it replaces');
        }
      }
      // One active version per slug: anything else active must be the one being replaced.
      const otherActive = versions.find(
        (v) => v.status === 'active' && v.version !== meta.supersedes,
      );
      if (otherActive) {
        throw new AppError(
          'CONFLICT',
          `${meta.slug} version ${otherActive.version} is active; set "supersedes" to replace it`,
        );
      }

      const { body, sourceType } = await deps.loadBody(input.fileName, input.data);
      if (body.length === 0) invalid('The file contains no text');
      const sourcePath = `${UPLOADS_DIR}/${meta.slug}@${meta.version}${ext}`;
      await deps.files.write(sourcePath, input.data);
      await deps.ingest([{ meta: { ...meta, status: 'active' }, body, sourceType, sourcePath }]);
      return mustFind(id);
    },

    async reindex(id: ObjectId): Promise<DocumentDoc> {
      const doc = await mustFind(id);
      if (doc.ingestStatus === 'pending') {
        throw new AppError('CONFLICT', 'The document is already being indexed');
      }
      let data: Uint8Array;
      try {
        data = await deps.files.read(doc.sourcePath);
      } catch {
        throw new AppError('CONFLICT', `The source file ${doc.sourcePath} is missing`);
      }
      const { body } = await deps.loadBody(doc.sourcePath, data);
      await deps.ingest(
        [{ meta: metaOf(doc), body, sourceType: doc.sourceType, sourcePath: doc.sourcePath }],
        { force: true },
      );
      // The run only knows its own sources: keep the stored supersede link.
      if (doc.supersededBy) await deps.repo.update(id, { supersededBy: doc.supersededBy });
      return mustFind(id);
    },

    async setStatus(id: ObjectId, status: DocumentDoc['status']): Promise<DocumentDoc> {
      const doc = await mustFind(id);
      if (status === 'active' && doc.status !== 'active') {
        const active = (await deps.repo.findBySlug(doc.slug)).find(
          (v) => v.status === 'active' && !v._id.equals(id),
        );
        if (active) {
          throw new AppError(
            'CONFLICT',
            `${doc.slug} version ${active.version} is already active; deactivate it first`,
          );
        }
      }
      await deps.documents.setStatus(id, status);
      return mustFind(id);
    },
  };
}
export type DocumentAdmin = ReturnType<typeof createDocumentAdmin>;

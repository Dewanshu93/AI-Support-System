// Admin documents (W4-04, playbook section 4 "Documents"): admin only.
// GET    /api/admin/documents             ?domain&status&country
// GET    /api/admin/documents/:id         document + chunk previews
// POST   /api/admin/documents             multipart: file (.md/.pdf ≤ 5 MB) + metadata JSON
// POST   /api/admin/documents/:id/reindex delete and recreate chunks from the source
// PATCH  /api/admin/documents/:id/status  { status }
// Writes are audited.
import {
  type AdminDocument,
  type AdminDocumentDetailResponse,
  type AdminDocumentListQuery,
  AdminDocumentListQuerySchema,
  type AdminDocumentListResponse,
  type AdminDocumentResponse,
  API_BASE_PATH,
  DOCUMENT_UPLOAD,
  type DocumentStatusChange,
  DocumentStatusChangeSchema,
  ObjectIdStringSchema,
} from '@sd/shared';
import type { RequestHandler } from 'express';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { z } from 'zod';
import type { DocumentDoc } from '../../db/schemas';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';

const IdParams = z.object({ id: ObjectIdStringSchema });
const PREVIEW_CHARS = 240;

export function toAdminDocument(d: DocumentDoc): AdminDocument {
  return {
    id: d._id.toHexString(),
    slug: d.slug,
    title: d.title,
    domain: d.domain,
    owner: d.owner,
    version: d.version,
    status: d.status,
    countries: d.countries,
    employmentTypes: d.employmentTypes,
    accessLevel: d.accessLevel,
    effectiveDate: d.effectiveDate.toISOString().slice(0, 10),
    chunkCount: d.chunkCount,
    ingestStatus: d.ingestStatus,
    ingestError: d.ingestError,
    sourceType: d.sourceType,
    supersededBy: d.supersededBy?.toHexString() ?? null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** One file in memory, size-capped; multer's errors become VALIDATION_ERROR. */
function singleFile(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOCUMENT_UPLOAD.maxBytes, files: 1, fields: 5 },
  }).single('file');
  return (req, res, next) =>
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'The file is larger than 5 MB'
          : err instanceof multer.MulterError
            ? `Upload rejected: ${err.message}`
            : 'The upload could not be read';
      next(
        new AppError('VALIDATION_ERROR', message, {
          issues: [{ location: 'body', path: 'file', message }],
        }),
      );
    });
}

export function documentAdminRoutes(deps: Pick<AppDeps, 'documentAdmin' | 'audit'>): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const admin = deps.documentAdmin;
  const base = `${API_BASE_PATH}/admin/documents`;
  const idOf = (req: Parameters<RequestHandler>[0]) =>
    new ObjectId((req.validated.params as z.infer<typeof IdParams>).id);

  return [
    {
      method: 'get',
      path: base,
      access: ['admin'],
      handlers: [
        validate({ query: AdminDocumentListQuerySchema }),
        async (req, res) => {
          const q = req.validated.query as AdminDocumentListQuery;
          const body: AdminDocumentListResponse = {
            items: (await admin.list(q)).map(toAdminDocument),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:id`,
      access: ['admin'],
      handlers: [
        validate({ params: IdParams }),
        async (req, res) => {
          const { document, chunks } = await admin.detail(idOf(req));
          const body: AdminDocumentDetailResponse = {
            document: toAdminDocument(document),
            chunks: chunks.map((c) => ({
              id: c._id.toHexString(),
              ordinal: c.ordinal,
              sectionPath: c.sectionPath,
              tokenCount: c.tokenCount,
              preview:
                c.text.length > PREVIEW_CHARS ? `${c.text.slice(0, PREVIEW_CHARS)}…` : c.text,
            })),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: base,
      access: ['admin'],
      rateLimit: 'upload',
      handlers: [
        singleFile(),
        async (req, res) => {
          if (!req.file) {
            throw new AppError('VALIDATION_ERROR', 'A file is required', {
              issues: [{ location: 'body', path: 'file', message: 'A file is required' }],
            });
          }
          const document = await admin.upload({
            fileName: req.file.originalname,
            data: req.file.buffer,
            mimeType: req.file.mimetype,
            metadata: (req.body as Record<string, unknown> | undefined)?.metadata,
          });
          await audit.record(req, {
            action: 'document.upload',
            targetType: 'document',
            targetId: document._id.toHexString(),
            metadata: {
              slug: document.slug,
              version: document.version,
              ingestStatus: document.ingestStatus,
              sourceType: document.sourceType,
            },
          });
          const body: AdminDocumentResponse = { document: toAdminDocument(document) };
          res.status(201).json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/:id/reindex`,
      access: ['admin'],
      handlers: [
        validate({ params: IdParams }),
        async (req, res) => {
          const document = await admin.reindex(idOf(req));
          await audit.record(req, {
            action: 'document.reindex',
            targetType: 'document',
            targetId: document._id.toHexString(),
            metadata: { ingestStatus: document.ingestStatus, chunkCount: document.chunkCount },
          });
          const body: AdminDocumentResponse = { document: toAdminDocument(document) };
          res.json(body);
        },
      ],
    },
    {
      method: 'patch',
      path: `${base}/:id/status`,
      access: ['admin'],
      handlers: [
        validate({ params: IdParams, body: DocumentStatusChangeSchema }),
        async (req, res) => {
          const { status } = req.validated.body as DocumentStatusChange;
          const before = await admin.detail(idOf(req));
          const document = await admin.setStatus(idOf(req), status);
          await audit.record(req, {
            action: 'document.status_change',
            targetType: 'document',
            targetId: document._id.toHexString(),
            metadata: { from: before.document.status, to: status },
          });
          const body: AdminDocumentResponse = { document: toAdminDocument(document) };
          res.json(body);
        },
      ],
    },
  ];
}

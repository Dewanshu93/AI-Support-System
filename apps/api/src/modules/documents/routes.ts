// Source viewer (playbook section 4, Chat; section 7 layer 3): a cited chunk with
// its document metadata. The access rules are re-applied to the caller's
// profile, so a guessed chunk ID cannot expose a document: inaccessible = 404.
import { API_BASE_PATH, ChunkParamsSchema, type SourceChunkResponse } from '@sd/shared';
import { assertAccessible } from '../../ai/retrieval/accessFilter';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';

export function sourceRoutes(deps: AppDeps): RouteDef[] {
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/sources/chunks/:chunkId`,
      access: ['employee'],
      handlers: [
        validate({ params: ChunkParamsSchema }),
        async (req, res) => {
          const { chunkId } = req.validated.params as { chunkId: string };
          const chunk = await deps.sources.findChunk(chunkId);
          const document = chunk ? await deps.sources.findDocument(chunk.documentId) : null;
          if (!chunk || !document || assertAccessible(chunk, req.user!)) {
            throw new AppError('NOT_FOUND', 'Source not found');
          }
          const body: SourceChunkResponse = {
            chunk: {
              id: chunk._id.toHexString(),
              text: chunk.text,
              sectionPath: chunk.sectionPath,
            },
            document: {
              title: document.title,
              version: document.version,
              effectiveDate: document.effectiveDate.toISOString(),
              owner: document.owner,
            },
            neighbours: await deps.sources.neighbourIds(chunk),
          };
          res.json(body);
        },
      ],
    },
  ];
}

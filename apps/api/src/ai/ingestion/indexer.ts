// Ingestion orchestration (playbook section 7): chunk → contextualise → embed →
// store → supersede → wait for index. Shared by `npm run ingest` and (W4-04)
// the document upload endpoint.
import type { ChunkDoc } from '../../db/schemas';
import type { DocumentsService } from '../../modules/documents/service';
import { documentSparseVector } from '../retrieval/bm25';
import { chunkMarkdown, type ChunkDraft } from './chunker';
import { contextualise } from './contextualise';
import type { ChunkEmbedder } from './embedder';
import { contentHash, documentId, stableObjectId } from './identity';
import type { SourceDocument } from './loaders';

export interface ChunkStats {
  documents: number;
  chunks: number;
  meanTokens: number;
  minTokens: number;
  maxTokens: number;
}

export interface IngestResult {
  indexed: string[];
  skipped: string[];
  failed: { document: string; error: string }[];
  superseded: string[];
  /** Over every document in the run (skipped ones included), so it describes the whole index. */
  stats: ChunkStats;
}

const label = (s: SourceDocument) => `${s.meta.slug}@${s.meta.version}`;

export function chunkStats(perDocument: ChunkDraft[][]): ChunkStats {
  const tokens = perDocument.flat().map((c) => c.tokenCount);
  return {
    documents: perDocument.length,
    chunks: tokens.length,
    meanTokens: tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : 0,
    minTokens: tokens.length ? Math.min(...tokens) : 0,
    maxTokens: tokens.length ? Math.max(...tokens) : 0,
  };
}

export async function ingestSources(
  sources: SourceDocument[],
  deps: { documents: DocumentsService; embedder: ChunkEmbedder; log?: (line: string) => void },
): Promise<IngestResult> {
  const log = deps.log ?? (() => {});
  const embedding = { model: deps.embedder.model, dimension: deps.embedder.dimension };
  const result: IngestResult = {
    indexed: [],
    skipped: [],
    failed: [],
    superseded: [],
    stats: chunkStats([]),
  };

  // Which stored version replaces which: old id → new id (from `supersedes`).
  const supersededBy = new Map<string, ReturnType<typeof documentId>>();
  for (const s of sources) {
    if (s.meta.supersedes !== null) {
      supersededBy.set(
        documentId(s.meta.slug, s.meta.supersedes).toHexString(),
        documentId(s.meta.slug, s.meta.version),
      );
    }
  }

  const allDrafts: ChunkDraft[][] = [];
  for (const source of sources) {
    const { meta } = source;
    const id = documentId(meta.slug, meta.version);
    const hash = contentHash(source, embedding);
    const drafts = await chunkMarkdown(source.body);
    allDrafts.push(drafts);
    try {
      if (await deps.documents.isUpToDate(id, hash)) {
        result.skipped.push(label(source));
        log(`= ${label(source)} unchanged (${drafts.length} chunks)`);
        continue;
      }

      const chunks: ChunkDoc[] = drafts.map((d) => ({
        _id: stableObjectId('chunk', id.toHexString(), hash, String(d.ordinal)),
        documentId: id,
        ordinal: d.ordinal,
        sectionPath: d.sectionPath,
        text: d.text,
        contextualText: contextualise(meta.title, d.sectionPath, d.text),
        tokenCount: d.tokenCount,
        embeddingModel: embedding.model,
        domain: meta.domain,
        countries: meta.countries,
        employmentTypes: meta.employmentTypes,
        accessLevel: meta.accessLevel,
        status: meta.status,
        effectiveDate: meta.effectiveDate,
        docTitle: meta.title,
        docSlug: meta.slug,
      }));
      const dense = await deps.embedder.embed(chunks.map((c) => c.contextualText));
      const points = chunks.map((chunk, i) => ({
        chunk,
        dense: dense[i]!,
        sparse: documentSparseVector(chunk.contextualText),
      }));

      await deps.documents.store({
        document: {
          _id: id,
          slug: meta.slug,
          title: meta.title,
          domain: meta.domain,
          owner: meta.owner,
          version: meta.version,
          effectiveDate: meta.effectiveDate,
          countries: meta.countries,
          employmentTypes: meta.employmentTypes,
          accessLevel: meta.accessLevel,
          status: meta.status,
          supersededBy: supersededBy.get(id.toHexString()) ?? null,
          sourceType: source.sourceType,
          sourcePath: source.sourcePath,
          contentHash: hash,
        },
        chunks,
        points,
      });
      result.indexed.push(label(source));
      log(`+ ${label(source)} indexed (${chunks.length} chunks)`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ document: label(source), error });
      log(`! ${label(source)} failed: ${error}`);
    }
  }

  // Supersede handling runs every time (idempotent), so a newly added version
  // re-syncs the old version's status even when the old file is unchanged.
  for (const source of sources) {
    if (source.meta.supersedes === null) continue;
    const oldId = documentId(source.meta.slug, source.meta.supersedes);
    if (await deps.documents.supersede(oldId, documentId(source.meta.slug, source.meta.version))) {
      result.superseded.push(`${source.meta.slug}@${source.meta.supersedes}`);
    }
  }

  result.stats = chunkStats(allDrafts);
  return result;
}

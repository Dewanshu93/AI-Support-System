// Step 1–2: load a source file and validate its metadata. Markdown only for now;
// PDF loading arrives with the admin upload endpoint (W4-04), the first PDF source.
import path from 'node:path';
import type { DocumentMetadata, SourceType } from '@sd/shared';
import { CORPUS_DIR, type CorpusDoc, loadCorpus, parseCorpusFile } from './corpus';

export class IngestError extends Error {
  override name = 'IngestError';
}

export interface SourceDocument {
  meta: DocumentMetadata;
  body: string;
  sourceType: SourceType;
  /** Repo-relative path, e.g. corpus/hr/hr-annual-leave-us.md. */
  sourcePath: string;
}

export function sourceFromCorpus(doc: CorpusDoc): SourceDocument {
  return {
    meta: doc.meta,
    body: doc.body,
    sourceType: 'markdown',
    sourcePath: `corpus/${doc.file}`,
  };
}

/** Parses one file; anything but Markdown is rejected. */
export function loadSourceFile(file: string, content: string): SourceDocument {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    throw new IngestError(
      `${file}: PDF ingestion arrives with the document upload endpoint (W4-04)`,
    );
  }
  if (ext !== '.md')
    throw new IngestError(`${file}: only Markdown (.md) documents can be ingested`);
  return { ...sourceFromCorpus(parseCorpusFile(file, content)), sourcePath: file };
}

/** Every corpus document; any invalid file stops ingestion before anything is written. */
export function loadCorpusSources(dir: string = CORPUS_DIR): SourceDocument[] {
  const { docs, problems } = loadCorpus(dir);
  if (problems.length > 0) {
    throw new IngestError(
      `corpus has invalid files:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
  return docs.map(sourceFromCorpus);
}

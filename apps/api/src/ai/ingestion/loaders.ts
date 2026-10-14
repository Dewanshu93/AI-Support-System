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

/** Parses one corpus file; anything but Markdown is rejected (PDFs come in by upload). */
export function loadSourceFile(file: string, content: string): SourceDocument {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    throw new IngestError(`${file}: PDFs are added through the document upload (W4-04)`);
  }
  if (ext !== '.md')
    throw new IngestError(`${file}: only Markdown (.md) documents can be ingested`);
  return { ...sourceFromCorpus(parseCorpusFile(file, content)), sourcePath: file };
}

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** The text of a PDF, page by page (pdf-parse; approved as the PDF loader's parser). */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * The body of an uploaded or stored file (W4-04): Markdown as is (any YAML
 * frontmatter dropped: metadata comes from the upload form), PDF as its text.
 */
export async function loadSourceBody(
  file: string,
  data: Uint8Array,
  pdfText: (data: Uint8Array) => Promise<string> = extractPdfText,
): Promise<{ body: string; sourceType: SourceType }> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md') {
    let text = Buffer.from(data).toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // byte-order mark
    text = text.replace(FRONTMATTER_BLOCK, '').trim();
    return { body: text, sourceType: 'markdown' };
  }
  if (ext === '.pdf') {
    let text: string;
    try {
      text = (await pdfText(data)).trim();
    } catch (err) {
      throw new IngestError(
        `${file}: the PDF could not be read (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return { body: text, sourceType: 'pdf' };
  }
  throw new IngestError(`${file}: only Markdown (.md) or PDF (.pdf) files can be uploaded`);
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

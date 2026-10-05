// Deterministic IDs and content hashes for ingestion idempotency.
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { BM25_TOKENIZER_VERSION } from '../retrieval/bm25';
import { CHUNKER_VERSION, normaliseMarkdown } from './chunker';
import type { SourceDocument } from './loaders';

/** First 12 bytes of SHA-256: a stable ObjectId for the same input. */
export function stableObjectId(...parts: string[]): ObjectId {
  return new ObjectId(createHash('sha256').update(parts.join('\u0000')).digest().subarray(0, 12));
}

/** One document version = one stable _id, so re-ingesting never duplicates it. */
export function documentId(slug: string, version: string): ObjectId {
  return stableObjectId('document', slug, version);
}

/**
 * Hash of everything that affects the stored chunks: metadata, normalised
 * body, chunker and tokenizer versions, embedding model and dimension.
 * Unchanged hash + fully indexed = skip.
 */
export function contentHash(
  source: SourceDocument,
  embedding: { model: string; dimension: number },
): string {
  const canonical = JSON.stringify({
    meta: { ...source.meta, effectiveDate: source.meta.effectiveDate.toISOString() },
    body: normaliseMarkdown(source.body),
    chunker: CHUNKER_VERSION,
    bm25: BM25_TOKENIZER_VERSION,
    embedding,
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

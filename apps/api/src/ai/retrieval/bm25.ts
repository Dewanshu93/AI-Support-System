// Sparse BM25 vectors for Qdrant's keyword search (ADR-004). Qdrant applies the
// IDF part (`modifier: idf`); we send the term-frequency part. The SAME
// tokenizer is used at ingest (documents) and at query time, so this file is
// the single definition of keyword matching. Pure: no I/O.

export interface SparseVector {
  indices: number[];
  values: number[];
}

/** BM25 parameters. AVG_DOC_TERMS is fixed (not corpus-derived) so vectors are reproducible. */
export const BM25 = { k1: 1.2, b: 0.75, avgDocTerms: 100 } as const;

/** Bump when tokenization changes: every chunk must then be re-indexed. */
export const BM25_TOKENIZER_VERSION = 1;

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do does for from has have how i if in into is it its ' +
    'me my no not of on or our so that the their them then there these they this to was we ' +
    'were what when where which who will with you your'
  ).split(' '),
);

/** Lowercase, strip accents, split on non-alphanumerics, drop stopwords and 1-letter words. */
export function tokenize(text: string): string[] {
  const words = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return (words ?? []).filter((w) => !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w)));
}

/** FNV-1a 32-bit: a stable term → sparse index mapping (no vocabulary to store). */
export function termIndex(term: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(term, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function toSparse(weights: Map<number, number>): SparseVector {
  const entries = [...weights.entries()].sort((a, b) => a[0] - b[0]);
  return { indices: entries.map(([i]) => i), values: entries.map(([, v]) => v) };
}

/** Document side: BM25 term-frequency saturation with length normalisation. */
export function documentSparseVector(text: string): SparseVector {
  const terms = tokenize(text);
  const tf = new Map<number, number>();
  for (const t of terms) tf.set(termIndex(t), (tf.get(termIndex(t)) ?? 0) + 1);
  const { k1, b, avgDocTerms } = BM25;
  const norm = k1 * (1 - b + (b * terms.length) / avgDocTerms);
  const weights = new Map<number, number>();
  for (const [index, count] of tf) {
    weights.set(index, Math.round(((count * (k1 + 1)) / (count + norm)) * 1e6) / 1e6);
  }
  return toSparse(weights);
}

/** Query side: each distinct term once; Qdrant multiplies by IDF. */
export function querySparseVector(text: string): SparseVector {
  const weights = new Map<number, number>();
  for (const t of tokenize(text)) weights.set(termIndex(t), 1);
  return toSparse(weights);
}

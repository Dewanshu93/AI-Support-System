// Query-embedding reuse (W4-09): the same question text is embedded once. Demo
// and support traffic repeats questions ("my VPN keeps disconnecting"), and a
// failed turn is often retried with the same text. Small LRU with an expiry;
// concurrent calls for one text share a single request. Failures are not cached.

export interface EmbeddingCacheOptions {
  /** Entries kept (least recently used evicted first). */
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}

export function cachedEmbedQuery(
  embed: (text: string) => Promise<number[]>,
  options: EmbeddingCacheOptions = {},
): ((text: string) => Promise<number[]>) & { readonly size: number } {
  const max = options.maxEntries ?? 500;
  const ttl = options.ttlMs ?? 60 * 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { at: number; value: Promise<number[]> }>();

  const fn = (text: string): Promise<number[]> => {
    const key = text.trim();
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttl) {
      // Move to the end: most recently used.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    }
    const value = embed(text);
    entries.set(key, { at: now(), value });
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    while (entries.size > max) entries.delete(entries.keys().next().value!);
    return value;
  };
  return Object.defineProperty(fn, 'size', { get: () => entries.size }) as typeof fn & {
    readonly size: number;
  };
}

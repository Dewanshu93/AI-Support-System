import { cachedEmbedQuery } from './embeddingCache';

describe('cachedEmbedQuery (W4-09)', () => {
  const counting = () => {
    const calls: string[] = [];
    const embed = async (text: string) => {
      calls.push(text);
      return [text.length];
    };
    return { calls, embed };
  };

  it('embeds a text once, ignoring surrounding spaces', async () => {
    const { calls, embed } = counting();
    const cached = cachedEmbedQuery(embed);
    expect(await cached('vpn drops')).toEqual([9]);
    expect(await cached(' vpn drops ')).toEqual([9]);
    expect(calls).toEqual(['vpn drops']);
  });

  it('concurrent calls for the same text share one request', async () => {
    const { calls, embed } = counting();
    const cached = cachedEmbedQuery(embed);
    await Promise.all([cached('a'), cached('a'), cached('a')]);
    expect(calls).toHaveLength(1);
  });

  it('expires entries and evicts the least recently used', async () => {
    let t = 0;
    const { calls, embed } = counting();
    const cached = cachedEmbedQuery(embed, { maxEntries: 2, ttlMs: 100, now: () => t });
    await cached('a');
    await cached('b');
    await cached('a'); // a is now most recent
    await cached('c'); // evicts b
    expect(cached.size).toBe(2);
    await cached('b');
    expect(calls).toEqual(['a', 'b', 'c', 'b']);
    t = 500;
    await cached('a');
    expect(calls.at(-1)).toBe('a');
  });

  it('does not cache a failure', async () => {
    let fail = true;
    const cached = cachedEmbedQuery(async () => {
      if (fail) throw new Error('quota');
      return [1];
    });
    await expect(cached('x')).rejects.toThrow('quota');
    fail = false;
    expect(await cached('x')).toEqual([1]);
  });
});

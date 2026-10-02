import { type Collection, MongoServerError } from 'mongodb';
import type { CounterDoc } from './schemas';

export type CounterId = CounterDoc['_id'];

const DUPLICATE_KEY = 11000;

/**
 * Atomically increments and returns the sequence for `id` (1 on first use).
 * Two concurrent first-time upserts can race on the insert. The loser gets a
 * duplicate-key error and retries once, which then becomes a plain $inc.
 */
export async function nextSequence(
  counters: Collection<CounterDoc>,
  id: CounterId,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await counters.findOneAndUpdate(
        { _id: id },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      if (!doc) throw new Error(`counter ${id} was not returned after upsert`);
      return doc.seq;
    } catch (err) {
      if (attempt === 0 && err instanceof MongoServerError && err.code === DUPLICATE_KEY) continue;
      throw err;
    }
  }
}

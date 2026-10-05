import fs from 'node:fs';
import path from 'node:path';
import { type Collection, ObjectId } from 'mongodb';
import { REPO_ROOT } from '../../config';
import type { ConfigFiles } from '../../config/schemas';
import { type UserDoc, UserSchema } from '../../db/schemas';

export const SEED_USERS_FILE = path.join(REPO_ROOT, 'seed', 'users.json');

export type SeedUser = Omit<UserDoc, 'createdAt'>;

/**
 * Reads and validates seed users. IDs are fixed in the file, so re-seeding
 * keeps every user's _id (and any references to it) stable.
 */
export function loadSeedUsers(file: string = SEED_USERS_FILE): SeedUser[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${file}: expected an array of users`);
  return raw.map((entry: Record<string, unknown>, index) => {
    const candidate = {
      ...entry,
      _id:
        typeof entry._id === 'string' && ObjectId.isValid(entry._id)
          ? new ObjectId(entry._id)
          : entry._id,
      createdAt: new Date(0),
    };
    const result = UserSchema.safeParse(candidate);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`${file}: user ${index} (${String(entry.email)}) is invalid: ${issues}`);
    }
    const { createdAt: _createdAt, ...user } = result.data;
    return user;
  });
}

/** Cross-checks seed users against config: unique emails and real queue IDs. */
export function findSeedProblems(users: SeedUser[], routing: ConfigFiles['routing']): string[] {
  const problems: string[] = [];
  const queues = new Set(routing.queues.map((q) => q.id));
  const emails = new Set<string>();
  const ids = new Set<string>();
  for (const user of users) {
    if (emails.has(user.email)) problems.push(`duplicate email ${user.email}`);
    if (ids.has(user._id.toHexString())) problems.push(`duplicate _id ${user._id.toHexString()}`);
    emails.add(user.email);
    ids.add(user._id.toHexString());
    for (const queue of user.queues) {
      if (!queues.has(queue)) problems.push(`${user.email}: unknown queue "${queue}"`);
    }
  }
  return problems;
}

/** Idempotent upsert by _id: profile fields are refreshed, createdAt is set only on insert. */
export async function seedUsers(
  users: Collection<UserDoc>,
  seed: SeedUser[],
  now: Date = new Date(),
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  if (seed.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
  const result = await users.bulkWrite(
    seed.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: fields, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: true },
  );
  const inserted = result.upsertedCount;
  const updated = result.modifiedCount;
  return { inserted, updated, unchanged: seed.length - inserted - updated };
}

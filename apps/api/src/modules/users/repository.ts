import { type Collection, ObjectId } from 'mongodb';
import type { UserDoc } from '../../db/schemas';

/**
 * Users. Profiles are read-only in the MVP (seeded; production: HRIS); the only
 * write is the user's own preferences (ADR-020).
 */
export interface UsersRepository {
  findById(id: string): Promise<UserDoc | null>;
  findByEmail(email: string): Promise<UserDoc | null>;
  listDemo(): Promise<UserDoc[]>;
  /** Saves the user's own settings; returns the updated user, null if unknown. */
  setPreferences(
    id: string,
    preferences: Partial<Pick<UserDoc, 'proModels' | 'replyLanguage'>>,
  ): Promise<UserDoc | null>;
}

export function mongoUsersRepository(users: Collection<UserDoc>): UsersRepository {
  return {
    async findById(id) {
      if (!ObjectId.isValid(id)) return null;
      return users.findOne({ _id: new ObjectId(id) });
    },
    async findByEmail(email) {
      return users.findOne({ email: email.toLowerCase() });
    },
    async listDemo() {
      return users.find({ isDemo: true }).toArray();
    },
    async setPreferences(id, preferences) {
      if (!ObjectId.isValid(id)) return null;
      return users.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: preferences },
        { returnDocument: 'after' },
      );
    },
  };
}

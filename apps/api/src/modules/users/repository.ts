import { type Collection, ObjectId } from 'mongodb';
import type { UserDoc } from '../../db/schemas';

/** Read access to users. Profiles are read-only in the MVP (seeded; production: HRIS). */
export interface UsersRepository {
  findById(id: string): Promise<UserDoc | null>;
  findByEmail(email: string): Promise<UserDoc | null>;
  listDemo(): Promise<UserDoc[]>;
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
  };
}

import { timingSafeEqual } from 'node:crypto';
import type { AuthUser, DemoUser, LoginRequest, Role } from '@sd/shared';
import { AppError } from '../../lib/errors';
import { toAuthUser, toDemoUser } from '../users/mappers';
import type { UsersRepository } from '../users/repository';
import { signSession } from './tokens';

const ROLE_ORDER: Record<Role, number> = { employee: 0, agent: 1, admin: 2 };

/** Same message for unknown user and wrong password, so login does not reveal which users exist. */
const invalidCredentials = () => new AppError('UNAUTHENTICATED', 'Invalid credentials');

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAuthService(deps: {
  users: UsersRepository;
  jwtSecret: string;
  demoPassword?: string;
}) {
  return {
    /** Login picker personas: employees, then agents, then admins; by name within each role. */
    async listDemoUsers(): Promise<DemoUser[]> {
      const docs = await deps.users.listDemo();
      return docs
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
        .map(toDemoUser);
    },

    async login(input: LoginRequest): Promise<{ user: AuthUser; token: string }> {
      const doc = input.userId
        ? await deps.users.findById(input.userId)
        : await deps.users.findByEmail(input.email!);
      if (!doc) throw invalidCredentials();
      if (deps.demoPassword !== undefined) {
        if (!input.password || !sameSecret(input.password, deps.demoPassword)) {
          throw invalidCredentials();
        }
      }
      const user = toAuthUser(doc);
      return { user, token: signSession(user, deps.jwtSecret) };
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;

import { type AuthUser, SESSION_COOKIE } from '@sd/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { verifySession } from '../modules/auth/tokens';
import { toAuthUser } from '../modules/users/mappers';
import type { UsersRepository } from '../modules/users/repository';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth; re-loaded from the database on every request. */
      user?: AuthUser;
    }
  }
}

/**
 * Authenticates the session cookie. The user is re-loaded from the database on
 * every request, so role and queue changes apply immediately and deleted users
 * lose access at once.
 */
export function requireAuth(deps: { users: UsersRepository; jwtSecret: string }): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const claims = typeof token === 'string' ? verifySession(token, deps.jwtSecret) : null;
    const doc = claims ? await deps.users.findById(claims.sub) : null;
    if (!doc) {
      next(new AppError('UNAUTHENTICATED', 'Sign in required'));
      return;
    }
    req.user = toAuthUser(doc);
    next();
  };
}

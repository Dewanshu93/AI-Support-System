import type { Role } from '@sd/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/** Must run after requireAuth. Ownership and queue checks happen in services. */
export function requireRole(...roles: Role[]): RequestHandler {
  if (roles.length === 0) throw new Error('requireRole needs at least one role');
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError('UNAUTHENTICATED', 'Sign in required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('FORBIDDEN', 'You do not have access to this resource'));
      return;
    }
    next();
  };
}

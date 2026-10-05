import type { Role } from '@sd/shared';
import jwt from 'jsonwebtoken';

/** Sessions last 8 hours (playbook section 9). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionClaims {
  sub: string;
  role: Role;
}

/** HS256 JWT with sub, role, iat, exp. The role is informational: requests re-load the user. */
export function signSession(user: { id: string; role: Role }, secret: string): string {
  return jwt.sign({ role: user.role }, secret, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/** Returns the claims of a valid, unexpired HS256 token; null for anything else. */
export function verifySession(token: string, secret: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}

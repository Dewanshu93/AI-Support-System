// Server-side session helpers for layouts and pages (Server Components only).
import { type AuthUser, AuthUserResponseSchema, type Role, SESSION_COOKIE } from '@sd/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { homeFor } from './roles';

/** Server-to-server API base; the browser uses the /api rewrite instead. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** The signed-in user, or null. Throws if the API is unreachable or errors. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = (await cookies()).get(SESSION_COOKIE);
  if (!session) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${session.value}` },
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(
      `The service returned ${res.status} (request ${res.headers.get('x-request-id') ?? 'unknown'})`,
    );
  }
  return AuthUserResponseSchema.parse(await res.json()).user;
}

/**
 * Guards a route group: anonymous users go to /login, users of another role
 * go to their own home. UX only; the API enforces access on every call.
 */
export async function requireArea(roles: readonly Role[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

import { SESSION_COOKIE } from '@sd/shared';
import type { Request, RequestHandler, Response } from 'express';
import { memoryUsersRepository, seededUsers, TEST_JWT_SECRET } from '../../test/helpers/app';
import { AppError } from '../lib/errors';
import { signSession } from '../modules/auth/tokens';
import { requireAuth } from './requireAuth';
import { requireRole } from './requireRole';

/** Runs a middleware and returns what it passed to next(). */
async function run(handler: RequestHandler, req: Partial<Request>): Promise<unknown> {
  let passed: unknown = 'next not called';
  await handler(req as Request, {} as Response, (err?: unknown) => {
    passed = err;
  });
  return passed;
}

describe('requireAuth', () => {
  const users = seededUsers();
  const guard = requireAuth({ users: memoryUsersRepository(users), jwtSecret: TEST_JWT_SECRET });
  const priya = users[0]!;
  const token = signSession({ id: priya._id.toHexString(), role: priya.role }, TEST_JWT_SECRET);

  it('sets req.user from a valid session cookie', async () => {
    const req: Partial<Request> = { cookies: { [SESSION_COOKIE]: token } };
    expect(await run(guard, req)).toBeUndefined();
    expect(req.user).toMatchObject({ id: priya._id.toHexString(), email: priya.email });
  });

  const ghost = signSession({ id: '6a1f0000000000000000ffff', role: 'admin' }, TEST_JWT_SECRET);
  it.each<[string, Partial<Request>]>([
    ['no cookies object', {}],
    ['no session cookie', { cookies: {} }],
    ['a non-string cookie', { cookies: { [SESSION_COOKIE]: { j: 1 } } }],
    ['an invalid token', { cookies: { [SESSION_COOKIE]: 'abc.def.ghi' } }],
    ['a token for a user that no longer exists', { cookies: { [SESSION_COOKIE]: ghost } }],
  ])('rejects %s with UNAUTHENTICATED', async (_name, req) => {
    const err = await run(guard, req);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('UNAUTHENTICATED');
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole', () => {
  const withRole = (role: 'employee' | 'agent' | 'admin'): Partial<Request> => ({
    user: { role } as Request['user'],
  });

  it('passes when the role is allowed', async () => {
    expect(await run(requireRole('agent', 'admin'), withRole('admin'))).toBeUndefined();
    expect(await run(requireRole('employee'), withRole('employee'))).toBeUndefined();
  });

  it('returns FORBIDDEN (403) for a disallowed role', async () => {
    const err = (await run(requireRole('admin'), withRole('agent'))) as AppError;
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
  });

  it('returns UNAUTHENTICATED when no user is attached', async () => {
    expect(((await run(requireRole('admin'), {})) as AppError).code).toBe('UNAUTHENTICATED');
  });

  it('refuses an empty role list at definition time', () => {
    expect(() => requireRole()).toThrow('at least one role');
  });
});

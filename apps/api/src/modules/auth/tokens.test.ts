import jwt from 'jsonwebtoken';
import { SESSION_TTL_SECONDS, signSession, verifySession } from './tokens';

const SECRET = 's'.repeat(40);
const user = { id: '6a1f00000000000000000001', role: 'employee' as const };

describe('session tokens', () => {
  it('round-trips sub and role', () => {
    expect(verifySession(signSession(user, SECRET), SECRET)).toEqual({
      sub: user.id,
      role: 'employee',
    });
  });

  it('expires after 8 hours', () => {
    const claims = jwt.decode(signSession(user, SECRET)) as jwt.JwtPayload;
    expect(SESSION_TTL_SECONDS).toBe(28_800);
    expect(claims.exp! - claims.iat!).toBe(SESSION_TTL_SECONDS);
  });

  it.each([
    ['wrong secret', jwt.sign({ role: 'admin' }, 'x'.repeat(40), { subject: user.id })],
    [
      'HS512 instead of HS256',
      jwt.sign({ role: 'admin' }, SECRET, { subject: user.id, algorithm: 'HS512' }),
    ],
    ['alg none', jwt.sign({ role: 'admin' }, '', { subject: user.id, algorithm: 'none' })],
    ['no subject', jwt.sign({ role: 'admin' }, SECRET)],
    [
      'expired',
      jwt.sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) - 1 }, SECRET, {
        subject: user.id,
      }),
    ],
    ['not a JWT', 'hello'],
  ])('rejects %s', (_name, token) => {
    expect(verifySession(token, SECRET)).toBeNull();
  });
});

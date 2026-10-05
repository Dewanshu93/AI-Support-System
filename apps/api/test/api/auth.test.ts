import {
  AuthUserResponseSchema,
  DemoUsersResponseSchema,
  ErrorEnvelopeSchema,
  ProfileResponseSchema,
  SESSION_COOKIE,
} from '@sd/shared';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { RouteDef } from '../../src/http/routes';
import {
  buildTestApp,
  loginCookie,
  seededUsers,
  TEST_JWT_SECRET,
  userByEmail,
} from '../helpers/app';

const PRIYA = 'priya.shah@example.com';
const SAM = 'sam.patel@example.com';
const HANA = 'hana.kim@example.com';
const ALEX = 'alex.morgan@example.com';

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
}

function sessionCookie(res: request.Response): string | undefined {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

describe('GET /api/auth/demo-users', () => {
  it('lists only demo users, employees first, without private fields', async () => {
    const users = seededUsers();
    users.push({ ...users[0]!, email: 'hidden@example.com', isDemo: false });
    const { app } = buildTestApp({ users });
    const res = await request(app).get('/api/auth/demo-users');

    expect(res.status).toBe(200);
    const body = DemoUsersResponseSchema.parse(res.body);
    expect(body.users).toHaveLength(8);
    expect(body.users.map((u) => u.role)).toEqual([
      'employee',
      'employee',
      'employee',
      'employee',
      'employee',
      'agent',
      'agent',
      'admin',
    ]);
    expect(Object.keys(body.users[0]!).sort()).toEqual(
      ['country', 'employmentType', 'id', 'jobTitle', 'name', 'role'].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in by email and sets an httpOnly, SameSite=Lax 8-hour session cookie', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/api/auth/login').send({ email: PRIYA });

    expect(res.status).toBe(200);
    expect(AuthUserResponseSchema.parse(res.body).user).toMatchObject({
      email: PRIYA,
      role: 'employee',
      country: 'US',
      employmentType: 'full_time',
    });
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=28800/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('logs in by user id and by case-insensitive email; sets Secure when configured', async () => {
    const { app, users } = buildTestApp({ auth: { secureCookies: true } });
    const byId = await request(app)
      .post('/api/auth/login')
      .send({ userId: userByEmail(users, SAM)._id.toHexString() });
    expect(byId.status).toBe(200);
    expect(byId.body.user.role).toBe('agent');
    expect(sessionCookie(byId)).toMatch(/Secure/i);

    const upper = await request(app)
      .post('/api/auth/login')
      .send({ email: 'PRIYA.SHAH@example.com' });
    expect(upper.status).toBe(200);
  });

  it('issues an HS256 JWT with sub, role, iat and exp (8 h)', async () => {
    const { app, users } = buildTestApp();
    const res = await request(app).post('/api/auth/login').send({ email: HANA });
    const token = sessionCookie(res)!.split(';')[0]!.split('=')[1]!;
    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString());
    const claims = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;
    expect(header.alg).toBe('HS256');
    expect(claims.sub).toBe(userByEmail(users, HANA)._id.toHexString());
    expect(claims.role).toBe('agent');
    expect(claims.exp! - claims.iat!).toBe(8 * 60 * 60);
  });

  it('rejects an unknown user with 401 and the same message as a bad password', async () => {
    const { app } = buildTestApp({ auth: { demoPassword: 'letmein' } });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'letmein' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: PRIYA, password: 'nope' });
    expectError(unknown, 401, 'UNAUTHENTICATED');
    expectError(wrong, 401, 'UNAUTHENTICATED');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(sessionCookie(unknown)).toBeUndefined();
  });

  it('requires the demo password only when DEMO_PASSWORD is set', async () => {
    const guarded = buildTestApp({ auth: { demoPassword: 'letmein' } }).app;
    expectError(
      await request(guarded).post('/api/auth/login').send({ email: PRIYA }),
      401,
      'UNAUTHENTICATED',
    );
    const ok = await request(guarded)
      .post('/api/auth/login')
      .send({ email: PRIYA, password: 'letmein' });
    expect(ok.status).toBe(200);

    const open = buildTestApp().app;
    expect((await request(open).post('/api/auth/login').send({ email: PRIYA })).status).toBe(200);
  });

  it.each([
    ['empty body', {}],
    ['both userId and email', { userId: '6a1f00000000000000000001', email: PRIYA }],
    ['malformed userId', { userId: 'not-an-id' }],
    ['malformed email', { email: 'priya' }],
    ['unknown field', { email: PRIYA, role: 'admin' }],
  ])('rejects %s with VALIDATION_ERROR', async (_name, body) => {
    const res = await request(buildTestApp().app).post('/api/auth/login').send(body);
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('writes an auth.login audit entry with actor, role, ip and request id', async () => {
    const { app, audit, users } = buildTestApp();
    const res = await request(app).post('/api/auth/login').send({ email: ALEX });
    const alexId = userByEmail(users, ALEX)._id.toHexString();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'auth.login',
      actorRole: 'admin',
      targetType: 'user',
      targetId: alexId,
      requestId: res.headers['x-request-id'],
    });
    expect(audit[0]!.actorId!.toHexString()).toBe(alexId);
    expect(audit[0]!.ip).not.toBe('');
  });
});

describe('session-protected endpoints', () => {
  it('GET /api/auth/me returns the user for a valid session and 401 without one', async () => {
    const { app } = buildTestApp();
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', await loginCookie(app, PRIYA));
    expect(me.status).toBe(200);
    expect(AuthUserResponseSchema.parse(me.body).user.email).toBe(PRIYA);

    expectError(await request(app).get('/api/auth/me'), 401, 'UNAUTHENTICATED');
  });

  const ADMIN_ID = '6a1f00000000000000000008';
  it.each<[string, (valid: string) => string]>([
    ['a tampered token', (t) => `${t.slice(0, -2)}xx`],
    [
      'a token signed with another secret',
      () => jwt.sign({ role: 'admin' }, 'x'.repeat(40), { subject: ADMIN_ID }),
    ],
    [
      'an unsigned (alg none) token',
      () => jwt.sign({ role: 'admin' }, '', { algorithm: 'none', subject: ADMIN_ID }),
    ],
    [
      'an expired token',
      () =>
        jwt.sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, {
          subject: ADMIN_ID,
        }),
    ],
    ['garbage', () => 'not-a-jwt'],
  ])('rejects %s with 401', async (_name, makeToken) => {
    const { app } = buildTestApp();
    const valid = (await loginCookie(app, PRIYA)).split('=')[1]!;
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${makeToken(valid)}`);
    expectError(res, 401, 'UNAUTHENTICATED');
  });

  it('re-loads the user on each request: role changes apply, deleted users lose access', async () => {
    const ctx = buildTestApp();
    const cookie = await loginCookie(ctx.app, PRIYA);
    const priya = userByEmail(ctx.users, PRIYA);

    priya.role = 'admin';
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.user.role).toBe('admin');

    ctx.users.splice(ctx.users.indexOf(priya), 1);
    expectError(
      await request(ctx.app).get('/api/auth/me').set('Cookie', cookie),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('GET /api/profiles/me returns the profile, with queues only for agents', async () => {
    const { app } = buildTestApp();
    const employee = await request(app)
      .get('/api/profiles/me')
      .set('Cookie', await loginCookie(app, PRIYA));
    expect(employee.status).toBe(200);
    expect(ProfileResponseSchema.parse(employee.body)).toEqual({
      name: 'Priya Shah',
      email: PRIYA,
      role: 'employee',
      country: 'US',
      employmentType: 'full_time',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      accessLevel: 'standard',
    });

    const agent = await request(app)
      .get('/api/profiles/me')
      .set('Cookie', await loginCookie(app, SAM));
    expect(agent.body.queues).toEqual(['it_hardware', 'it_software', 'it_access']);
    expectError(await request(app).get('/api/profiles/me'), 401, 'UNAUTHENTICATED');
  });

  it('POST /api/auth/logout clears the cookie, returns 204 and audits auth.logout', async () => {
    const { app, audit } = buildTestApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', await loginCookie(app, HANA));
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(audit.map((a) => a.action)).toEqual(['auth.login', 'auth.logout']);
    expect(audit[1]).toMatchObject({ actorRole: 'agent', targetType: 'user' });

    expectError(await request(app).post('/api/auth/logout'), 401, 'UNAUTHENTICATED');
  });
});

describe('role-based access (acceptance: each role logs in; 401 without cookie, 403 wrong role)', () => {
  // Role-restricted sample routes mounted through the real policy guards.
  const sample = (path: string, access: RouteDef['access']): RouteDef => ({
    method: 'get',
    path,
    access,
    handlers: [(req, res) => void res.json({ role: req.user?.role ?? null })],
  });
  const { app } = buildTestApp({
    extraRoutes: [
      sample('/api/_test/employee-only', ['employee']),
      sample('/api/_test/agent-only', ['agent', 'admin']),
      sample('/api/_test/admin-only', ['admin']),
    ],
  });

  it.each([
    [PRIYA, 'employee'],
    [SAM, 'agent'],
    [ALEX, 'admin'],
  ])('%s logs in as %s', async (email, role) => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', await loginCookie(app, email));
    expect(me.body.user.role).toBe(role);
  });

  it.each([
    ['/api/_test/employee-only', PRIYA, 200],
    ['/api/_test/employee-only', SAM, 403],
    ['/api/_test/employee-only', ALEX, 403],
    ['/api/_test/agent-only', PRIYA, 403],
    ['/api/_test/agent-only', SAM, 200],
    ['/api/_test/agent-only', ALEX, 200],
    ['/api/_test/admin-only', PRIYA, 403],
    ['/api/_test/admin-only', HANA, 403],
    ['/api/_test/admin-only', ALEX, 200],
  ])('%s as %s → %i', async (path, email, status) => {
    const res = await request(app)
      .get(path)
      .set('Cookie', await loginCookie(app, email));
    expect(res.status).toBe(status);
    if (status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(['/api/_test/employee-only', '/api/_test/agent-only', '/api/_test/admin-only'])(
    '%s without a session → 401',
    async (path) => {
      expectError(await request(app).get(path), 401, 'UNAUTHENTICATED');
    },
  );
});

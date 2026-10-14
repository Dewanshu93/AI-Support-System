// W4-07 (playbook section 9): HTTP hardening — helmet headers, CORS allowlist,
// the CSRF header on mutating requests, and the in-memory rate limits.
import type { NextFunction, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { requireCsrfHeader } from '../../src/http/security';
import type { AppError } from '../../src/lib/errors';
import { buildTestApp, loginCookie } from '../helpers/app';

const WEB = 'http://localhost:3000';

describe('security headers', () => {
  it('helmet headers on every response; no x-powered-by', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('CORS', () => {
  it('allows the web origin with credentials, and no other origin', async () => {
    const { app } = buildTestApp();
    const ok = await request(app)
      .options('/api/auth/login')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(ok.headers['access-control-allow-origin']).toBe(WEB);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const evil = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CSRF header', () => {
  const run = (method: string, header?: string) => {
    let error: AppError | undefined;
    requireCsrfHeader()(
      { method, get: () => header } as unknown as Request,
      {} as Response,
      ((err?: AppError) => (error = err)) as NextFunction,
    );
    return error;
  };

  it('mutating requests need X-Requested-With: sd-web; reads do not', () => {
    expect(run('POST')?.status).toBe(403);
    expect(run('PATCH', 'XMLHttpRequest')?.status).toBe(403);
    expect(run('DELETE', 'other')?.code).toBe('FORBIDDEN');
    expect(run('POST', 'sd-web')).toBeUndefined();
    expect(run('GET')).toBeUndefined();
  });

  it('a mutating request with the wrong header is refused before any handler', async () => {
    const ctx = buildTestApp();
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'priya.shah@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(ctx.audit.some((a) => a.action === 'auth.login')).toBe(false);
  });
});

describe('rate limits', () => {
  it('login: per IP, then 429 RATE_LIMITED with RateLimit headers', async () => {
    const { app } = buildTestApp({ rateLimits: { loginsPerMinute: 2 } });
    for (let i = 0; i < 2; i++) await loginCookie(app, 'priya.shah@example.com');
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya.shah@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit']).toBeDefined();
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('chat turns: per user — one employee hitting the limit does not block another', async () => {
    const { app } = buildTestApp({ rateLimits: { chatTurnsPerMinute: 2 } });
    const priya = await loginCookie(app, 'priya.shah@example.com');
    const tom = await loginCookie(app, 'tom.clarke@example.com');
    const url = `/api/conversations/${new ObjectId().toHexString()}/messages`;
    const send = (cookie: string) =>
      request(app).post(url).set('Cookie', cookie).send({ content: 'hello' });
    for (let i = 0; i < 2; i++) expect((await send(priya)).status).not.toBe(429);
    expect((await send(priya)).status).toBe(429);
    expect((await send(tom)).status).not.toBe(429);
  });

  it('uploads: per admin per hour', async () => {
    const { app } = buildTestApp({ rateLimits: { uploadsPerHour: 1 } });
    const admin = await loginCookie(app, 'alex.morgan@example.com');
    const upload = () =>
      request(app).post('/api/admin/documents').set('Cookie', admin).field('metadata', '{}');
    expect((await upload()).status).toBe(400);
    expect((await upload()).status).toBe(429);
  });
});

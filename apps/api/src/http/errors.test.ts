import { ErrorEnvelopeSchema, PaginationQuerySchema } from '@sd/shared';
import request from 'supertest';
import { z } from 'zod';
import { buildTestApp } from '../../test/helpers/app';
import { AppError } from '../lib/errors';
import type { RouteDef } from './routes';
import { validate } from './validate';

// Sample routes exercise validation and the central error handler end to end.
const SampleBody = z.object({
  content: z.string().min(1).max(2000),
  tone: z.enum(['standard', 'brief']).default('standard'),
});

const sampleRoutes: RouteDef[] = [
  {
    method: 'post',
    path: '/api/_test/echo',
    access: 'public',
    handlers: [validate({ body: SampleBody }), (req, res) => void res.json({ body: req.body })],
  },
  {
    method: 'get',
    path: '/api/_test/items/:id',
    access: 'public',
    handlers: [
      validate({
        params: z.object({ id: z.string().regex(/^\d+$/) }),
        query: PaginationQuerySchema,
      }),
      (req, res) => void res.json({ params: req.validated.params, query: req.validated.query }),
    ],
  },
  {
    method: 'get',
    path: '/api/_test/conflict',
    access: 'public',
    handlers: [
      () => {
        throw new AppError('CONFLICT', 'A turn is already running', { conversationId: 'c1' });
      },
    ],
  },
  {
    method: 'get',
    path: '/api/_test/crash',
    access: 'public',
    handlers: [
      () => {
        throw new Error('database password is hunter2');
      },
    ],
  },
  {
    method: 'get',
    path: '/api/_test/async-crash',
    access: 'public',
    handlers: [
      async () => {
        await Promise.resolve();
        throw new Error('async failure');
      },
    ],
  },
];

const { app } = buildTestApp({ extraRoutes: sampleRoutes });

/** Asserts the shared envelope shape and that requestId matches the response header. */
function expectEnvelope(res: request.Response, code: string, status: number) {
  expect(res.status).toBe(status);
  const envelope = ErrorEnvelopeSchema.parse(res.body);
  expect(envelope.error.code).toBe(code);
  expect(envelope.error.requestId).toBe(res.headers['x-request-id']);
  return envelope.error;
}

describe('validate middleware', () => {
  it('returns a VALIDATION_ERROR envelope with request ID for an invalid body', async () => {
    const res = await request(app).post('/api/_test/echo').send({ content: '', tone: 'shouty' });
    const error = expectEnvelope(res, 'VALIDATION_ERROR', 400);
    expect(error.message).toBe('Request validation failed');
    expect(error.details).toEqual({
      issues: expect.arrayContaining([
        expect.objectContaining({ location: 'body', path: 'content' }),
        expect.objectContaining({ location: 'body', path: 'tone' }),
      ]),
    });
  });

  it('reports a missing body field by path', async () => {
    const res = await request(app).post('/api/_test/echo').send({});
    const error = expectEnvelope(res, 'VALIDATION_ERROR', 400);
    expect(error.details).toEqual({
      issues: [expect.objectContaining({ location: 'body', path: 'content' })],
    });
  });

  it('passes the parsed body (defaults applied) to the handler', async () => {
    const res = await request(app).post('/api/_test/echo').send({ content: 'VPN is down' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { content: 'VPN is down', tone: 'standard' } });
  });

  it('coerces and defaults query parameters', async () => {
    const res = await request(app).get('/api/_test/items/42?limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: '42' }, query: { limit: 5 } });

    const defaults = await request(app).get('/api/_test/items/42');
    expect(defaults.body.query).toEqual({ limit: 20 });
  });

  it('collects issues from params and query together', async () => {
    const res = await request(app).get('/api/_test/items/abc?limit=500');
    const error = expectEnvelope(res, 'VALIDATION_ERROR', 400);
    const locations = (error.details as { issues: { location: string }[] }).issues.map(
      (i) => i.location,
    );
    expect(locations).toEqual(['params', 'query']);
  });
});

describe('error handler', () => {
  it('maps malformed JSON to VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/_test/echo')
      .set('Content-Type', 'application/json')
      .send('{"content": ');
    expect(expectEnvelope(res, 'VALIDATION_ERROR', 400).message).toBe(
      'Request body is not valid JSON',
    );
  });

  it('rejects bodies over 100 KB', async () => {
    const res = await request(app)
      .post('/api/_test/echo')
      .send({ content: 'x'.repeat(110 * 1024) });
    expect(expectEnvelope(res, 'VALIDATION_ERROR', 400).message).toBe('Request body is too large');
  });

  it('keeps the code, message and details of an AppError', async () => {
    const res = await request(app).get('/api/_test/conflict');
    const error = expectEnvelope(res, 'CONFLICT', 409);
    expect(error.message).toBe('A turn is already running');
    expect(error.details).toEqual({ conversationId: 'c1' });
  });

  it('hides unexpected errors behind INTERNAL with no stack or message leak', async () => {
    const res = await request(app).get('/api/_test/crash');
    const error = expectEnvelope(res, 'INTERNAL', 500);
    expect(error.message).toBe('Internal server error');
    expect(error.details).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|at .*\.ts/);
  });

  it('catches errors thrown from async handlers', async () => {
    const res = await request(app).get('/api/_test/async-crash');
    expectEnvelope(res, 'INTERNAL', 500);
  });

  it('returns a NOT_FOUND envelope for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(expectEnvelope(res, 'NOT_FOUND', 404).message).toBe(
      'No route for GET /api/does-not-exist',
    );
  });
});

describe('AppError', () => {
  it.each([
    ['VALIDATION_ERROR', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
    ['INTERNAL', 500],
    ['LLM_UNAVAILABLE', 503],
  ] as const)('%s → %i', (code, status) => {
    expect(new AppError(code, 'x').status).toBe(status);
  });
});

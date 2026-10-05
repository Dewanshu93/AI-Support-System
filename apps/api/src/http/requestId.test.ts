import request from 'supertest';
import { buildTestApp } from '../../test/helpers/app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('requestId middleware', () => {
  const { app } = buildTestApp();

  it('generates a UUID request ID and returns it in X-Request-Id', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('generates a different ID per request', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health'),
    ]);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('keeps a safe client-supplied ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'web-1234abcd');
    expect(res.headers['x-request-id']).toBe('web-1234abcd');
  });

  it.each(['short', 'has spaces in it', 'x'.repeat(65), 'semi;colon"quote'])(
    'replaces an unsafe client-supplied ID (%j)',
    async (unsafe) => {
      const res = await request(app).get('/api/health').set('X-Request-Id', unsafe);
      expect(res.headers['x-request-id']).toMatch(UUID);
    },
  );
});

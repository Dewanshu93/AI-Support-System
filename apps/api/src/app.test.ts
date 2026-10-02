import request from 'supertest';
import { createApp } from './app';

describe('api smoke', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not advertise the framework', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

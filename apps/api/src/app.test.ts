import { HealthResponseSchema } from '@sd/shared';
import request from 'supertest';
import { createApp } from './app';

describe('api smoke', () => {
  it('GET /api/health returns 200 matching the shared contract', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('does not advertise the framework', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

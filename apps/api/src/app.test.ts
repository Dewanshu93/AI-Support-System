import { HealthResponseSchema } from '@sd/shared';
import request from 'supertest';
import { buildTestApp } from '../test/helpers/app';

describe('api smoke', () => {
  it('GET /api/health returns 200 matching the shared contract', async () => {
    const res = await request(buildTestApp().app).get('/api/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('reports db up when the database answers a ping', async () => {
    const { app } = buildTestApp({ pingDb: async () => true });
    const res = await request(app).get('/api/health');
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok', db: 'up' });
  });

  it('reports degraded with db down when the ping fails', async () => {
    const { app } = buildTestApp({ pingDb: async () => false });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'degraded', db: 'down' });
  });

  it('reports the vector store and degrades when it is down', async () => {
    const up = await request(
      buildTestApp({ pingDb: async () => true, pingVectorStore: async () => true }).app,
    ).get('/api/health');
    expect(up.body).toEqual({ status: 'ok', db: 'up', vectorStore: 'up' });

    const down = await request(
      buildTestApp({ pingDb: async () => true, pingVectorStore: async () => false }).app,
    ).get('/api/health');
    expect(HealthResponseSchema.parse(down.body)).toEqual({
      status: 'degraded',
      db: 'up',
      vectorStore: 'down',
    });
  });

  it('reports llmConfigured without degrading status', async () => {
    const off = await request(buildTestApp({ llmConfigured: false }).app).get('/api/health');
    expect(HealthResponseSchema.parse(off.body)).toEqual({ status: 'ok', llmConfigured: false });
    const on = await request(buildTestApp({ llmConfigured: true }).app).get('/api/health');
    expect(on.body).toEqual({ status: 'ok', llmConfigured: true });
  });

  it('does not advertise the framework', async () => {
    const res = await request(buildTestApp().app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

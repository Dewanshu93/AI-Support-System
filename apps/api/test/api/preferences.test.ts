// ADR-020: PATCH /api/profiles/me/preferences (the "Pro" models switch) and the
// per-request model mode it drives.
import request from 'supertest';
import { currentModelMode } from '../../src/ai/llm/modelMode';
import type { RouteDef } from '../../src/http/routes';
import { buildTestApp, loginCookie } from '../helpers/app';

const URL = '/api/profiles/me/preferences';
const PRIYA = 'priya.shah@example.com';
const HANA = 'hana.kim@example.com';

// Reports the mode an LLM call would use, after an await (async context kept).
const modeProbe: RouteDef = {
  method: 'get',
  path: '/api/_test/model-mode',
  access: 'any',
  handlers: [
    async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      res.json({ mode: currentModelMode() });
    },
  ],
};

async function setup() {
  const ctx = buildTestApp({ extraRoutes: [modeProbe] });
  const [priya, hana] = await Promise.all([
    loginCookie(ctx.app, PRIYA),
    loginCookie(ctx.app, HANA),
  ]);
  return { ctx, priya, hana };
}

describe('PATCH /api/profiles/me/preferences', () => {
  it('Pro is off by default; turning it on is saved, audited and returned', async () => {
    const { ctx, priya } = await setup();
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', priya);
    expect(me.body.user.proModels).toBe(false);

    const res = await request(ctx.app).patch(URL).set('Cookie', priya).send({ proModels: true });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: PRIYA, proModels: true });
    expect(
      (await request(ctx.app).get('/api/auth/me').set('Cookie', priya)).body.user.proModels,
    ).toBe(true);
    expect(ctx.audit.find((a) => a.action === 'user.preferences')).toMatchObject({
      metadata: { proModels: true, previous: false },
    });
  });

  it('is per user: one user turning Pro on does not change another', async () => {
    const { ctx, priya, hana } = await setup();
    await request(ctx.app).patch(URL).set('Cookie', priya).send({ proModels: true });
    expect(
      (await request(ctx.app).get('/api/auth/me').set('Cookie', hana)).body.user.proModels,
    ).toBe(false);
  });

  it('every role may set its own preference; signed out is 401; bad bodies are 400', async () => {
    const { ctx, hana } = await setup();
    expect(
      (await request(ctx.app).patch(URL).set('Cookie', hana).send({ proModels: true })).status,
    ).toBe(200);
    expect((await request(ctx.app).patch(URL).send({ proModels: true })).status).toBe(401);
    for (const body of [{}, { proModels: 'yes' }, { proModels: true, role: 'admin' }]) {
      expect((await request(ctx.app).patch(URL).set('Cookie', hana).send(body)).status).toBe(400);
    }
  });
});

describe('model mode per request', () => {
  it('follows the signed-in user’s Pro setting, through async handlers', async () => {
    const { ctx, priya, hana } = await setup();
    const mode = async (cookie: string) =>
      (await request(ctx.app).get('/api/_test/model-mode').set('Cookie', cookie)).body.mode;
    expect(await mode(priya)).toBe('local');
    await request(ctx.app).patch(URL).set('Cookie', priya).send({ proModels: true });
    // Concurrent requests keep their own users' modes.
    expect(await Promise.all([mode(priya), mode(hana), mode(priya)])).toEqual([
      'pro',
      'local',
      'pro',
    ]);
  });

  it('is local outside any request (scripts, startup)', () => {
    expect(currentModelMode()).toBe('local');
  });
});

// W4-07 role matrix (playbook section 9): every route × every role, from the
// route table itself, so a new endpoint is covered without editing this test.
// An allowed role gets past the guards (any status but 401/403); any other role
// gets 403; no session gets 401 (public routes excepted).
import { ROLES, type Role } from '@sd/shared';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { buildRoutes, type RouteDef } from '../../src/http/routes';
import { buildTestApp, loginCookie } from '../helpers/app';

const AS: Record<Role, string> = {
  employee: 'priya.shah@example.com',
  agent: 'sam.patel@example.com',
  admin: 'alex.morgan@example.com',
};

const urlOf = (route: RouteDef) => route.path.replace(/:[A-Za-z]+/g, new ObjectId().toHexString());

const allowed = (route: RouteDef, role: Role) =>
  route.access === 'public' ||
  route.access === 'any' ||
  (route.access as readonly Role[]).includes(role);

describe('role matrix: every route × every role', () => {
  const ctx = buildTestApp();
  const routes = buildRoutes(ctx.deps);
  const cookies: Partial<Record<Role, string>> = {};

  beforeAll(async () => {
    for (const role of ROLES) cookies[role] = await loginCookie(ctx.app, AS[role]);
  });

  const call = (route: RouteDef, cookie?: string) => {
    const req = request(ctx.app)[route.method](urlOf(route));
    if (cookie) req.set('Cookie', cookie);
    return route.method === 'get' ? req : req.send({});
  };

  it('covers every route in the table', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(ROLES)('%s: allowed routes pass the guards, all others are 403', async (role) => {
    const wrong: string[] = [];
    for (const route of routes) {
      // Logging out would end this role's session for the remaining routes.
      if (route.path === '/api/auth/logout') continue;
      const res = await call(route, cookies[role]);
      const ok = allowed(route, role) ? ![401, 403].includes(res.status) : res.status === 403;
      if (!ok) wrong.push(`${route.method.toUpperCase()} ${route.path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('no session: every non-public route is 401', async () => {
    const wrong: string[] = [];
    for (const route of routes) {
      const res = await call(route);
      if (route.access === 'public' ? res.status === 401 : res.status !== 401) {
        wrong.push(`${route.method.toUpperCase()} ${route.path} → ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

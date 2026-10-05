import { ROLES } from '@sd/shared';
import { buildTestApp } from '../../test/helpers/app';
import { buildRoutes } from './routes';

// Route policy test (playbook section 9): every route declares an access rule.
// When a task adds an endpoint, add it to the reviewed list below with its policy.
describe('route policy table', () => {
  const routes = buildRoutes(buildTestApp().deps);

  it('declares a valid access policy and at least one handler for every route', () => {
    const invalid = routes
      .filter(
        (route) =>
          !(
            route.access === 'public' ||
            route.access === 'any' ||
            (Array.isArray(route.access) &&
              route.access.length > 0 &&
              route.access.every((role) => (ROLES as readonly string[]).includes(role)))
          ) || route.handlers.length === 0,
      )
      .map((route) => `${route.method} ${route.path}`);
    expect(invalid).toEqual([]);
  });

  it('has no duplicate method + path', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches the reviewed policy for every endpoint', () => {
    expect(routes.map((r) => [r.method.toUpperCase(), r.path, r.access])).toEqual([
      ['GET', '/api/health', 'public'],
      ['GET', '/api/auth/demo-users', 'public'],
      ['POST', '/api/auth/login', 'public'],
      ['POST', '/api/auth/logout', 'any'],
      ['GET', '/api/auth/me', 'any'],
      ['GET', '/api/profiles/me', 'any'],
    ]);
  });
});

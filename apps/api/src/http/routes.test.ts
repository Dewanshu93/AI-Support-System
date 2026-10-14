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
      ['PATCH', '/api/profiles/me/preferences', 'any'],
      ['POST', '/api/conversations', ['employee']],
      ['GET', '/api/conversations', ['employee']],
      ['GET', '/api/conversations/:id', ['employee']],
      ['POST', '/api/conversations/:id/resolution', ['employee']],
      ['POST', '/api/messages/:id/feedback', ['employee']],
      ['POST', '/api/conversations/:id/messages', ['employee']],
      ['POST', '/api/conversations/:id/escalate', ['employee']],
      ['GET', '/api/sources/chunks/:chunkId', ['employee']],
      ['POST', '/api/conversations/:id/ticket-draft/confirm', ['employee']],
      ['POST', '/api/conversations/:id/ticket-draft/cancel', ['employee']],
      ['GET', '/api/tickets/mine', ['employee']],
      ['GET', '/api/tickets/:id', ['employee']],
      ['GET', '/api/agent/tickets', ['agent', 'admin']],
      ['GET', '/api/agent/tickets/:id', ['agent', 'admin']],
      ['POST', '/api/agent/tickets/:id/replies', ['agent', 'admin']],
      ['POST', '/api/agent/tickets/:id/draft-reply', ['agent', 'admin']],
      ['POST', '/api/agent/tickets/:id/notes', ['agent', 'admin']],
      ['PATCH', '/api/agent/tickets/:id/status', ['agent', 'admin']],
      ['PATCH', '/api/agent/tickets/:id/classification', ['agent', 'admin']],
      // Admin (W4-01).
      ['GET', '/api/admin/metrics/overview', ['admin']],
      // Knowledge gaps (W4-02).
      ['GET', '/api/admin/knowledge-gaps', ['admin']],
      ['POST', '/api/admin/knowledge-gaps/refresh', ['admin']],
      // Trace viewer (W4-03).
      ['GET', '/api/admin/conversations', ['admin']],
      ['GET', '/api/admin/conversations/:id/traces', ['admin']],
      ['GET', '/api/admin/traces/:traceId', ['admin']],
      // Documents (W4-04).
      ['GET', '/api/admin/documents', ['admin']],
      ['GET', '/api/admin/documents/:id', ['admin']],
      ['POST', '/api/admin/documents', ['admin']],
      ['POST', '/api/admin/documents/:id/reindex', ['admin']],
      ['PATCH', '/api/admin/documents/:id/status', ['admin']],
      // Employee workspace (UC-02).
      ['GET', '/api/dashboard', ['employee']],
      ['GET', '/api/projects/mine', ['employee']],
      ['GET', '/api/tasks/mine', ['employee']],
      ['GET', '/api/timesheets/week', ['employee']],
      ['POST', '/api/timesheets/entries', ['employee']],
      ['GET', '/api/attendance', ['employee']],
      ['GET', '/api/payslips/mine', ['employee']],
      ['GET', '/api/payslips/:id', ['employee']],
      ['GET', '/api/notifications', ['employee']],
      ['POST', '/api/notifications/read', ['employee']],
      // Copilot actions (UC-05).
      ['POST', '/api/conversations/:id/action/confirm', ['employee']],
      ['POST', '/api/conversations/:id/action/cancel', ['employee']],
    ]);
  });
});

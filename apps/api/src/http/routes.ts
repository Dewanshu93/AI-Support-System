// Route policy table (playbook section 9, RBAC). Every endpoint is declared
// here with an explicit access rule; mountRoutes applies requireAuth and
// requireRole from that rule, so a route cannot exist without a policy.
import type { Role } from '@sd/shared';
import type { Express, RequestHandler } from 'express';
import type { AppDeps } from '../deps';
import { authRoutes } from '../modules/auth/routes';
import { healthRoutes } from '../modules/health/routes';
import { profileRoutes } from '../modules/users/routes';
import { requireAuth } from './requireAuth';
import { requireRole } from './requireRole';

/** `public`: no session; `any`: any authenticated role; otherwise the allowed roles. */
export type Access = 'public' | 'any' | readonly [Role, ...Role[]];

export interface RouteDef {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  access: Access;
  /** Validation, controller, … — run after the access guards. */
  handlers: RequestHandler[];
}

/** The full route table: every module contributes its routes here. */
export function buildRoutes(deps: AppDeps): RouteDef[] {
  return [...healthRoutes(deps), ...authRoutes(deps), ...profileRoutes()];
}

export function mountRoutes(app: Express, routes: RouteDef[], deps: AppDeps): void {
  const authenticate = requireAuth({ users: deps.users, jwtSecret: deps.auth.jwtSecret });
  for (const route of routes) {
    const guards =
      route.access === 'public'
        ? []
        : route.access === 'any'
          ? [authenticate]
          : [authenticate, requireRole(...route.access)];
    app[route.method](route.path, ...guards, ...route.handlers);
  }
}

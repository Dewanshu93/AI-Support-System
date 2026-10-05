import {
  API_BASE_PATH,
  type AuthUserResponse,
  type DemoUsersResponse,
  LoginRequestSchema,
  type LoginRequest,
  SESSION_COOKIE,
} from '@sd/shared';
import type { CookieOptions } from 'express';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { createAuditService } from '../audit/service';
import { createAuthService } from './service';
import { SESSION_TTL_SECONDS } from './tokens';

export function authRoutes(deps: AppDeps): RouteDef[] {
  const auth = createAuthService({
    users: deps.users,
    jwtSecret: deps.auth.jwtSecret,
    demoPassword: deps.auth.demoPassword,
  });
  const audit = createAuditService(deps.audit);
  const cookie: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: deps.auth.secureCookies,
    path: '/',
  };
  const base = `${API_BASE_PATH}/auth`;

  return [
    {
      method: 'get',
      path: `${base}/demo-users`,
      access: 'public',
      handlers: [
        async (_req, res) => {
          const body: DemoUsersResponse = { users: await auth.listDemoUsers() };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/login`,
      access: 'public',
      handlers: [
        validate({ body: LoginRequestSchema }),
        async (req, res) => {
          const { user, token } = await auth.login(req.body as LoginRequest);
          await audit.record(req, {
            action: 'auth.login',
            actor: user,
            targetType: 'user',
            targetId: user.id,
          });
          res.cookie(SESSION_COOKIE, token, { ...cookie, maxAge: SESSION_TTL_SECONDS * 1000 });
          const body: AuthUserResponse = { user };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/logout`,
      access: 'any',
      handlers: [
        async (req, res) => {
          await audit.record(req, {
            action: 'auth.logout',
            targetType: 'user',
            targetId: req.user!.id,
          });
          res.clearCookie(SESSION_COOKIE, cookie);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/me`,
      access: 'any',
      handlers: [
        (req, res) => {
          const body: AuthUserResponse = { user: req.user! };
          res.json(body);
        },
      ],
    },
  ];
}

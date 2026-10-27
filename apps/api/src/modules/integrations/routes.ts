// Connected-app endpoints (UC-18, UC-19; ADR-032, ADR-033). "Connect" is a browser
// navigation: connect redirects to the tool's sign-in page, the tool redirects back
// to the callback, and the callback redirects to the app page with the result. The
// state is random, kept in a short-lived httpOnly cookie per tool and checked on the
// way back.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  API_BASE_PATH,
  type ConnectResult,
  type GithubWorkResponse,
  type IntegrationListResponse,
  type IntegrationParams,
  IntegrationParamsSchema,
  type IntegrationProvider,
  type OAuthCallbackQuery,
  OAuthCallbackQuerySchema,
} from '@sd/shared';
import type { CookieOptions, Response } from 'express';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { logger } from '../../lib/logger';
import { createAuditService } from '../audit/service';
import { IntegrationAuthError } from './oauth';
import type { IntegrationsService } from './service';

export const stateCookieName = (provider: IntegrationProvider) => `sd_oauth_${provider}`;
const STATE_TTL_MS = 10 * 60_000;
const EMPLOYEE = ['employee'] as const;

/** Where the employee lands after connecting: Jira shows on the Tasks page. */
const RETURN_PATH: Record<IntegrationProvider, string> = { jira: '/tasks', github: '/apps' };

function sameState(a: string, b: string | undefined): boolean {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function integrationRoutes(deps: AppDeps, service: IntegrationsService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = `${API_BASE_PATH}/integrations`;
  const stateCookie: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: deps.auth.secureCookies,
    path: base,
  };
  const providerOf = (req: { validated: { params?: unknown } }) =>
    (req.validated.params as IntegrationParams).provider;
  const backToApp = (res: Response, provider: IntegrationProvider, result: ConnectResult) => {
    res.clearCookie(stateCookieName(provider), stateCookie);
    res.redirect(303, `${deps.security.webOrigin}${RETURN_PATH[provider]}?${provider}=${result}`);
  };

  return [
    {
      method: 'get',
      path: base,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: IntegrationListResponse = { items: await service.list(req.user!) };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/github/work`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: GithubWorkResponse = await service.githubWork(req.user!);
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:provider/connect`,
      access: EMPLOYEE,
      handlers: [
        validate({ params: IntegrationParamsSchema }),
        (req, res) => {
          const provider = providerOf(req);
          const state = randomBytes(24).toString('base64url');
          const url = service.authorizeUrl(provider, state); // 503 when not set up
          res.cookie(stateCookieName(provider), state, { ...stateCookie, maxAge: STATE_TTL_MS });
          res.redirect(302, url);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/:provider/callback`,
      access: EMPLOYEE,
      handlers: [
        validate({ params: IntegrationParamsSchema, query: OAuthCallbackQuerySchema }),
        async (req, res) => {
          const provider = providerOf(req);
          const query = req.validated.query as OAuthCallbackQuery;
          const cookies = req.cookies as Record<string, string | undefined>;
          if (!sameState(query.state, cookies[stateCookieName(provider)])) {
            return backToApp(res, provider, 'failed');
          }
          if (query.error || !query.code) return backToApp(res, provider, 'declined');
          if (!service.available(provider)) return backToApp(res, provider, 'failed');
          let outcome;
          try {
            outcome = await service.complete(req.user!, provider, query.code);
          } catch (err) {
            logger.warn(
              { userId: req.user!.id, provider, auth: err instanceof IntegrationAuthError },
              'connect failed',
            );
            return backToApp(res, provider, 'failed');
          }
          if (outcome === 'connected') {
            const status = (await service.list(req.user!)).find((s) => s.provider === provider);
            await audit.record(req, {
              action: 'integration.connect',
              targetType: 'integration',
              targetId: provider,
              metadata: { provider, account: status?.accountUrl ?? null },
            });
          }
          backToApp(res, provider, outcome);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/:provider/disconnect`,
      access: EMPLOYEE,
      handlers: [
        validate({ params: IntegrationParamsSchema }),
        async (req, res) => {
          const provider = providerOf(req);
          if (await service.disconnect(req.user!, provider)) {
            await audit.record(req, {
              action: 'integration.disconnect',
              targetType: 'integration',
              targetId: provider,
              metadata: { provider },
            });
          }
          const body: IntegrationListResponse = { items: await service.list(req.user!) };
          res.json(body);
        },
      ],
    },
  ];
}

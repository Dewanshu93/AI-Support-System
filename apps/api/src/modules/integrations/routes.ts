// Connected-tool endpoints (UC-18, ADR-032). "Connect Jira" is a browser navigation:
// connect redirects to Atlassian's sign-in page, Atlassian redirects back to the
// callback, and the callback redirects to the Tasks page with the result. The state
// is random, kept in a short-lived httpOnly cookie and checked on the way back.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  API_BASE_PATH,
  type IntegrationListResponse,
  type JiraCallbackQuery,
  JiraCallbackQuerySchema,
  type JiraConnectResult,
} from '@sd/shared';
import type { CookieOptions, Response } from 'express';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { logger } from '../../lib/logger';
import { createAuditService } from '../audit/service';
import { JiraAuthError } from './jiraClient';
import type { IntegrationsService } from './service';

export const JIRA_STATE_COOKIE = 'sd_jira_state';
const STATE_TTL_MS = 10 * 60_000;
const EMPLOYEE = ['employee'] as const;

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
    path: `${base}/jira`,
  };
  const backToTasks = (res: Response, result: JiraConnectResult) => {
    res.clearCookie(JIRA_STATE_COOKIE, stateCookie);
    res.redirect(303, `${deps.security.webOrigin}/tasks?jira=${result}`);
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
      path: `${base}/jira/connect`,
      access: EMPLOYEE,
      handlers: [
        (_req, res) => {
          const state = randomBytes(24).toString('base64url');
          const url = service.authorizeUrl(state); // 503 when Jira is not set up
          res.cookie(JIRA_STATE_COOKIE, state, { ...stateCookie, maxAge: STATE_TTL_MS });
          res.redirect(302, url);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/jira/callback`,
      access: EMPLOYEE,
      handlers: [
        validate({ query: JiraCallbackQuerySchema }),
        async (req, res) => {
          const query = req.validated.query as JiraCallbackQuery;
          const cookies = req.cookies as Record<string, string | undefined>;
          if (!sameState(query.state, cookies[JIRA_STATE_COOKIE]))
            return backToTasks(res, 'failed');
          if (query.error || !query.code) return backToTasks(res, 'declined');
          if (!service.available()) return backToTasks(res, 'failed');
          let outcome;
          try {
            outcome = await service.complete(req.user!, query.code);
          } catch (err) {
            logger.warn(
              { userId: req.user!.id, auth: err instanceof JiraAuthError },
              'Jira connect failed',
            );
            return backToTasks(res, 'failed');
          }
          if (outcome === 'connected') {
            const [status] = await service.list(req.user!);
            await audit.record(req, {
              action: 'integration.connect',
              targetType: 'integration',
              targetId: 'jira',
              metadata: { provider: 'jira', site: status?.siteUrl ?? null },
            });
          }
          backToTasks(res, outcome);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/jira/disconnect`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          if (await service.disconnect(req.user!)) {
            await audit.record(req, {
              action: 'integration.disconnect',
              targetType: 'integration',
              targetId: 'jira',
              metadata: { provider: 'jira' },
            });
          }
          const body: IntegrationListResponse = { items: await service.list(req.user!) };
          res.json(body);
        },
      ],
    },
  ];
}

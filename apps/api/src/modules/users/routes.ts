import {
  API_BASE_PATH,
  type AuthUserResponse,
  type PreferencesRequest,
  PreferencesRequestSchema,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';
import { toAuthUser, toProfile } from './mappers';

/**
 * Profiles are read-only in the MVP; they come from seed data (production: HRIS).
 * Each user may change their own preferences (ADR-020: the "Pro" models switch).
 */
export function profileRoutes(deps: Pick<AppDeps, 'users' | 'audit'>): RouteDef[] {
  const audit = createAuditService(deps.audit);
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/profiles/me`,
      access: 'any',
      handlers: [(req, res) => void res.json(toProfile(req.user!))],
    },
    {
      method: 'patch',
      path: `${API_BASE_PATH}/profiles/me/preferences`,
      access: 'any',
      handlers: [
        validate({ body: PreferencesRequestSchema }),
        async (req, res) => {
          const { proModels } = req.body as PreferencesRequest;
          const doc = await deps.users.setPreferences(req.user!.id, { proModels });
          if (!doc) throw new AppError('UNAUTHENTICATED', 'Sign in required');
          await audit.record(req, {
            action: 'user.preferences',
            targetType: 'user',
            targetId: req.user!.id,
            metadata: { proModels, previous: req.user!.proModels },
          });
          const body: AuthUserResponse = { user: toAuthUser(doc) };
          res.json(body);
        },
      ],
    },
  ];
}

import { API_BASE_PATH } from '@sd/shared';
import type { RouteDef } from '../../http/routes';
import { toProfile } from './mappers';

/** Profiles are read-only in the MVP; they come from seed data (production: HRIS). */
export function profileRoutes(): RouteDef[] {
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/profiles/me`,
      access: 'any',
      handlers: [(req, res) => void res.json(toProfile(req.user!))],
    },
  ];
}

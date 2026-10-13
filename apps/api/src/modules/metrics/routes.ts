// GET /api/admin/metrics/overview (W4-01, playbook section 4): admin only.
import {
  API_BASE_PATH,
  type MetricsOverviewQuery,
  MetricsOverviewQuerySchema,
  type MetricsOverviewResponse,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import { computeOverview, METRIC_DEFINITIONS, overviewRange } from '../../domain/metrics';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';

export function metricsRoutes(deps: Pick<AppDeps, 'metrics' | 'clock'>): RouteDef[] {
  const now = deps.clock ?? (() => new Date());
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/admin/metrics/overview`,
      access: ['admin'],
      handlers: [
        validate({ query: MetricsOverviewQuerySchema }),
        async (req, res) => {
          const query = req.validated.query as MetricsOverviewQuery;
          const range = overviewRange(query, now().toISOString().slice(0, 10));
          const rows = await deps.metrics.loadRows({ start: range.start, end: range.end });
          const body: MetricsOverviewResponse = {
            range: { from: range.from, to: range.to },
            ...computeOverview(rows),
            definitions: METRIC_DEFINITIONS,
          };
          res.json(body);
        },
      ],
    },
  ];
}

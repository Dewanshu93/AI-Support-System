import { API_BASE_PATH, type HealthResponse } from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';

export function healthRoutes(deps: Pick<AppDeps, 'pingDb' | 'pingVectorStore'>): RouteDef[] {
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/health`,
      access: 'public',
      handlers: [
        async (_req, res) => {
          // llmConfigured is added in W1-09.
          const body: HealthResponse = { status: 'ok' };
          const [db, vectorStore] = await Promise.all([deps.pingDb?.(), deps.pingVectorStore?.()]);
          if (db !== undefined) body.db = db ? 'up' : 'down';
          if (vectorStore !== undefined) body.vectorStore = vectorStore ? 'up' : 'down';
          if (db === false || vectorStore === false) body.status = 'degraded';
          res.status(200).json(body);
        },
      ],
    },
  ];
}

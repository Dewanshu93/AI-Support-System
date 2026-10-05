import { API_BASE_PATH, type HealthResponse } from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';

export function healthRoutes(
  deps: Pick<AppDeps, 'pingDb' | 'pingVectorStore' | 'llmConfigured'>,
): RouteDef[] {
  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/health`,
      access: 'public',
      handlers: [
        async (_req, res) => {
          const body: HealthResponse = { status: 'ok' };
          const [db, vectorStore] = await Promise.all([deps.pingDb?.(), deps.pingVectorStore?.()]);
          if (db !== undefined) body.db = db ? 'up' : 'down';
          if (vectorStore !== undefined) body.vectorStore = vectorStore ? 'up' : 'down';
          if (deps.llmConfigured !== undefined) body.llmConfigured = deps.llmConfigured;
          if (db === false || vectorStore === false) body.status = 'degraded';
          res.status(200).json(body);
        },
      ],
    },
  ];
}

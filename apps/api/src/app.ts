import { API_BASE_PATH, type HealthResponse } from '@sd/shared';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './http/errors';
import { requestId } from './http/requestId';

export interface CreateAppOptions {
  /** Database health probe; when omitted, health reports no `db` field. */
  pingDb?: () => Promise<boolean>;
  /** Qdrant health probe; when omitted, health reports no `vectorStore` field. */
  pingVectorStore?: () => Promise<boolean>;
  /** Test-only hook to mount extra routes before the 404 and error handlers. */
  extraRoutes?: (app: Express) => void;
}

/**
 * Builds the Express application without binding a port, so Supertest can
 * exercise it directly. Auth, RBAC and module routers are mounted in later tasks.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(express.json({ limit: '100kb' }));

  // Public health probe; llmConfigured is added in W1-09.
  app.get(`${API_BASE_PATH}/health`, async (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    const [db, vectorStore] = await Promise.all([options.pingDb?.(), options.pingVectorStore?.()]);
    if (db !== undefined) body.db = db ? 'up' : 'down';
    if (vectorStore !== undefined) body.vectorStore = vectorStore ? 'up' : 'down';
    if (db === false || vectorStore === false) body.status = 'degraded';
    res.status(200).json(body);
  });

  options.extraRoutes?.(app);

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}

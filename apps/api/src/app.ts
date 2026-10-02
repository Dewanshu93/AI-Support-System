import { API_BASE_PATH, type HealthResponse } from '@sd/shared';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './http/errors';
import { requestId } from './http/requestId';

export interface CreateAppOptions {
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

  // Public health probe; db and llmConfigured are added in W1-04 / W1-09.
  app.get(`${API_BASE_PATH}/health`, (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.status(200).json(body);
  });

  options.extraRoutes?.(app);

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}

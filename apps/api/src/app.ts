import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { AppDeps } from './deps';
import { errorHandler, notFoundHandler } from './http/errors';
import { requestId } from './http/requestId';
import { buildRoutes, mountRoutes, type RouteDef } from './http/routes';

export interface CreateAppOptions {
  /** Test-only: extra routes mounted through the same policy guards, before the 404 handler. */
  extraRoutes?: RouteDef[];
}

/**
 * Builds the Express application without binding a port, so Supertest can
 * exercise it directly. All routes come from the route policy table.
 */
export function createApp(deps: AppDeps, options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  mountRoutes(app, [...buildRoutes(deps), ...(options.extraRoutes ?? [])], deps);

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}

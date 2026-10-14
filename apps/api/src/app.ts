import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppDeps } from './deps';
import { errorHandler, notFoundHandler } from './http/errors';
import { requestId } from './http/requestId';
import { buildRoutes, mountRoutes, type RouteDef } from './http/routes';
import { createRateLimiters, requireCsrfHeader } from './http/security';

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
  // Security headers (section 9). The API serves JSON only: no inline content to allow.
  app.use(helmet());
  // Browsers call the API through the web app's same-origin proxy; any direct
  // cross-origin call is allowed only from the web origin, with cookies.
  app.use(
    cors({
      // Only the web origin gets CORS headers; any other origin gets none.
      origin: (origin, done) => done(null, origin === deps.security.webOrigin),
      credentials: true,
    }),
  );
  app.use(requireCsrfHeader());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  mountRoutes(
    app,
    [...buildRoutes(deps), ...(options.extraRoutes ?? [])],
    deps,
    createRateLimiters(deps.security.rateLimits),
  );

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}

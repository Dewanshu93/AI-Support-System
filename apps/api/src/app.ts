import { API_BASE_PATH } from '@sd/shared';
import express, { type Express } from 'express';

/**
 * Builds the Express application without binding a port, so Supertest can
 * exercise it directly. Middleware (request IDs, error envelope, auth, RBAC)
 * and module routers are mounted here in later tasks.
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Public health probe. The full contract shape { status, db, llmConfigured }
  // is completed once the DB (W1-04) and LLM (W1-09) layers exist.
  app.get(`${API_BASE_PATH}/health`, (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}

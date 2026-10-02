import type { ErrorEnvelope } from '@sd/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

/** Errors raised by express.json() carry a `type` from body-parser. */
function fromBodyParser(err: unknown): AppError | undefined {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', 'Request body is not valid JSON');
  }
  if (type === 'entity.too.large') {
    return new AppError('VALIDATION_ERROR', 'Request body is too large');
  }
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
    return new AppError('VALIDATION_ERROR', 'Unsupported request body encoding');
  }
  return undefined;
}

/** Mounted after all routes: unmatched paths get a NOT_FOUND envelope. */
export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
  };
}

/**
 * Central error handler: every error leaves as the shared envelope. Known
 * errors keep their code and message; anything else is logged with its stack
 * and returned as INTERNAL with a generic message.
 */
export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, next) => {
    // A streaming response (SSE) has already started; let Express close it.
    if (res.headersSent) {
      next(err);
      return;
    }

    const log = req.log ?? logger;
    const known = err instanceof AppError ? err : fromBodyParser(err);
    const appError = known ?? new AppError('INTERNAL', 'Internal server error');

    if (known) {
      log.info({ code: appError.code, status: appError.status }, appError.message);
    } else {
      log.error({ err }, 'unhandled error');
    }

    const body: ErrorEnvelope = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined && { details: appError.details }),
        requestId: req.id,
      },
    };
    res.status(appError.status).json(body);
  };
}

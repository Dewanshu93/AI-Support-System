import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '@sd/shared';
import type { RequestHandler } from 'express';
import { type Logger, logger } from '../lib/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates logs, error envelopes and (later) audit entries. */
      id: string;
      /** Logger bound to this request's ID. */
      log: Logger;
    }
  }
}

/** Client-supplied IDs are accepted only if short and log-safe. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Assigns a request ID, echoes it in X-Request-Id, and logs one line per request. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(REQUEST_ID_HEADER);
    req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.setHeader(REQUEST_ID_HEADER, req.id);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      req.log.info(
        { method: req.method, path: req.path, status: res.statusCode, durationMs },
        'request completed',
      );
    });
    next();
  };
}

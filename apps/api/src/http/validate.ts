import type { ValidationIssue } from '@sd/shared';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

type Location = ValidationIssue['location'];
type RequestSchemas = Partial<Record<Location, z.ZodType>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Parsed values for each validated part (Express 5 makes req.query read-only). */
      validated: Partial<Record<Location, unknown>>;
    }
  }
}

/**
 * Validates body, query and/or params against Zod schemas. On success the
 * parsed values (with defaults and coercion applied) are on `req.validated`
 * and `req.body` is replaced; on failure the request ends with a
 * VALIDATION_ERROR envelope listing every issue.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const validated: Express.Request['validated'] = {};

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        validated[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.map(String).join('.'), message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      next(new AppError('VALIDATION_ERROR', 'Request validation failed', { issues }));
      return;
    }
    req.validated = validated;
    if ('body' in validated) req.body = validated.body;
    next();
  };
}

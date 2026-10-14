// HTTP hardening (W4-07, playbook section 9): the CSRF header check on mutating
// requests and in-memory rate limits (per user, or per IP before login). Helmet,
// CORS and the body limit are applied in app.ts.
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors';

/** The header the web app sends on every mutating request (lib/api.ts, lib/sse.ts). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'sd-web';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Mutating requests must carry `X-Requested-With: sd-web`. A cross-site form or
 * image cannot set it, and a cross-origin fetch that sets it needs a CORS
 * preflight, which only the web origin passes (SameSite=Lax cookies do the rest).
 */
export function requireCsrfHeader(): RequestHandler {
  return (req, _res, next) => {
    if (!MUTATING.has(req.method) || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) return next();
    next(new AppError('FORBIDDEN', `Missing ${CSRF_HEADER}: ${CSRF_HEADER_VALUE} header`));
  };
}

export const RATE_LIMITS = ['login', 'chat', 'upload'] as const;
export type RateLimitName = (typeof RATE_LIMITS)[number];

export interface RateLimitConfig {
  loginsPerMinute: number;
  chatTurnsPerMinute: number;
  uploadsPerHour: number;
}

const WINDOWS: Record<
  RateLimitName,
  { windowMs: number; limit: keyof RateLimitConfig; what: string }
> = {
  login: { windowMs: 60_000, limit: 'loginsPerMinute', what: 'sign-in attempts' },
  chat: { windowMs: 60_000, limit: 'chatTurnsPerMinute', what: 'messages' },
  upload: { windowMs: 3_600_000, limit: 'uploadsPerHour', what: 'uploads' },
};

/**
 * One in-memory limiter per name (single API process; a distributed limiter is a
 * production gap). Keyed by the signed-in user, or by IP before login. A blocked
 * request gets the RATE_LIMITED envelope (429) with Retry-After.
 */
export function createRateLimiters(config: RateLimitConfig): Record<RateLimitName, RequestHandler> {
  const make = (name: RateLimitName): RequestHandler => {
    const { windowMs, limit, what } = WINDOWS[name];
    return rateLimit({
      windowMs,
      limit: config[limit],
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`),
      handler: (_req, _res, next) =>
        next(new AppError('RATE_LIMITED', `Too many ${what}; please wait a moment and try again`)),
    });
  };
  return { login: make('login'), chat: make('chat'), upload: make('upload') };
}

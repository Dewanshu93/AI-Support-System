// Error envelope returned by every API error (playbook section 4):
// { error: { code, message, details?, requestId } }
import { z } from 'zod';

/** Each error code has exactly one HTTP status. */
export const ERROR_HTTP_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  // Confirming a ticket draft when an open ticket on the same issue exists (contract flow 5).
  DUPLICATE_CANDIDATE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  LLM_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;
export const ERROR_CODES = Object.keys(ERROR_HTTP_STATUS) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** Where a request validation issue was found. */
export const ValidationIssueSchema = z.object({
  location: z.enum(['body', 'query', 'params']),
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

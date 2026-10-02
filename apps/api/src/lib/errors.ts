import { ERROR_HTTP_STATUS, type ErrorCode } from '@sd/shared';

/**
 * The only error type services should throw for expected failures. The central
 * error handler turns it into the shared error envelope; anything else
 * becomes INTERNAL without leaking details.
 */
export class AppError extends Error {
  override name = 'AppError';
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = ERROR_HTTP_STATUS[code];
  }
}

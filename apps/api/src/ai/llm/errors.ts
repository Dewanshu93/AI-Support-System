/**
 * Why an LLM or embedding call failed. Callers map every kind to the
 * LLM_UNAVAILABLE envelope (503) or a fallback reply; details go to the trace.
 */
export type LlmErrorKind = 'config' | 'timeout' | 'provider' | 'invalid_output';

export class LlmError extends Error {
  override name = 'LlmError';
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

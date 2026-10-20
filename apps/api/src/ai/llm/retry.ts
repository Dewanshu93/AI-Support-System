import { LlmError } from './errors';

export interface CallPolicy {
  timeoutMs: number;
  maxRetries: number;
  /** First backoff delay; doubles per retry, plus jitter. */
  baseDelayMs?: number;
  /** Upper bound for any single wait, including provider retry hints. */
  maxDelayMs?: number;
  /**
   * Wall-clock budget for the whole call, retries and backoff included (W4-09):
   * each node makes one call, so this bounds how long a node can take. Each
   * attempt gets at most the time left; no retry starts that could not finish.
   */
  totalTimeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** HTTP status from LangChain/OpenAI/Google SDK errors, when one can be found. */
export function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown }; message?: unknown };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.response?.status === 'number') return e.response.status;
  // Google SDK: "[GoogleGenerativeAI Error]: Error fetching from …: [429 Too Many Requests] …"
  const m = typeof e?.message === 'string' ? /\[(\d{3})[ \]]/.exec(e.message) : null;
  return m ? Number(m[1]) : undefined;
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
]);

/**
 * Provider-suggested wait before retrying, in ms: Gemini puts it in the error
 * (`"retryDelay":"37s"` or "Please retry in 37.2s"); others use retryAfter.
 */
export function retryAfterMs(err: unknown): number | undefined {
  const e = err as {
    message?: unknown;
    retryAfter?: unknown;
    headers?: { get?: (k: string) => string | null };
  };
  if (typeof e?.retryAfter === 'number') return e.retryAfter * 1000;
  const header = typeof e?.headers?.get === 'function' ? e.headers.get('retry-after') : null;
  if (header && /^\d+(\.\d+)?$/.test(header)) return Number(header) * 1000;
  if (typeof e?.message !== 'string') return undefined;
  const m =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(e.message) ??
    /retry in (\d+(?:\.\d+)?)\s*s/i.exec(e.message);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

/** Timeouts, rate limits, 5xx and network failures are worth retrying; 4xx and bad output are not. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof LlmError) return err.kind === 'timeout';
  const status = errorStatus(err);
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  const code =
    (err as { code?: unknown; cause?: { code?: unknown } })?.cause?.code ??
    (err as { code?: unknown })?.code;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return true;
  return err instanceof TypeError && /fetch failed/i.test(err.message);
}

/** True for errors that come from the provider or network rather than our own code. */
export function isProviderError(err: unknown): boolean {
  return (
    (err instanceof LlmError && err.kind === 'timeout') ||
    errorStatus(err) !== undefined ||
    isRetryable(err)
  );
}

/**
 * Runs `fn` with a per-attempt timeout (the signal is aborted and the call
 * abandoned) and retries retryable failures with exponential backoff.
 * Provider SDK retries are disabled so this is the only retry layer.
 */
export async function withCallPolicy<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  policy: CallPolicy,
): Promise<{ value: T; retries: number }> {
  const sleep = policy.sleep ?? sleepFor;
  const now = policy.now ?? Date.now;
  const base = policy.baseDelayMs ?? 500;
  const deadline = policy.totalTimeoutMs ? now() + policy.totalTimeoutMs : Infinity;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const attemptMs = Math.max(1, Math.min(policy.timeoutMs, deadline - now()));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LlmError('timeout', `LLM call timed out after ${attemptMs} ms`));
      }, attemptMs);
    });
    try {
      const value = await Promise.race([fn(controller.signal), timeout]);
      return { value, retries: attempt };
    } catch (err) {
      if (attempt >= policy.maxRetries || !isRetryable(err)) {
        if (err instanceof LlmError) throw err;
        throw new LlmError(
          'provider',
          `LLM provider call failed${errorStatus(err) ? ` (HTTP ${errorStatus(err)})` : ''}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err },
        );
      }
      const backoff = base * 2 ** attempt + Math.floor(Math.random() * base * 0.2);
      const wait = Math.min(Math.max(backoff, retryAfterMs(err) ?? 0), policy.maxDelayMs ?? 60_000);
      // Out of budget: give up now rather than start an attempt that cannot finish.
      if (now() + wait >= deadline) {
        throw new LlmError(
          'timeout',
          `LLM call gave up after its ${policy.totalTimeoutMs} ms budget (${attempt + 1} attempts)`,
          { cause: err },
        );
      }
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
}

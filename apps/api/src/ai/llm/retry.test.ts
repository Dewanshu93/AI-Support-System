import { LlmError } from './errors';
import { errorStatus, isRetryable, retryAfterMs, withCallPolicy } from './retry';

const fast = { timeoutMs: 50, maxRetries: 2, baseDelayMs: 1 };
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('withCallPolicy', () => {
  it('returns the value with zero retries on success', async () => {
    await expect(withCallPolicy(async () => 'ok', fast)).resolves.toEqual({
      value: 'ok',
      retries: 0,
    });
  });

  it('retries retryable errors with exponential backoff, then succeeds', async () => {
    const delays: number[] = [];
    const fn = jest
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce('ok');
    const result = await withCallPolicy(fn, {
      ...fast,
      baseDelayMs: 100,
      sleep: async (ms) => void delays.push(ms),
    });
    expect(result).toEqual({ value: 'ok', retries: 2 });
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThan(120);
    expect(delays[1]).toBeGreaterThanOrEqual(200);
    expect(delays[1]).toBeLessThan(220);
  });

  it('aborts a slow attempt after timeoutMs, signals the call and retries', async () => {
    const signals: AbortSignal[] = [];
    let call = 0;
    const result = await withCallPolicy((signal) => {
      signals.push(signal);
      call++;
      return call === 1 ? new Promise<string>(() => {}) : Promise.resolve('second');
    }, fast);
    expect(result).toEqual({ value: 'second', retries: 1 });
    expect(signals[0]!.aborted).toBe(true);
  });

  it('throws LlmError(timeout) when every attempt times out', async () => {
    await expect(
      withCallPolicy(() => new Promise(() => {}), { ...fast, maxRetries: 1 }),
    ).rejects.toEqual(new LlmError('timeout', 'LLM call timed out after 50 ms'));
  });

  it('does not retry client errors and wraps them as LlmError(provider)', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(400));
    await expect(withCallPolicy(fn, fast)).rejects.toMatchObject({
      kind: 'provider',
      message: 'LLM provider call failed (HTTP 400): HTTP 400',
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(500));
    await expect(withCallPolicy(fn, fast)).rejects.toMatchObject({ kind: 'provider' });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('error classification', () => {
  it.each<[string, unknown, number | undefined]>([
    ['status field', httpError(429), 429],
    ['response.status', { response: { status: 502 } }, 502],
    [
      'Google SDK message',
      new Error(
        '[GoogleGenerativeAI Error]: Error fetching from https://x: [429 Too Many Requests] quota',
      ),
      429,
    ],
    ['plain error', new Error('boom'), undefined],
  ])('errorStatus from %s', (_name, err, expected) => {
    expect(errorStatus(err)).toBe(expected);
  });

  it.each<[string, unknown, boolean]>([
    ['429', httpError(429), true],
    ['500', httpError(500), true],
    ['408', httpError(408), true],
    ['400', httpError(400), false],
    ['403', httpError(403), false],
    ['timeout', new LlmError('timeout', 't'), true],
    ['invalid output', new LlmError('invalid_output', 'x'), false],
    ['connection reset', Object.assign(new Error('socket'), { code: 'ECONNRESET' }), true],
    ['fetch failed', new TypeError('fetch failed'), true],
    ['programming error', new TypeError('x is not a function'), false],
  ])('%s retryable: %s', (_name, err, expected) => {
    expect(isRetryable(err)).toBe(expected);
  });
});

describe('retry hints', () => {
  it.each<[string, unknown, number | undefined]>([
    [
      'Gemini retryDelay detail',
      new Error('[429 Too Many Requests] … "retryDelay":"37s" …'),
      37_000,
    ],
    ['Gemini prose hint', new Error('Quota exceeded. Please retry in 12.4s.'), 12_400],
    ['retryAfter seconds', { retryAfter: 3 }, 3000],
    ['retry-after header', { headers: { get: () => '5' } }, 5000],
    ['no hint', new Error('boom'), undefined],
  ])('retryAfterMs from %s', (_name, err, expected) => {
    expect(retryAfterMs(err)).toBe(expected);
  });

  it('waits at least the provider hint, capped at maxDelayMs', async () => {
    const delays: number[] = [];
    const limited = Object.assign(new Error('"retryDelay":"40s"'), { status: 429 });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(limited)
      .mockRejectedValueOnce(limited)
      .mockResolvedValue('ok');
    await withCallPolicy(fn, {
      timeoutMs: 50,
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 30_000,
      sleep: async (ms) => void delays.push(ms),
    });
    expect(delays).toEqual([30_000, 30_000]);
  });
});

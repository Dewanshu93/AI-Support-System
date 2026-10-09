import { LlmError } from './errors';
import { cooldownFor, ProviderHealth } from './providerHealth';

const httpError = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

describe('cooldownFor', () => {
  it('sets a model aside for a day-quota 429 for at least an hour', () => {
    const err = httpError(
      429,
      '[429 Too Many Requests] Quota exceeded for metric generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel',
    );
    expect(cooldownFor(err)).toEqual({ reason: 'quota', ms: 3_600_000, scope: 'model' });
  });

  it('uses the provider hint for a per-minute 429, else one minute', () => {
    expect(cooldownFor(httpError(429, 'rate limited. Please retry in 12.5s'))).toEqual({
      reason: 'rate_limit',
      ms: 12_500,
      scope: 'model',
    });
    expect(cooldownFor(httpError(429))).toMatchObject({ reason: 'rate_limit', ms: 60_000 });
  });

  it('sets the whole provider aside when out of credit or the key is rejected', () => {
    expect(cooldownFor(httpError(402))).toMatchObject({ reason: 'credit', scope: 'provider' });
    expect(cooldownFor(httpError(401))).toMatchObject({ reason: 'auth', scope: 'provider' });
    expect(cooldownFor(httpError(403))).toMatchObject({ reason: 'auth', scope: 'provider' });
  });

  it('treats 5xx and an unreachable server as unavailable for 30 s', () => {
    expect(cooldownFor(httpError(503))).toEqual({
      reason: 'unavailable',
      ms: 30_000,
      scope: 'model',
    });
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    expect(cooldownFor(refused)).toMatchObject({ reason: 'unavailable' });
  });

  it('looks through LlmError(provider) to its cause', () => {
    const wrapped = new LlmError('provider', 'failed', { cause: httpError(402) });
    expect(cooldownFor(wrapped)).toMatchObject({ reason: 'credit' });
  });

  it.each([
    ['a schema rejection (400)', httpError(400)],
    ['not found (404)', httpError(404)],
    ['invalid output', new LlmError('invalid_output', 'bad JSON')],
    ['a timeout', new LlmError('timeout', 'timed out')],
    ['a missing key', new LlmError('config', 'GEMINI_API_KEY is not set')],
    ['an abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['a bug', new Error('undefined is not a function')],
  ])('does not fall back for %s', (_, err) => {
    expect(cooldownFor(err)).toBeNull();
  });
});

describe('ProviderHealth', () => {
  const gemini = { provider: 'gemini', modelId: 'gemini-3.8-flash' };
  const geminiFast = { provider: 'gemini', modelId: 'gemini-3.1-flash-lite' };
  const ollama = { provider: 'ollama', modelId: 'qwen2.5:3b' };

  it('keeps the given order while everything is healthy', () => {
    expect(new ProviderHealth().order([gemini, geminiFast, ollama])).toEqual([
      gemini,
      geminiFast,
      ollama,
    ]);
  });

  it('moves a cooling model behind the healthy ones until its cooldown ends', () => {
    let now = 1_000;
    const health = new ProviderHealth(() => now);
    health.markDown(gemini, { reason: 'quota', ms: 60_000, scope: 'model' });
    expect(health.order([gemini, geminiFast, ollama])).toEqual([geminiFast, ollama, gemini]);
    expect(health.status(gemini)).toEqual({ ms: 60_000, reason: 'quota' });
    expect(health.status(geminiFast).ms).toBe(0);
    now += 60_000;
    expect(health.order([gemini, geminiFast, ollama])).toEqual([gemini, geminiFast, ollama]);
  });

  it('a provider-wide cooldown covers every model of that provider', () => {
    const health = new ProviderHealth(() => 0);
    health.markDown(geminiFast, { reason: 'auth', ms: 10, scope: 'provider' });
    expect(health.order([gemini, geminiFast, ollama])).toEqual([ollama, gemini, geminiFast]);
  });

  it('still lists every model when all are cooling, soonest to recover first', () => {
    const health = new ProviderHealth(() => 0);
    health.markDown(gemini, { reason: 'quota', ms: 300, scope: 'model' });
    health.markDown(ollama, { reason: 'unavailable', ms: 100, scope: 'model' });
    health.markDown(geminiFast, { reason: 'rate_limit', ms: 200, scope: 'model' });
    expect(health.order([gemini, geminiFast, ollama])).toEqual([ollama, geminiFast, gemini]);
  });

  it('a success clears the cooldown', () => {
    const health = new ProviderHealth(() => 0);
    health.markDown(gemini, { reason: 'rate_limit', ms: 1_000, scope: 'model' });
    health.markUp(gemini);
    expect(health.status(gemini).ms).toBe(0);
  });
});

import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { invokeStructured } from './chatModel';
import { FakeChatModel, type FakeReply } from './fakeModels';
import { answeredBy, type FallbackCandidate, fallbackChatHandle } from './fallback';
import { ProviderHealth } from './providerHealth';

const httpError = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });
const dailyQuota = () => httpError(429, 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel');

const ask = [new HumanMessage('How many days of annual leave?')];
const Answer = z.object({ answer: z.string() });
const costs = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'qwen2.5:3b': { input: 0, output: 0 },
};
const policy = { timeoutMs: 1000, maxRetries: 0 };

function chain(replies: Record<string, FakeReply[]>, options = { nativeStructured: true }) {
  const models = {
    quality: new FakeChatModel(replies.quality ?? [], options),
    fast: new FakeChatModel(replies.fast ?? [], options),
    local: new FakeChatModel(replies.local ?? [], options),
  };
  const candidates: FallbackCandidate[] = [
    { provider: 'gemini', modelId: 'gemini-3.8-flash', model: () => models.quality },
    { provider: 'gemini', modelId: 'gemini-3.1-flash-lite', model: () => models.fast },
    { provider: 'ollama', modelId: 'qwen2.5:3b', model: () => models.local },
  ];
  return { models, candidates };
}

describe('fallback chat model', () => {
  it('uses the first model when it answers, and says so', async () => {
    const { models, candidates } = chain({ quality: ['{"answer":"15 days"}'] });
    const handle = fallbackChatHandle(candidates, new ProviderHealth());
    expect(handle).toMatchObject({ provider: 'gemini', modelId: 'gemini-3.8-flash' });
    const result = await invokeStructured(handle, Answer, ask, { policy, costs });
    expect(result).toMatchObject({
      data: { answer: '15 days' },
      provider: 'gemini',
      modelId: 'gemini-3.8-flash',
    });
    expect(models.fast.calls).toHaveLength(0);
  });

  it('moves to the next model on a quota error and reports the model that answered', async () => {
    const { models, candidates } = chain({
      quality: [dailyQuota()],
      fast: [{ text: '{"answer":"15 days"}', inputTokens: 1000, outputTokens: 0 }],
    });
    const events: unknown[] = [];
    const handle = fallbackChatHandle(candidates, new ProviderHealth(), (e) => events.push(e));
    const result = await invokeStructured(handle, Answer, ask, { policy, costs });
    expect(result).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.1-flash-lite',
      mode: 'native',
    });
    // Priced as the fast model: 1000 × $0.25/M.
    expect(result.costUsd).toBeCloseTo(0.00025, 8);
    expect(events).toEqual([
      {
        from: expect.objectContaining({ modelId: 'gemini-3.8-flash' }),
        reason: 'quota',
        cooldownMs: 3_600_000,
        next: expect.objectContaining({ modelId: 'gemini-3.1-flash-lite' }),
      },
    ]);
    expect(models.quality.calls).toHaveLength(1);
  });

  it('skips a model while it cools down, without calling it', async () => {
    const { models, candidates } = chain({
      quality: [dailyQuota()],
      fast: ['{"answer":"a"}', '{"answer":"b"}'],
    });
    const handle = fallbackChatHandle(candidates, new ProviderHealth());
    await invokeStructured(handle, Answer, ask, { policy, costs });
    const second = await invokeStructured(handle, Answer, ask, { policy, costs });
    expect(second.data).toEqual({ answer: 'b' });
    expect(models.quality.calls).toHaveLength(1);
  });

  it('shares cooldowns across handles through one ProviderHealth', async () => {
    const health = new ProviderHealth();
    const first = chain({ quality: [httpError(402)], fast: [], local: ['{"answer":"local"}'] });
    // 402 sets the whole provider aside: the fast Gemini model is skipped too.
    const result = await invokeStructured(
      fallbackChatHandle(first.candidates, health),
      Answer,
      ask,
      {
        policy,
        costs,
      },
    );
    expect(result).toMatchObject({ provider: 'ollama', modelId: 'qwen2.5:3b' });
    expect(first.models.fast.calls).toHaveLength(0);

    const later = chain({ local: ['{"answer":"again"}'] });
    await invokeStructured(fallbackChatHandle(later.candidates, health), Answer, ask, {
      policy,
      costs,
    });
    expect(later.models.quality.calls).toHaveLength(0);
  });

  it('does not change model for a request problem: a 400 still reaches the JSON fallback', async () => {
    const { models, candidates } = chain({
      quality: [httpError(400, 'Unknown name "const"'), '{"answer":"via json"}'],
    });
    const result = await invokeStructured(
      fallbackChatHandle(candidates, new ProviderHealth()),
      Answer,
      ask,
      {
        policy,
        costs,
      },
    );
    expect(result).toMatchObject({ mode: 'json_fallback', modelId: 'gemini-3.8-flash' });
    expect(models.fast.calls).toHaveLength(0);
  });

  it('throws the last error when every model fails', async () => {
    const { candidates } = chain({
      quality: [dailyQuota()],
      fast: [dailyQuota()],
      local: [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })],
    });
    await expect(
      invokeStructured(fallbackChatHandle(candidates, new ProviderHealth()), Answer, ask, {
        policy,
        costs,
      }),
    ).rejects.toMatchObject({ kind: 'provider', message: expect.stringMatching(/fetch failed/) });
  });

  it('a plain call falls back and is stamped with the model that answered', async () => {
    const { candidates } = chain({ quality: [httpError(503)], fast: ['plain text'] });
    const handle = fallbackChatHandle(candidates, new ProviderHealth());
    const reply = await handle.model.invoke(ask);
    expect(reply.content).toBe('plain text');
    expect(answeredBy(reply)).toEqual({ provider: 'gemini', modelId: 'gemini-3.1-flash-lite' });
  });

  it('a stream falls back before its first chunk and keeps usage', async () => {
    const { candidates } = chain({
      quality: [dailyQuota()],
      fast: [{ text: 'Fifteen days of annual leave.', inputTokens: 50, outputTokens: 7 }],
    });
    const handle = fallbackChatHandle(candidates, new ProviderHealth());
    let text = '';
    let full;
    for await (const chunk of await handle.model.stream(ask)) {
      text += String(chunk.content);
      full = full ? full.concat(chunk) : chunk;
    }
    expect(text).toBe('Fifteen days of annual leave.');
    expect(answeredBy(full)).toEqual({ provider: 'gemini', modelId: 'gemini-3.1-flash-lite' });
    expect(full?.usage_metadata).toMatchObject({ input_tokens: 50, output_tokens: 7 });
  });

  it('a stream that fails after its first chunk does not start over on another model', async () => {
    const { models, candidates } = chain({
      quality: [{ text: 'Fifteen days of annual leave.', streamError: httpError(503) }],
      fast: ['never'],
    });
    const handle = fallbackChatHandle(candidates, new ProviderHealth());
    await expect(
      (async () => {
        for await (const _ of await handle.model.stream(ask)) void _;
      })(),
    ).rejects.toThrow('HTTP 503');
    expect(models.fast.calls).toHaveLength(0);
  });

  it('builds each model only when it is first needed', async () => {
    const build = jest.fn(() => new FakeChatModel(['{"answer":"x"}'], { nativeStructured: true }));
    const never = jest.fn(() => new FakeChatModel([]));
    const handle = fallbackChatHandle(
      [
        { provider: 'gemini', modelId: 'gemini-3.8-flash', model: build },
        { provider: 'ollama', modelId: 'qwen2.5:3b', model: never },
      ],
      new ProviderHealth(),
    );
    await invokeStructured(handle, Answer, ask, { policy, costs });
    expect(build).toHaveBeenCalledTimes(1);
    expect(never).not.toHaveBeenCalled();
  });
});

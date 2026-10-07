import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { VALID_ENV } from '../../../test/helpers/config';
import { loadConfig } from '../../config';
import {
  createChatModel,
  extractJson,
  invokeStructured,
  llmConfigured,
  OPENROUTER_BASE_URL,
  resolveChatModel,
} from './chatModel';
import { LlmError } from './errors';
import { fakeChatHandle } from './fakeModels';

const models = loadConfig({ ...VALID_ENV }).models;
const keys = { GEMINI_API_KEY: 'g-key', OPENROUTER_API_KEY: 'o-key' };
const policy = { timeoutMs: 1000, maxRetries: 2, baseDelayMs: 1, sleep: async () => {} };

describe('factory selection', () => {
  it('maps provider and tier to the configured model ID', () => {
    expect(resolveChatModel(models, 'fast')).toEqual({
      provider: 'gemini',
      modelId: 'gemini-3.1-flash-lite',
    });
    expect(resolveChatModel(models, 'quality')).toEqual({
      provider: 'gemini',
      modelId: 'gemini-3.8-flash',
    });
    expect(resolveChatModel(models, 'fast', 'openrouter')).toEqual({
      provider: 'openrouter',
      modelId: 'google/gemini-3.1-flash-lite',
    });
  });

  it('builds a Google GenAI chat model for gemini, with SDK retries disabled', () => {
    const handle = createChatModel(models, keys, 'fast');
    expect(handle).toMatchObject({ provider: 'gemini', modelId: 'gemini-3.1-flash-lite' });
    expect(handle.model).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect((handle.model as ChatGoogleGenerativeAI).model).toBe('gemini-3.1-flash-lite');
    expect((handle.model.caller as unknown as { maxRetries: number }).maxRetries).toBe(0);
    expect((handle.model as ChatGoogleGenerativeAI).maxOutputTokens).toBe(2048);
  });

  it('uses temperature 0 unless the prompt asks for another', () => {
    expect(
      (createChatModel(models, keys, 'fast').model as ChatGoogleGenerativeAI).temperature,
    ).toBe(0);
    const warm = createChatModel(models, keys, 'quality', 'gemini', { temperature: 0.2 });
    expect((warm.model as ChatGoogleGenerativeAI).temperature).toBe(0.2);
    const router = createChatModel(models, keys, 'quality', 'openrouter', { temperature: 0.2 });
    expect((router.model as ChatOpenAI).temperature).toBe(0.2);
  });

  it('builds an OpenAI-compatible model pointed at OpenRouter', () => {
    const handle = createChatModel(models, keys, 'quality', 'openrouter');
    expect(handle.model).toBeInstanceOf(ChatOpenAI);
    const model = handle.model as ChatOpenAI;
    expect(model.model).toBe('google/gemini-3.8-flash');
    expect((model as unknown as { clientConfig: { baseURL: string } }).clientConfig.baseURL).toBe(
      OPENROUTER_BASE_URL,
    );
    expect((model.caller as unknown as { maxRetries: number }).maxRetries).toBe(0);
    expect(model.maxTokens).toBe(2048);
  });

  it('switches provider by config only', () => {
    const openrouterConfig = {
      ...models,
      chat: { ...models.chat, provider: 'openrouter' as const },
    };
    expect(createChatModel(openrouterConfig, keys, 'fast').model).toBeInstanceOf(ChatOpenAI);
  });

  it('fails with a config error naming the missing key', () => {
    expect(() => createChatModel(models, {}, 'fast')).toThrow(
      new LlmError('config', 'GEMINI_API_KEY is not set; cannot use gemini models'),
    );
    expect(() => createChatModel(models, { GEMINI_API_KEY: 'g' }, 'fast', 'openrouter')).toThrow(
      /OPENROUTER_API_KEY is not set/,
    );
  });

  it('reports llmConfigured only when chat and embedding keys are both present', () => {
    expect(llmConfigured(models, { GEMINI_API_KEY: 'g' })).toBe(true);
    expect(llmConfigured(models, {})).toBe(false);
    const openrouterConfig = {
      ...models,
      chat: { ...models.chat, provider: 'openrouter' as const },
    };
    expect(llmConfigured(openrouterConfig, { OPENROUTER_API_KEY: 'o' })).toBe(false);
    expect(llmConfigured(openrouterConfig, keys)).toBe(true);
  });
});

const Answer = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });
const ask = [new HumanMessage('How many days of annual leave do US employees get?')];
const opts = { policy, costs: models.costs, name: 'answer' };

describe('invokeStructured', () => {
  it('returns native structured output with usage, cost and latency', async () => {
    const handle = fakeChatHandle(
      [{ text: '{"answer":"15 days","confidence":0.9}', inputTokens: 1000, outputTokens: 200 }],
      {
        nativeStructured: true,
      },
    );
    const result = await invokeStructured(handle, Answer, ask, opts);
    expect(result).toMatchObject({
      data: { answer: '15 days', confidence: 0.9 },
      mode: 'native',
      usage: { inputTokens: 1000, outputTokens: 200 },
      retries: 0,
      provider: 'gemini',
      modelId: 'gemini-3.1-flash-lite',
    });
    // 1000 × $0.25/M + 200 × $1.50/M
    expect(result.costUsd).toBeCloseTo(0.00055, 8);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to a JSON-instructed plain call when native output is unsupported', async () => {
    const handle = fakeChatHandle(['Sure! ```json\n{"answer":"20 days","confidence":0.8}\n```']);
    const result = await invokeStructured(handle, Answer, ask, opts);
    expect(result).toMatchObject({ data: { answer: '20 days' }, mode: 'json_fallback' });
    const sent = handle.model.calls[0]!;
    expect(String(sent.at(-1)!.content)).toMatch(/Respond with only a JSON object/);
    expect(String(sent.at(-1)!.content)).toContain('"confidence"');
    // Gemini rejects a system message after the first one.
    expect(sent.at(-1)!.getType()).toBe('human');
    expect(sent.slice(1).some((m) => m.getType() === 'system')).toBe(false);
  });

  it('falls back when native output fails the schema, and adds both calls to usage', async () => {
    const handle = fakeChatHandle(
      ['{"answer":"x","confidence":7}', '{"answer":"15 days","confidence":0.5}'],
      {
        nativeStructured: true,
      },
    );
    const result = await invokeStructured(handle, Answer, ask, opts);
    expect(result.mode).toBe('json_fallback');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
    expect(handle.model.calls).toHaveLength(2);
  });

  it('throws invalid_output when the fallback output is not valid', async () => {
    await expect(
      invokeStructured(fakeChatHandle(['no json here']), Answer, ask, opts),
    ).rejects.toMatchObject({
      kind: 'invalid_output',
    });
    await expect(
      invokeStructured(fakeChatHandle(['{"answer":"x"}']), Answer, ask, opts),
    ).rejects.toThrow(/does not match the schema: confidence/);
  });

  it('retries provider errors and does not fall back on them', async () => {
    const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
    const handle = fakeChatHandle([rateLimited, '{"answer":"ok","confidence":1}'], {
      nativeStructured: true,
    });
    const result = await invokeStructured(handle, Answer, ask, opts);
    expect(result).toMatchObject({ mode: 'native', retries: 1 });
  });

  it('falls back when the provider rejects the native schema with HTTP 400 (e.g. Gemini and "const")', async () => {
    const rejected = Object.assign(
      new Error('[400 Bad Request] Unknown name "const" at generation_config.response_schema'),
      { status: 400 },
    );
    const handle = fakeChatHandle([rejected, '{"answer":"15 days","confidence":0.9}'], {
      nativeStructured: true,
    });
    const result = await invokeStructured(handle, Answer, ask, opts);
    expect(result).toMatchObject({ mode: 'json_fallback', retries: 0 });
    expect(handle.model.calls).toHaveLength(2);
  });

  it('surfaces a non-retryable provider error as LlmError(provider)', async () => {
    const forbidden = Object.assign(new Error('API key invalid'), { status: 403 });
    const handle = fakeChatHandle([forbidden, '{"answer":"never","confidence":1}'], {
      nativeStructured: true,
    });
    await expect(invokeStructured(handle, Answer, ask, opts)).rejects.toMatchObject({
      kind: 'provider',
      message: expect.stringMatching(/HTTP 403/),
    });
    expect(handle.model.calls).toHaveLength(1);
  });
});

describe('extractJson', () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Here you go: {"a":{"b":2}} — done', { a: { b: 2 } }],
  ])('extracts %j', (text, expected) => {
    expect(extractJson(text)).toEqual(expected);
  });

  it('throws when there is no object', () => {
    expect(() => extractJson('nothing')).toThrow('no JSON object');
  });
});

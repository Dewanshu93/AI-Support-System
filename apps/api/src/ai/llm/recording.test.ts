import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { invokeStructured } from './chatModel';
import { fakeChatHandle } from './fakeModels';
import { LlmRecordings, recordedChatHandle, recordedEmbedQuery } from './recording';

let file: string;
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-rec-')), 'recordings.json');
});

const messages = [new SystemMessage('You are a test.'), new HumanMessage('How much leave?')];
const identity = { provider: 'gemini' as const, modelId: 'gemini-3.1-flash-lite' };

describe('recorded LLM mode', () => {
  it('records text, stream and structured replies, then replays them without the provider', async () => {
    const live = fakeChatHandle(['plain reply', 'streamed reply text', JSON.stringify({ n: 3 })], {
      nativeStructured: true,
    });
    const rec = recordedChatHandle('record', new LlmRecordings(file), () => live, identity);
    expect((await rec.model.invoke(messages)).content).toBe('plain reply');
    let streamed = '';
    for await (const c of await rec.model.stream(messages)) streamed += String(c.content);
    expect(streamed).toBe('streamed reply text');
    const schema = z.object({ n: z.number() });
    expect(await rec.model.withStructuredOutput(schema).invoke(messages)).toEqual({ n: 3 });
    expect(live.model.calls).toHaveLength(3);

    // Replay from the saved file: no provider at all.
    const replay = recordedChatHandle(
      'replay',
      new LlmRecordings(file),
      () => {
        throw new Error('replay must not build a live model');
      },
      identity,
    );
    expect(replay.modelId).toBe('gemini-3.1-flash-lite');
    expect((await replay.model.invoke(messages)).content).toBe('plain reply');
    let replayed = '';
    for await (const c of await replay.model.stream(messages)) replayed += String(c.content);
    expect(replayed).toBe('streamed reply text');
    const structured = await replay.model
      .withStructuredOutput(schema, { includeRaw: true })
      .invoke(messages);
    expect(structured.parsed).toEqual({ n: 3 });
  });

  it('a native structured failure is recorded, so replay takes the same JSON fallback', async () => {
    // Native structured output rejected by the provider (HTTP 400, e.g. an unsupported
    // schema); invokeStructured then falls back to a plain JSON call.
    const live = fakeChatHandle([JSON.stringify({ n: 3 })]);
    live.model.withStructuredOutput = (() =>
      RunnableLambda.from(() => {
        throw Object.assign(new Error('Invalid JSON schema'), { status: 400 });
      })) as never;
    const schema = z.object({ n: z.number() });
    const opts = {
      policy: { timeoutMs: 1000, maxRetries: 0 },
      costs: { 'gemini-3.1-flash-lite': { input: 0, output: 0 } },
    };

    const rec = recordedChatHandle('record', new LlmRecordings(file), () => live, identity);
    const recorded = await invokeStructured(rec, schema, messages, opts);
    expect(recorded).toMatchObject({ data: { n: 3 }, mode: 'json_fallback' });

    const replay = recordedChatHandle(
      'replay',
      new LlmRecordings(file),
      () => {
        throw new Error('replay must not build a live model');
      },
      identity,
    );
    const replayed = await invokeStructured(replay, schema, messages, opts);
    expect(replayed).toMatchObject({ data: { n: 3 }, mode: 'json_fallback' });
    expect(live.model.calls).toHaveLength(1);
  });

  it('a missing recording fails loudly instead of calling a provider', async () => {
    const replay = recordedChatHandle(
      'replay',
      new LlmRecordings(file),
      () => fakeChatHandle([]),
      identity,
    );
    await expect(replay.model.invoke([new HumanMessage('never recorded')])).rejects.toThrow(
      'LLM_MODE=replay: no text recording',
    );
  });

  it('cache: a hit is served without the provider; a miss calls it once and is saved', async () => {
    const live = fakeChatHandle(
      [
        { text: 'plain reply', inputTokens: 40, outputTokens: 5 },
        'streamed reply text',
        JSON.stringify({ n: 3 }),
      ],
      { nativeStructured: true },
    );
    const schema = z.object({ n: z.number() });
    const run = async () => {
      const cache = recordedChatHandle('cache', new LlmRecordings(file), () => live, identity);
      const text = await cache.model.invoke(messages);
      let streamed = '';
      for await (const c of await cache.model.stream(messages)) streamed += String(c.content);
      const structured = await cache.model.withStructuredOutput(schema).invoke(messages);
      return { text, streamed, structured };
    };
    const first = await run();
    // A miss passes the live reply through, usage included.
    expect(first.text.usage_metadata).toMatchObject({ input_tokens: 40 });
    const second = await run();
    expect(second.text.content).toBe('plain reply');
    expect(second.text.usage_metadata).toMatchObject({ input_tokens: 0 });
    expect(second.streamed).toBe('streamed reply text');
    expect(second.structured).toEqual({ n: 3 });
    expect(live.model.calls).toHaveLength(3);
  });

  it('cache: a provider outage is not saved, so the next call tries again', async () => {
    const outage = Object.assign(new Error('quota'), { status: 429 });
    const live = fakeChatHandle([outage, JSON.stringify({ n: 1 })], { nativeStructured: true });
    const schema = z.object({ n: z.number() });
    const cache = recordedChatHandle('cache', new LlmRecordings(file), () => live, identity);
    await expect(cache.model.withStructuredOutput(schema).invoke(messages)).rejects.toThrow(
      'quota',
    );
    expect(await cache.model.withStructuredOutput(schema).invoke(messages)).toEqual({ n: 1 });
  });

  it('cache: a schema rejection (400) is saved, so the JSON fallback is not re-tried natively', async () => {
    const live = fakeChatHandle([JSON.stringify({ n: 3 })]);
    let nativeCalls = 0;
    live.model.withStructuredOutput = (() =>
      RunnableLambda.from(() => {
        nativeCalls++;
        throw Object.assign(new Error('Invalid JSON schema'), { status: 400 });
      })) as never;
    const schema = z.object({ n: z.number() });
    const opts = {
      policy: { timeoutMs: 1000, maxRetries: 0 },
      costs: { 'gemini-3.1-flash-lite': { input: 0, output: 0 } },
    };
    for (let i = 0; i < 2; i++) {
      const cache = recordedChatHandle('cache', new LlmRecordings(file), () => live, identity);
      expect(await invokeStructured(cache, schema, messages, opts)).toMatchObject({
        data: { n: 3 },
        mode: 'json_fallback',
      });
    }
    expect(nativeCalls).toBe(1);
    expect(live.model.calls).toHaveLength(1);
  });

  it('cache: query embeddings are saved and reused', async () => {
    const live = jest.fn(async () => [0.3, 0.4]);
    const embed = recordedEmbedQuery('cache', new LlmRecordings(file), live);
    expect(await embed('vpn')).toEqual([0.3, 0.4]);
    expect(await recordedEmbedQuery('cache', new LlmRecordings(file), live)('vpn')).toEqual([
      0.3, 0.4,
    ]);
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('records and replays query embeddings', async () => {
    const live = jest.fn(async () => [0.1, 0.2]);
    await recordedEmbedQuery('record', new LlmRecordings(file), live)('vpn');
    const replay = recordedEmbedQuery('replay', new LlmRecordings(file), async () => {
      throw new Error('no live call');
    });
    expect(await replay('vpn')).toEqual([0.1, 0.2]);
    await expect(replay('other')).rejects.toThrow('no embedding recording');
    expect(live).toHaveBeenCalledTimes(1);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
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

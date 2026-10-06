// Recorded LLM mode for end-to-end tests (W2-09: "live or recorded LLM per test
// config"). LLM_MODE=record calls the real provider and saves every reply to a
// JSON file keyed by a hash of the prompt messages; LLM_MODE=replay serves the
// saved replies and never calls a provider. A missing recording is an error, so
// replay can never silently fall back to a live call. Never used in production.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ChatHandle } from './chatModel';

export const LLM_MODES = ['live', 'record', 'replay'] as const;
export type LlmMode = (typeof LLM_MODES)[number];

type Kind = 'text' | 'stream' | 'structured' | 'embedding';

/** File-backed recordings: { [key]: { kind, value } }, written after every new recording. */
export class LlmRecordings {
  private readonly entries: Record<string, { kind: Kind; value: unknown }>;

  constructor(private readonly file: string) {
    this.entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  static key(kind: Kind, input: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify([kind, input]))
      .digest('hex')
      .slice(0, 24);
  }

  get(kind: Kind, input: unknown): unknown {
    const entry = this.entries[LlmRecordings.key(kind, input)];
    if (!entry) {
      throw new Error(
        `LLM_MODE=replay: no ${kind} recording for this prompt (key ${LlmRecordings.key(kind, input)}); re-record with LLM_MODE=record`,
      );
    }
    return entry.value;
  }

  set(kind: Kind, input: unknown, value: unknown): void {
    this.entries[LlmRecordings.key(kind, input)] = { kind, value };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.entries, null, 1)}\n`);
  }

  get size(): number {
    return Object.keys(this.entries).length;
  }
}

/** Prompt identity: message types and contents (provider and model excluded on purpose). */
const promptOf = (messages: BaseMessage[]) => messages.map((m) => [m.getType(), m.content]);

const textOf = (m: { content: unknown }) =>
  typeof m.content === 'string'
    ? m.content
    : (m.content as { text?: string }[]).map((p) => p.text ?? '').join('');

const zeroUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

/** Wraps a real chat model (record) or stands in for one (replay). */
export class RecordingChatModel extends BaseChatModel {
  constructor(
    private readonly mode: Exclude<LlmMode, 'live'>,
    private readonly store: LlmRecordings,
    private readonly inner: BaseChatModel | null,
  ) {
    super({});
    if (mode === 'record' && !inner) throw new Error('record mode needs the real model');
  }

  _llmType(): string {
    return `recording-${this.mode}`;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const prompt = promptOf(messages);
    let text: string;
    if (this.mode === 'replay') text = this.store.get('text', prompt) as string;
    else {
      text = textOf(await this.inner!.invoke(messages));
      this.store.set('text', prompt, text);
    }
    return {
      generations: [{ text, message: new AIMessage({ content: text, usage_metadata: zeroUsage }) }],
    };
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const prompt = promptOf(messages);
    if (this.mode === 'record') {
      let text = '';
      for await (const chunk of await this.inner!.stream(messages, { signal: options.signal })) {
        const piece = textOf(chunk);
        text += piece;
        yield new ChatGenerationChunk({
          text: piece,
          message: new AIMessageChunk({ content: piece }),
        });
        await runManager?.handleLLMNewToken(piece);
      }
      this.store.set('stream', prompt, text);
      return;
    }
    const text = this.store.get('stream', prompt) as string;
    const pieces = text.match(/[\s\S]{1,24}/g) ?? [''];
    for (const [i, piece] of pieces.entries()) {
      yield new ChatGenerationChunk({
        text: piece,
        message: new AIMessageChunk({
          content: piece,
          ...(i === pieces.length - 1 && { usage_metadata: zeroUsage }),
        }),
      });
      await runManager?.handleLLMNewToken(piece);
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- matches BaseChatModel's overloaded signature */
  override withStructuredOutput(
    schema: any,
    config?: { includeRaw?: boolean; name?: string },
  ): any {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return RunnableLambda.from(async (input: BaseMessage[], runConfig) => {
      const prompt = promptOf(input);
      let parsed: unknown;
      if (this.mode === 'replay') parsed = this.store.get('structured', prompt);
      else {
        const result = (await this.inner!.withStructuredOutput(schema, {
          includeRaw: true,
          name: config?.name,
        }).invoke(input, runConfig)) as { parsed: unknown };
        parsed = result.parsed;
        this.store.set('structured', prompt, parsed);
      }
      const raw = new AIMessage({ content: JSON.stringify(parsed), usage_metadata: zeroUsage });
      return config?.includeRaw ? { raw, parsed } : parsed;
    });
  }
}

/** The chat handle for a mode: live as is; record/replay wrapped. */
export function recordedChatHandle(
  mode: Exclude<LlmMode, 'live'>,
  store: LlmRecordings,
  live: () => ChatHandle,
  identity: Pick<ChatHandle, 'provider' | 'modelId'>,
): ChatHandle {
  if (mode === 'replay')
    return { ...identity, model: new RecordingChatModel('replay', store, null) };
  const real = live();
  return { ...real, model: new RecordingChatModel('record', store, real.model) };
}

/** Query embeddings for a mode (replay never calls the provider). */
export function recordedEmbedQuery(
  mode: Exclude<LlmMode, 'live'>,
  store: LlmRecordings,
  live: (text: string) => Promise<number[]>,
): (text: string) => Promise<number[]> {
  return async (text) => {
    if (mode === 'replay') return store.get('embedding', text) as number[];
    const vector = await live(text);
    store.set('embedding', text, vector);
    return vector;
  };
}

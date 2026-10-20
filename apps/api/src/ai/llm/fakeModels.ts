// Deterministic fake chat and embedding models for unit and workflow tests.
// No network: tests never call a real provider.
import { createHash } from 'node:crypto';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { Embeddings } from '@langchain/core/embeddings';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ChatHandle } from './chatModel';

/** One scripted reply: text (usually JSON), or an error to throw. streamError fails a stream before its last chunk. */
export type FakeReply =
  | string
  | Error
  | { text: string; inputTokens?: number; outputTokens?: number; streamError?: Error }
  /** A provider that never answers: the call blocks until it is aborted (W4-09). */
  | { hang: true };

/** Blocks until the call's signal aborts (never resolves without one). */
const hangUntilAborted = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
  });

export interface FakeChatOptions {
  /** If true, withStructuredOutput works natively (parses the reply as JSON). */
  nativeStructured?: boolean;
}

export class FakeChatModel extends BaseChatModel {
  /** Messages received by each call, for assertions. */
  readonly calls: BaseMessage[][] = [];
  private readonly replies: FakeReply[];
  private readonly nativeStructured: boolean;

  constructor(replies: FakeReply[], options: FakeChatOptions = {}) {
    super({});
    this.replies = [...replies];
    this.nativeStructured = options.nativeStructured ?? false;
  }

  _llmType(): string {
    return 'fake';
  }

  private nextReply(messages: BaseMessage[]) {
    this.calls.push(messages);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('FakeChatModel: no scripted reply left');
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'object' && 'hang' in reply) return { hang: true as const };
    const {
      text,
      inputTokens = 100,
      outputTokens = 20,
      streamError,
    } = typeof reply === 'string' ? { text: reply, streamError: undefined } : reply;
    const usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };
    return { text, usage, streamError };
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const reply = this.nextReply(messages);
    if ('hang' in reply) return hangUntilAborted(options.signal);
    const { text, usage } = reply;
    const message = new AIMessage({ content: text, usage_metadata: usage });
    return { generations: [{ text, message }] };
  }

  /** Streams the reply in 12-character chunks; usage arrives on the last chunk. */
  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const reply = this.nextReply(messages);
    if ('hang' in reply) return void (await hangUntilAborted(options.signal));
    const { text, usage, streamError } = reply;
    const pieces = text.match(/[\s\S]{1,12}/g) ?? [''];
    for (const [i, piece] of pieces.entries()) {
      const last = i === pieces.length - 1;
      if (last && streamError) throw streamError;
      yield new ChatGenerationChunk({
        text: piece,
        message: new AIMessageChunk({
          content: piece,
          ...(last && { usage_metadata: usage }),
        }),
      });
      await runManager?.handleLLMNewToken(piece);
    }
  }

  // Native structured output for tests: the scripted reply is parsed as JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override withStructuredOutput(_schema: unknown, config?: { includeRaw?: boolean }): any {
    if (!this.nativeStructured) {
      throw new Error('withStructuredOutput is not implemented for this fake model');
    }
    return RunnableLambda.from(async (input: BaseMessage[], runConfig) => {
      const raw = (await this.invoke(input, runConfig)) as AIMessage;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw.content));
      } catch {
        parsed = undefined;
      }
      return config?.includeRaw ? { raw, parsed } : parsed;
    });
  }
}

export function fakeChatHandle(
  replies: FakeReply[],
  options: FakeChatOptions & { modelId?: string } = {},
): ChatHandle & { model: FakeChatModel } {
  return {
    model: new FakeChatModel(replies, options),
    provider: 'gemini',
    modelId: options.modelId ?? 'gemini-3.1-flash-lite',
  };
}

/**
 * Deterministic embeddings: the same text always maps to the same unit
 * vector, and texts sharing words get similar vectors (bag of hashed words).
 */
export class FakeEmbeddings extends Embeddings {
  readonly calls: string[][] = [];

  constructor(readonly dimension = 768) {
    super({});
  }

  private vector(text: string): number[] {
    const v = new Array<number>(this.dimension).fill(0);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      const h = createHash('sha256').update(word).digest();
      for (let i = 0; i < 4; i++) {
        const idx = h.readUInt32BE(i * 4) % this.dimension;
        v[idx]! += h[16 + i]! & 1 ? 1 : -1;
      }
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);
    return texts.map((t) => this.vector(t));
  }

  async embedQuery(text: string): Promise<number[]> {
    this.calls.push([text]);
    return this.vector(text);
  }
}

// Provider fallback chain for the running app (ADR-018): one chat model that
// tries an ordered list of real models and moves to the next only when a
// model is out of quota, out of credit, rejected or unreachable. Request
// problems (a schema the provider rejects, invalid output, timeouts) are not
// retried on another model, so invokeStructured's own fallbacks still apply.
// The model that answered is stamped on the reply (answeredBy) for traces and
// cost. Evals do not use this: they measure the configured model only.
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ChatHandle } from './chatModel';
import { cooldownFor, type ModelRef, type ProviderHealth } from './providerHealth';

export interface FallbackCandidate extends ModelRef {
  /** Built on first use, so a missing key or URL only matters when that model is reached. */
  model: () => BaseChatModel;
}

/** Told about every model that was set aside, for the server log. */
export type FallbackListener = (event: {
  from: ModelRef;
  reason: string;
  cooldownMs: number;
  next?: ModelRef;
}) => void;

const ANSWERED_BY = 'answeredBy';

/** The model that actually produced a reply, when it came through a fallback chain. */
export function answeredBy(message: unknown): ModelRef | undefined {
  const meta = (message as { response_metadata?: Record<string, unknown> } | undefined)
    ?.response_metadata;
  const ref = meta?.[ANSWERED_BY] as ModelRef | undefined;
  return ref && typeof ref.provider === 'string' && typeof ref.modelId === 'string'
    ? ref
    : undefined;
}

function stamp<M extends AIMessage>(message: M, ref: ModelRef): M {
  message.response_metadata = {
    ...message.response_metadata,
    [ANSWERED_BY]: { provider: ref.provider, modelId: ref.modelId },
  };
  return message;
}

export class FallbackChatModel extends BaseChatModel {
  private readonly built = new Map<FallbackCandidate, BaseChatModel>();

  constructor(
    private readonly candidates: readonly FallbackCandidate[],
    private readonly health: ProviderHealth,
    private readonly onFallback: FallbackListener = () => {},
  ) {
    super({});
    if (candidates.length === 0) throw new Error('FallbackChatModel needs at least one model');
  }

  _llmType(): string {
    return 'fallback';
  }

  private modelOf(candidate: FallbackCandidate): BaseChatModel {
    let model = this.built.get(candidate);
    if (!model) {
      model = candidate.model();
      this.built.set(candidate, model);
    }
    return model;
  }

  /** Runs `call` on each model in health order until one succeeds or fails for a non-fallback reason. */
  private async run<T>(
    call: (model: BaseChatModel) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; ref: FallbackCandidate }> {
    const ordered = this.health.order(this.candidates);
    const healthyAtStart = new Set(ordered.filter((c) => this.health.status(c).ms === 0));
    let lastError: unknown;
    for (const [i, candidate] of ordered.entries()) {
      // Set aside during this call (e.g. a 402 covers the provider's other models): skip it.
      if (healthyAtStart.has(candidate) && this.health.status(candidate).ms > 0) continue;
      try {
        const value = await call(this.modelOf(candidate));
        this.health.markUp(candidate);
        return { value, ref: candidate };
      } catch (err) {
        const cooldown = cooldownFor(err);
        if (!cooldown || signal?.aborted) throw err;
        this.health.markDown(candidate, cooldown);
        this.onFallback({
          from: candidate,
          reason: cooldown.reason,
          cooldownMs: cooldown.ms,
          next: ordered[i + 1],
        });
        lastError = err;
      }
    }
    throw lastError;
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
  ): Promise<ChatResult> {
    const { value, ref } = await this.run(
      (model) => model.invoke(messages, { signal: options.signal }),
      options.signal,
    );
    const message = stamp(value as AIMessage, ref);
    return { generations: [{ text: message.text, message }] };
  }

  /**
   * Falls back only until the first chunk arrives: once text has reached the
   * employee, a failure is the stream's error, not a reason to start over.
   */
  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const { value, ref } = await this.run(async (model) => {
      const iterator = (await model.stream(messages, { signal: options.signal }))[
        Symbol.asyncIterator
      ]();
      return { iterator, first: await iterator.next() };
    }, options.signal);
    const emit = async (chunk: AIMessageChunk, first: boolean) => {
      const message = first ? stamp(chunk, ref) : chunk;
      const text = typeof message.content === 'string' ? message.content : message.text;
      await runManager?.handleLLMNewToken(text);
      return new ChatGenerationChunk({ text, message });
    };
    const { iterator, first } = value;
    if (first.done) {
      yield await emit(new AIMessageChunk({ content: '' }), true);
      return;
    }
    yield await emit(first.value, true);
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      yield await emit(next.value, false);
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- matches BaseChatModel's overloaded signature */
  override withStructuredOutput(
    schema: any,
    config?: { includeRaw?: boolean; name?: string },
  ): any {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return RunnableLambda.from(async (input: BaseMessage[], runConfig) => {
      const { value, ref } = await this.run(
        (model) =>
          model
            .withStructuredOutput(schema, { includeRaw: true, name: config?.name })
            .invoke(input, runConfig) as Promise<{ raw?: AIMessage; parsed: unknown }>,
        runConfig?.signal,
      );
      const raw = stamp(value.raw ?? new AIMessage({ content: '' }), ref);
      return config?.includeRaw ? { raw, parsed: value.parsed } : value.parsed;
    });
  }
}

/**
 * A chat handle over the chain. Its provider and modelId name the first model
 * (what the tier is configured to use); answeredBy() on a reply names the one
 * that actually answered.
 */
export function fallbackChatHandle(
  candidates: readonly FallbackCandidate[],
  health: ProviderHealth,
  onFallback?: FallbackListener,
): ChatHandle {
  const [first] = candidates;
  if (!first) throw new Error('fallbackChatHandle needs at least one model');
  return {
    model: new FallbackChatModel(candidates, health, onFallback),
    provider: first.provider as ChatHandle['provider'],
    modelId: first.modelId,
  };
}

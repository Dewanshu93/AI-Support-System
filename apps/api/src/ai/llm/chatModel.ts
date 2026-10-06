// Chat model factory (playbook section 5): provider and tier come from
// config/models.yaml, so switching Gemini ↔ OpenRouter is config-only.
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type AIMessage, type BaseMessageLike, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { type ChatProvider, KEY_FOR, type LlmKeys, type ModelsConfig } from './keys';
import { callCostUsd, type CostTable, type TokenUsage } from './costTable';
import { LlmError } from './errors';
import { type CallPolicy, errorStatus, isProviderError, withCallPolicy } from './retry';

export { type ChatProvider, type LlmKeys, llmConfigured, type ModelsConfig } from './keys';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export type ModelTier = 'fast' | 'quality';

/** A chat model plus the identity recorded in traces and used for cost. */
export interface ChatHandle {
  model: BaseChatModel;
  provider: ChatProvider;
  modelId: string;
}

/** Which model ID a tier maps to for the configured (or given) provider. */
export function resolveChatModel(
  config: ModelsConfig,
  tier: ModelTier,
  provider: ChatProvider = config.chat.provider,
): { provider: ChatProvider; modelId: string } {
  return { provider, modelId: config.chat.models[provider][tier] };
}

export function createChatModel(
  config: ModelsConfig,
  keys: LlmKeys,
  tier: ModelTier,
  provider: ChatProvider = config.chat.provider,
  /** Sampling temperature (prompt frontmatter); default 0. */
  options: { temperature?: number } = {},
): ChatHandle {
  const temperature = options.temperature ?? 0;
  const { modelId } = resolveChatModel(config, tier, provider);
  const apiKey = keys[KEY_FOR[provider]];
  if (!apiKey) {
    throw new LlmError('config', `${KEY_FOR[provider]} is not set; cannot use ${provider} models`);
  }
  // maxRetries: 0 — retries and timeouts are applied once, by withCallPolicy.
  const maxTokens = config.call.maxOutputTokens;
  const model =
    provider === 'gemini'
      ? new ChatGoogleGenerativeAI({
          model: modelId,
          apiKey,
          temperature,
          maxRetries: 0,
          maxOutputTokens: maxTokens,
        })
      : new ChatOpenAI({
          model: modelId,
          apiKey,
          temperature,
          maxRetries: 0,
          maxTokens,
          configuration: {
            baseURL: OPENROUTER_BASE_URL,
            defaultHeaders: { 'X-Title': 'AI Service Desk Front Door' },
          },
        });
  return { model, provider, modelId };
}

export interface StructuredCallResult<T> {
  data: T;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  retries: number;
  provider: ChatProvider;
  modelId: string;
  /** `native`: provider structured output; `json_fallback`: plain call + JSON parsing. */
  mode: 'native' | 'json_fallback';
}

function usageOf(message: AIMessage | undefined): TokenUsage {
  return {
    inputTokens: message?.usage_metadata?.input_tokens ?? 0,
    outputTokens: message?.usage_metadata?.output_tokens ?? 0,
  };
}

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/** Pulls a JSON object out of model text, tolerating ```json fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

function messageText(message: AIMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((part) => (typeof part === 'string' ? part : 'text' in part ? String(part.text) : ''))
    .join('');
}

/**
 * Whether a native structured-output failure should try the JSON fallback:
 * yes for unsupported/unparseable output and for HTTP 400 (providers reject
 * some JSON Schema keywords, e.g. Gemini and `const`); no for timeouts, auth,
 * rate limits and server errors, which the fallback would hit too.
 */
function shouldFallBack(err: unknown): boolean {
  if (err instanceof LlmError) {
    if (err.kind === 'invalid_output') return true;
    return err.kind === 'provider' && errorStatus(err.cause) === 400;
  }
  return !isProviderError(err);
}

/**
 * Calls the model for output matching `schema`. Uses the provider's native
 * structured output first; if that is unsupported or returns something the
 * schema rejects, falls back once to a plain call with JSON instructions.
 * Provider/network failures are retried by the call policy and never fall back.
 */
export async function invokeStructured<S extends z.ZodType>(
  handle: ChatHandle,
  schema: S,
  messages: BaseMessageLike[],
  options: { policy: CallPolicy; costs: CostTable; name?: string },
): Promise<StructuredCallResult<z.output<S>>> {
  const started = performance.now();
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let retries = 0;
  const finish = (data: z.output<S>, mode: StructuredCallResult<unknown>['mode']) => ({
    data,
    usage,
    costUsd: callCostUsd(options.costs, handle.modelId, usage),
    latencyMs: Math.round(performance.now() - started),
    retries,
    provider: handle.provider,
    modelId: handle.modelId,
    mode,
  });

  try {
    const structured = handle.model.withStructuredOutput(schema, {
      includeRaw: true,
      name: options.name ?? 'output',
    });
    const { value, retries: r } = await withCallPolicy(
      (signal) => structured.invoke(messages, { signal }),
      options.policy,
    );
    retries += r;
    const result = value as { raw?: AIMessage; parsed?: unknown };
    usage = addUsage(usage, usageOf(result.raw));
    const parsed = schema.safeParse(result.parsed);
    if (parsed.success) return finish(parsed.data, 'native');
  } catch (err) {
    if (!shouldFallBack(err)) throw err;
    // Native structured output unsupported, rejected or unparseable: use the JSON fallback.
  }

  const instruction = new SystemMessage(
    `Respond with only a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(
      z.toJSONSchema(schema),
    )}`,
  );
  const { value: raw, retries: r } = await withCallPolicy(
    (signal) => handle.model.invoke([...messages, instruction], { signal }),
    options.policy,
  );
  retries += r;
  usage = addUsage(usage, usageOf(raw));
  let candidate: unknown;
  try {
    candidate = extractJson(messageText(raw));
  } catch (err) {
    throw new LlmError(
      'invalid_output',
      `Model output is not valid JSON: ${(err as Error).message}`,
      {
        cause: err,
      },
    );
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new LlmError(
      'invalid_output',
      `Model output does not match the schema: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return finish(parsed.data, 'json_fallback');
}

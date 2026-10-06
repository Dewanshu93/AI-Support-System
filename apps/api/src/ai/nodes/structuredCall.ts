// Node-level policy for structured LLM calls (playbook section 6): invalid
// output → one retry with the validation error appended; a second failure or
// any provider error → null, so the node applies its documented fallback.
// Every attempt is traced.
import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import type { LlmCallTrace } from '../graph/state';
import {
  type CallPolicy,
  type ChatHandle,
  type CostTable,
  invokeStructured,
  LlmError,
} from '../llm';
import type { LoadedPrompt } from '../prompts/registry';

export interface TraceError {
  node: string;
  code: string;
  message: string;
}

export interface StructuredCallOutcome<T> {
  /** null when both attempts failed or the provider failed: use the fallback. */
  data: T | null;
  llmCalls: LlmCallTrace[];
  errors: TraceError[];
}

export async function structuredCallWithRetry<S extends z.ZodType>(args: {
  node: string;
  prompt: LoadedPrompt;
  messages: BaseMessage[];
  schema: S;
  chat: ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
}): Promise<StructuredCallOutcome<z.output<S>>> {
  const { node, prompt, messages, schema, chat } = args;
  const llmCalls: LlmCallTrace[] = [];
  const errors: TraceError[] = [];
  let conversation = [...messages];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = performance.now();
    try {
      const result = await invokeStructured(chat, schema, conversation, {
        policy: args.policy,
        costs: args.costs,
        name: prompt.name,
      });
      llmCalls.push({
        node,
        promptRef: prompt.ref,
        provider: result.provider,
        model: result.modelId,
        latencyMs: result.latencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        retries: result.retries,
        mode: result.mode,
        costUsd: result.costUsd,
      });
      return { data: result.data, llmCalls, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      llmCalls.push({
        node,
        promptRef: prompt.ref,
        provider: chat.provider,
        model: chat.modelId,
        latencyMs: Math.round(performance.now() - started),
        retries: 0,
        mode: 'json_fallback',
        costUsd: 0,
        error: message,
      });
      errors.push({ node, code: err instanceof LlmError ? err.kind : 'unknown', message });
      const invalid = err instanceof LlmError && err.kind === 'invalid_output';
      if (!invalid) break;
      conversation = [
        ...messages,
        new HumanMessage(
          `Your previous reply was rejected: ${message}\nReply again with output that follows every rule.`,
        ),
      ];
    }
  }
  return { data: null, llmCalls, errors };
}

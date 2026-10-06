// answer (AI, P-3 grounded_answer, streamed; playbook sections 5 and 6). Writes
// the employee-facing answer from the labelled [S1]…[S5] context. Tokens reach
// the client through graph.streamEvents (W2-08); the trailing JSON block
// { uncovered } is parsed after the stream. Citations are checked next, by
// validateCitations. Failures before the first chunk are retried by the call
// policy; a failure mid-stream throws (error event, retryable by the user).
import type { AIMessageChunk, MessageContent } from '@langchain/core/messages';
import type { ContextSource, State, StateUpdate } from '../graph/state';
import {
  type CallPolicy,
  type ChatHandle,
  type CostTable,
  callCostUsd,
  LlmError,
  withCallPolicy,
  type ModelTier,
} from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { type AnswerMode, GroundedAnswerTrailerSchema } from '../schemas';
import { formatProfile } from './promptFormat';

export const ANSWER_TRAILER_INVALID = 'ANSWER_TRAILER_INVALID';
const NODE = 'answer';

export interface AnswerDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
}

/** The P-3 mode is chosen by code from the decision. */
export function answerMode(state: State): AnswerMode {
  const decision = state.decision;
  if (decision?.value === 'ESCALATE' && decision.reasonCode === 'SAFETY') return 'safety_steps';
  return decision?.value === 'PARTIAL' ? 'partial' : 'answer';
}

/** Sources for P-3: marker, title, section path and effective date, then the text. */
export function formatSources(context: ContextSource[]): string {
  if (context.length === 0) return '(no sources)';
  return context
    .map(
      (s) =>
        `[${s.marker}] ${s.docTitle} > ${s.sectionPath.join(' > ')} (effective ${s.effectiveDate.slice(0, 10)})\n${s.text}`,
    )
    .join('\n\n');
}

/**
 * Splits the streamed text into the prose and the trailing fenced JSON block.
 * An unclosed fence (cut-off stream) is dropped from the prose; trailer null.
 */
export function splitTrailer(text: string): { prose: string; trailer: unknown } {
  const fence = text.search(/```(?:json)?\s*\{[^`]*$|```(?:json)?\s*\{[\s\S]*```\s*$/);
  if (fence < 0) return { prose: text.trim(), trailer: null };
  const block = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text.slice(fence));
  let trailer: unknown = null;
  if (block) {
    try {
      trailer = JSON.parse(block[1]!);
    } catch {
      trailer = null;
    }
  }
  return { prose: text.slice(0, fence).trim(), trailer };
}

function contentText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (typeof part === 'string' ? part : 'text' in part ? String(part.text) : ''))
    .join('');
}

export function createAnswer(deps: AnswerDeps) {
  return async function answer(state: State): Promise<StateUpdate> {
    const mode = answerMode(state);
    const context = state.retrieval?.context ?? [];
    if (context.length === 0) {
      // Nothing to ground on: no LLM call; validateCitations withdraws.
      return { output: { text: '', mode, citations: [], uncovered: [], withdrawn: false } };
    }

    const { prompt, messages } = await deps.prompts.render('grounded_answer', {
      mode,
      profile: formatProfile(state.profile),
      question: state.analysis?.searchQuery ?? state.input.text,
      sources: formatSources(context),
    });
    const chat = deps.chatFor(prompt.modelTier, { temperature: prompt.temperature });
    const started = performance.now();
    let ttftMs: number | undefined;
    let text = '';
    let full: AIMessageChunk | undefined;
    const take = (chunk: AIMessageChunk) => {
      const piece = contentText(chunk.content);
      if (piece && ttftMs === undefined) ttftMs = Math.round(performance.now() - started);
      text += piece;
      full = full ? full.concat(chunk) : chunk;
    };
    // Opening the stream and its first chunk go through the call policy: a
    // failure there (e.g. 503 "high demand") is retried, because nothing has
    // reached the employee yet. A failure after the first chunk is not retried.
    let opened;
    try {
      opened = await withCallPolicy(async (signal) => {
        const whole = AbortSignal.any([signal, AbortSignal.timeout(deps.policy.timeoutMs)]);
        const iterator = (await chat.model.stream(messages, { signal: whole }))[
          Symbol.asyncIterator
        ]();
        return { iterator, first: await iterator.next() };
      }, deps.policy);
    } catch (err) {
      throw err instanceof LlmError
        ? new LlmError(err.kind, `answer stream failed: ${err.message}`, { cause: err })
        : err;
    }
    const retries = opened.retries;
    try {
      const { iterator, first } = opened.value;
      if (!first.done) take(first.value);
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        take(next.value);
      }
    } catch (err) {
      const timedOut =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new LlmError(
        timedOut ? 'timeout' : 'provider',
        `answer stream failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    const usage = {
      inputTokens: full?.usage_metadata?.input_tokens ?? 0,
      outputTokens: full?.usage_metadata?.output_tokens ?? 0,
    };
    const { prose, trailer } = splitTrailer(text);
    const parsed = GroundedAnswerTrailerSchema.safeParse(trailer);
    return {
      output: {
        text: prose,
        mode,
        citations: [],
        uncovered: parsed.success ? parsed.data.uncovered : [],
        withdrawn: false,
      },
      trace: {
        llmCalls: [
          {
            node: NODE,
            promptRef: prompt.ref,
            model: chat.modelId,
            latencyMs: Math.round(performance.now() - started),
            ttftMs,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            retries,
            mode: 'native',
            costUsd: callCostUsd(deps.costs, chat.modelId, usage),
          },
        ],
        flags: parsed.success ? [] : [ANSWER_TRAILER_INVALID],
      },
    };
  };
}

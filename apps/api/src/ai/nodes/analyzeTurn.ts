// analyzeTurn (AI, P-1 turn_analysis; playbook sections 5 and 6). Understands
// the turn and writes a standalone search query. Invalid output → one retry
// with the validation error appended → documented fallback (ANALYSIS_FALLBACK).
// Provider failures (already retried by the call policy) go straight to the fallback.
import { HumanMessage } from '@langchain/core/messages';
import type { ConfigFiles } from '../../config/schemas';
import type { HistoryMessage, LlmCallTrace, Profile, State, StateUpdate } from '../graph/state';
import {
  type CallPolicy,
  type ChatHandle,
  type CostTable,
  invokeStructured,
  LlmError,
  type ModelTier,
} from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { type TurnAnalysis, turnAnalysisSchema } from '../schemas';

export const ANALYSIS_FALLBACK = 'ANALYSIS_FALLBACK';
const NODE = 'analyzeTurn';

export interface AnalyzeTurnDeps {
  prompts: PromptRegistry;
  /** Chat model for a tier (the prompt's frontmatter picks the tier). */
  chatFor: (tier: ModelTier) => ChatHandle;
  taxonomy: ConfigFiles['taxonomy'];
  policy: CallPolicy;
  costs: CostTable;
}

/** Section 5 fallback: treat the turn as a plain question searched with the raw text. */
export function fallbackAnalysis(text: string): TurnAnalysis {
  return {
    intent: 'question',
    domain: 'unknown',
    category: 'none',
    urgency: 'medium',
    urgencyReason: 'analysis unavailable (fallback)',
    sensitivity: 'none',
    ambiguity: 'low',
    searchQuery: text.trim().split(/\s+/).slice(0, 30).join(' '),
  };
}

export function formatTaxonomy(taxonomy: ConfigFiles['taxonomy']): string {
  return taxonomy.categories
    .map(
      (c) => `- ${c.id} (${c.domain}, ${c.label}): ${c.subcategories.map((s) => s.id).join(', ')}`,
    )
    .join('\n');
}

/** Profile summary for prompts: no name, email or IDs. */
export function formatProfile(profile: Profile | null): string {
  if (!profile) return 'unknown';
  return `country ${profile.country}; employment type ${profile.employmentType}; department ${profile.department}`;
}

export function formatHistory(history: HistoryMessage[]): string {
  if (history.length === 0) return '(no earlier messages)';
  return history.map((m) => `${m.role}: ${m.content}`).join('\n');
}

export function createAnalyzeTurn(deps: AnalyzeTurnDeps) {
  const schema = turnAnalysisSchema({ taxonomy: deps.taxonomy });
  const taxonomyText = formatTaxonomy(deps.taxonomy);

  return async function analyzeTurn(state: State): Promise<StateUpdate> {
    const { prompt, messages } = await deps.prompts.render('turn_analysis', {
      taxonomy: taxonomyText,
      profile: formatProfile(state.profile),
      history: formatHistory(state.history),
      message: state.input.text,
    });
    const chat = deps.chatFor(prompt.modelTier);
    const llmCalls: LlmCallTrace[] = [];
    const errors: { node: string; code: string; message: string }[] = [];
    let conversation = [...messages];

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = performance.now();
      try {
        const result = await invokeStructured(chat, schema, conversation, {
          policy: deps.policy,
          costs: deps.costs,
          name: 'turn_analysis',
        });
        llmCalls.push({
          node: NODE,
          promptRef: prompt.ref,
          model: result.modelId,
          latencyMs: result.latencyMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          retries: result.retries,
          mode: result.mode,
          costUsd: result.costUsd,
        });
        return {
          analysis: result.data,
          trace: { llmCalls, errors, outputs: { analysis: result.data } },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const invalid = err instanceof LlmError && err.kind === 'invalid_output';
        llmCalls.push({
          node: NODE,
          promptRef: prompt.ref,
          model: chat.modelId,
          latencyMs: Math.round(performance.now() - started),
          retries: 0,
          mode: 'json_fallback',
          costUsd: 0,
          error: message,
        });
        errors.push({
          node: NODE,
          code: err instanceof LlmError ? err.kind : 'unknown',
          message,
        });
        if (!invalid) break;
        conversation = [
          ...messages,
          new HumanMessage(
            `Your previous reply was rejected: ${message}\nReply again with output that follows every rule.`,
          ),
        ];
      }
    }

    const analysis = fallbackAnalysis(state.input.text);
    return {
      analysis,
      trace: { llmCalls, errors, outputs: { analysis }, flags: [ANALYSIS_FALLBACK] },
    };
  };
}

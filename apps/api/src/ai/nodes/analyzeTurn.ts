// analyzeTurn (AI, P-1 turn_analysis; playbook sections 5 and 6). Understands
// the turn and writes a standalone search query. Invalid output → one retry
// with the validation error appended → documented fallback (ANALYSIS_FALLBACK).
// Provider failures (already retried by the call policy) go straight to the fallback.
import type { ConfigFiles } from '../../config/schemas';
import type { State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { type TurnAnalysis, turnAnalysisSchema } from '../schemas';
import { formatHistory, formatProfile } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';

export { formatHistory, formatProfile } from './promptFormat';

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
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema,
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });
    if (data) {
      return { analysis: data, trace: { llmCalls, errors, outputs: { analysis: data } } };
    }
    const analysis = fallbackAnalysis(state.input.text);
    return {
      analysis,
      trace: { llmCalls, errors, outputs: { analysis }, flags: [ANALYSIS_FALLBACK] },
    };
  };
}

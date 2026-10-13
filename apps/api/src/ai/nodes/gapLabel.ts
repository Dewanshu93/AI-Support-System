// Knowledge-gap cluster label (AI, P-8 gap_cluster_label; W4-02). Outside the
// turn graph: an admin refresh asks for one label per cluster. On failure the
// label is the fixed fallback, so a refresh never fails for want of a name.
// modules/gaps calls this through an injected function (CLAUDE.md boundaries).
import type { TurnTraceDoc } from '../../db/schemas';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { GapClusterLabelSchema } from '../schemas';
import { llmCallDoc } from './persist';
import { structuredCallWithRetry } from './structuredCall';

export const UNLABELLED_CLUSTER = 'Unlabelled cluster';

export interface GapLabelOutcome {
  label: string;
  domain: 'IT' | 'HR' | 'unknown';
  /** False when the fallback label was used. */
  labelled: boolean;
  /** The last attempt, for the snapshot's trace entry. */
  llmCall?: TurnTraceDoc['llmCalls'][number];
}

/** Example questions (already redacted) → a name for the missing topic. */
export type GapLabelFn = (questions: string[]) => Promise<GapLabelOutcome>;

export interface GapLabelDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
}

export function formatGapQuestions(questions: string[]): string {
  return questions.map((q, i) => `${i + 1}. ${q.replace(/\s+/g, ' ').trim()}`).join('\n');
}

export function createGapLabeler(deps: GapLabelDeps): GapLabelFn {
  return async (questions) => {
    const { prompt, messages } = await deps.prompts.render('gap_cluster_label', {
      questions: formatGapQuestions(questions),
    });
    const { data, llmCalls } = await structuredCallWithRetry({
      node: 'gapLabel',
      prompt,
      messages,
      schema: GapClusterLabelSchema,
      chat: deps.chatFor(prompt.modelTier, { temperature: prompt.temperature }),
      policy: deps.policy,
      costs: deps.costs,
    });
    const last = llmCalls.at(-1);
    const llmCall = last ? llmCallDoc(last) : undefined;
    return data
      ? { label: data.label, domain: data.domain, labelled: true, llmCall }
      : { label: UNLABELLED_CLUSTER, domain: 'unknown', labelled: false, llmCall };
  };
}

// clarify (AI, P-4 clarifying_question in ambiguity mode; playbook sections 5
// and 6). Asks one targeted question. Invalid output → one retry → the
// templated generic question (CLARIFY_FALLBACK); never fails the turn.
import type { ConfigFiles } from '../../config/schemas';
import { fillTemplate } from '../../domain/templates';
import type { State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { ClarifyingQuestionSchema } from '../schemas';
import { formatProfile, languageVariable } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';

export const CLARIFY_FALLBACK = 'CLARIFY_FALLBACK';
const NODE = 'clarify';

export interface ClarifyDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  templates: ConfigFiles['templates']['templates'];
}

export function createClarify(deps: ClarifyDeps) {
  return async function clarify(state: State): Promise<StateUpdate> {
    const reason =
      state.analysis?.ambiguityReason?.trim() || 'The request is too vague to search or act on.';
    const { prompt, messages } = await deps.prompts.render('clarifying_question', {
      mode: 'ambiguity',
      profile: formatProfile(state.profile),
      question: state.input.text,
      needed: reason,
      ...languageVariable(deps.prompts, 'clarifying_question', state),
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema: ClarifyingQuestionSchema,
      chat: deps.chatFor(prompt.modelTier, { temperature: prompt.temperature }),
      policy: deps.policy,
      costs: deps.costs,
    });
    const text = data?.question ?? fillTemplate(deps.templates.clarify_generic);
    return {
      output: { text, citations: [], uncovered: [], withdrawn: false },
      trace: {
        llmCalls,
        errors,
        flags: data ? [] : [CLARIFY_FALLBACK],
        outputs: { clarify: { question: text, reason, fallback: !data } },
      },
    };
  };
}

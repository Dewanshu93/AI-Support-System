// clarifyForTicket (AI, P-4 clarifying_question in ticket_fields mode; playbook
// section 5). Asks for at most 2 missing required fields in one question; the
// edge allows at most 2 rounds. Failure → a templated question listing them. In
// safety mode the question follows the safety steps; it never replaces them.
import type { ConfigFiles } from '../../config/schemas';
import { fillTemplate } from '../../domain/templates';
import { fieldsFor } from '../../domain/ticketSchemas';
import type { State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { ClarifyingQuestionSchema } from '../schemas';
import { formatProfile } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';

export const TICKET_CLARIFY_FALLBACK = 'TICKET_CLARIFY_FALLBACK';
const NODE = 'clarifyForTicket';
/** Fields asked per question (playbook P-4: at most 2). */
export const FIELDS_PER_QUESTION = 2;

export interface ClarifyForTicketDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
  templates: ConfigFiles['templates']['templates'];
}

export function createClarifyForTicket(deps: ClarifyForTicketDeps) {
  return async function clarifyForTicket(state: State): Promise<StateUpdate> {
    const flow = state.ticketFlow;
    const all = fieldsFor(deps.ticketSchemas, flow.category!);
    const asking = flow.requiredMissing
      .slice(0, FIELDS_PER_QUESTION)
      .map((key) => all.find((f) => f.key === key)!)
      .filter(Boolean);

    const { prompt, messages } = await deps.prompts.render('clarifying_question', {
      mode: 'ticket_fields',
      profile: formatProfile(state.profile),
      question: state.input.text,
      needed: asking.map((f) => `${f.key}: ${f.description}`).join('\n'),
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
    const question =
      data?.question ??
      fillTemplate(deps.templates.ticket_fields_question, {
        fields: asking.map((f) => f.description.toLowerCase()).join(' and '),
      });
    // Only keys that were actually missing count as asked.
    const fieldsAsked = (data?.fieldsAsked ?? asking.map((f) => f.key)).filter((k) =>
      asking.some((f) => f.key === k),
    );

    const safety = state.output?.mode === 'safety_steps' && !state.output.withdrawn;
    return {
      ticketFlow: { ...flow, clarifyRounds: flow.clarifyRounds + 1 },
      output: safety
        ? { ...state.output!, text: `${state.output!.text}\n\n${question}` }
        : { text: question, citations: [], uncovered: [], withdrawn: false },
      trace: {
        llmCalls,
        errors,
        flags: data ? [] : [TICKET_CLARIFY_FALLBACK],
        outputs: { clarifyForTicket: { question, fieldsAsked, round: flow.clarifyRounds + 1 } },
      },
    };
  };
}

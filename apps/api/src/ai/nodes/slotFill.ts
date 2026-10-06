// slotFill (AI, P-5 ticket_slot_fill; playbook sections 5 and 6). Extracts the
// ticket from the whole conversation. Code keeps the category stable once
// chosen, merges known values across turns, normalises fields to the category
// schema and decides what is still missing (domain/ticketSchemas). Failure →
// template fallback (all unknown, redacted transcript as the description).
import type { ConfigFiles } from '../../config/schemas';
import { normaliseFields, requiredMissing, UNKNOWN } from '../../domain/ticketSchemas';
import type { State, StateUpdate, TicketExtraction } from '../graph/state';
import { redactPII } from '../guards/redaction';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { slotFillSchema } from '../schemas';
import { formatTaxonomy } from './analyzeTurn';
import { formatConversation, formatFieldSchemas, formatProfile } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';

export const SLOT_FILL_FALLBACK = 'SLOT_FILL_FALLBACK';
const NODE = 'slotFill';

export interface SlotFillDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  taxonomy: ConfigFiles['taxonomy'];
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
}

const words = (text: string, max: number) => text.trim().split(/\s+/).slice(0, max).join(' ');

/**
 * Category when the model gives none: the analysis category, else a general
 * category of the domain (HR → policy, otherwise software).
 */
export function defaultCategory(state: State): string {
  const category = state.analysis?.category;
  if (category && category !== 'none') return category;
  return state.analysis?.domain === 'HR' ? 'policy' : 'software';
}

/** Template extraction when P-5 fails: nothing invented, redacted transcript as description. */
export function fallbackExtraction(state: State): TicketExtraction {
  const userTurns = [
    ...state.history.filter((m) => m.role === 'user').map((m) => m.content),
    state.input.text,
  ];
  return {
    subcategory: state.analysis?.subcategory ?? null,
    urgency: state.analysis?.urgency ?? 'medium',
    urgencyReason: state.analysis?.urgencyReason ?? 'not assessed',
    impactScope: 'unknown',
    summary: words(redactPII(userTurns[0]!), 15),
    description: words(redactPII(userTurns.join(' / ')), 120),
    alreadyTried: [],
    errorMessages: [],
    fromModel: false,
  };
}

export function createSlotFill(deps: SlotFillDeps) {
  const schema = slotFillSchema({ taxonomy: deps.taxonomy });
  const taxonomyText = formatTaxonomy(deps.taxonomy);
  const fieldSchemas = formatFieldSchemas(deps.ticketSchemas);

  return async function slotFill(state: State): Promise<StateUpdate> {
    const flow = state.ticketFlow;
    const a = state.analysis;
    const { prompt, messages } = await deps.prompts.render('ticket_slot_fill', {
      taxonomy: taxonomyText,
      fieldSchemas,
      profile: formatProfile(state.profile),
      analysis: a
        ? `domain ${a.domain}; category ${a.category}${a.subcategory ? `/${a.subcategory}` : ''}; urgency ${a.urgency}`
        : 'not available',
      conversation: formatConversation(state.history, state.input.text),
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema,
      chat: deps.chatFor(prompt.modelTier, { temperature: prompt.temperature }),
      policy: deps.policy,
      costs: deps.costs,
    });

    // The category is chosen once per ticket flow and then kept.
    const category = flow.category ?? data?.category ?? defaultCategory(state);
    // Known values from earlier turns stay unless the employee gave a new one.
    const merged = { ...flow.fields };
    for (const [key, value] of Object.entries(data?.fields ?? {})) {
      if (value.trim() && value.trim().toLowerCase() !== UNKNOWN) merged[key] = value;
    }
    const fields = normaliseFields(deps.ticketSchemas, category, merged);
    const missing = requiredMissing(deps.ticketSchemas, category, fields);

    const extraction: TicketExtraction = data
      ? {
          subcategory: data.category === category ? (data.subcategory ?? null) : null,
          urgency: data.urgency,
          urgencyReason: data.urgencyReason,
          impactScope: data.impactScope,
          summary: data.summary,
          description: data.description,
          alreadyTried: data.alreadyTried,
          errorMessages: data.errorMessages,
          fromModel: true,
        }
      : flow.extraction?.fromModel
        ? flow.extraction
        : fallbackExtraction(state);

    return {
      ticketFlow: {
        ...flow,
        active: true,
        category,
        fields,
        requiredMissing: missing,
        extraction,
        matchedRules: [
          ...new Set([...(flow.matchedRules ?? []), ...(state.precheckResult?.matchedRules ?? [])]),
        ],
      },
      trace: {
        llmCalls,
        errors,
        flags: data ? [] : [SLOT_FILL_FALLBACK],
        outputs: {
          slotFill: {
            category,
            fields,
            requiredMissing: missing,
            modelRequiredMissing: data?.requiredMissing ?? null,
            fallback: !data,
          },
        },
      },
    };
  };
}

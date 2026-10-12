// agentSummary (AI, P-6 agent_ticket_summary; W3-06, playbook section 5). Runs
// once after a ticket is created (createTicket → sendEmail → agentSummary) and
// prepares it for the agent: a headline, a brief and up to three first checks.
// The ticket's summary stays the one the employee confirmed (ADR-019).
// Never fails the confirm: a model failure keeps the employee's description as
// the brief and marks the ticket `fallback`. Confidential cases get no AI
// (Build Contract v2.0 rule E.6): `skipped`. The transcript is redacted.
import type { TicketDoc } from '../../db/schemas';
import type { TicketsRepository } from '../../modules/tickets/repository';
import { redactPII } from '../guards/redaction';
import type { State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { AgentSummaryResultSchema } from '../schemas';
import { formatConversation } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';

const NODE = 'agentSummary';
export const AGENT_SUMMARY_FALLBACK = 'AGENT_SUMMARY_FALLBACK';

export interface AgentSummaryDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  tickets: Pick<TicketsRepository, 'findById' | 'setAgentAssist'>;
}

/** The ticket as the model sees it: classification and fields, no requester identity. */
export function formatTicketForSummary(ticket: TicketDoc, description: string): string {
  const fields = Object.entries(ticket.fields)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  return [
    `Category: ${ticket.category}${ticket.subcategory ? ` / ${ticket.subcategory}` : ''}`,
    `Queue: ${ticket.queue}; priority: ${ticket.priority}`,
    `Summary (confirmed by the employee): ${ticket.summary}`,
    `Description: ${description}`,
    fields ? `Fields:\n${fields}` : 'Fields: (none)',
  ].join('\n');
}

/** Default for graphs built without a model (structure tests): leaves the ticket as created. */
export function agentSummary(_state: State): StateUpdate {
  return {};
}

export function createAgentSummary(deps: AgentSummaryDeps) {
  return async function agentSummary(state: State): Promise<StateUpdate> {
    const ticketId = state.output?.ticketId;
    const draft = state.output?.draft;
    if (!ticketId || !draft) return {};
    const ticket = await deps.tickets.findById(ticketId);
    // Only the ticket this conversation created: a "same issue" link keeps the existing
    // ticket's brief, and a retried confirm does not summarise twice.
    if (
      !ticket ||
      ticket.agentAssist ||
      ticket.conversationId.toHexString() !== state.input.conversationId
    ) {
      return {};
    }
    if (ticket.restricted) {
      await deps.tickets.setAgentAssist(ticket._id, {
        agentBrief: ticket.agentBrief,
        agentAssist: { status: 'skipped', headline: null, firstChecks: [], promptRef: null },
      });
      return { trace: { outputs: { agentSummary: { status: 'skipped' } } } };
    }

    const { prompt, messages } = await deps.prompts.render('agent_ticket_summary', {
      ticket: redactPII(formatTicketForSummary(ticket, draft.description)),
      conversation: redactPII(formatConversation(state.history, state.input.text)),
      articles:
        ticket.articlesShown.map((a) => `- ${a.docTitle}`).join('\n') || '(no articles shown)',
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema: AgentSummaryResultSchema,
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });

    if (!data) {
      await deps.tickets.setAgentAssist(ticket._id, {
        agentBrief: draft.description,
        agentAssist: { status: 'fallback', headline: null, firstChecks: [], promptRef: prompt.ref },
      });
      return {
        trace: {
          llmCalls,
          errors,
          flags: [AGENT_SUMMARY_FALLBACK],
          outputs: { agentSummary: { status: 'fallback' } },
        },
      };
    }
    await deps.tickets.setAgentAssist(ticket._id, {
      agentBrief: data.agentBrief,
      agentAssist: {
        status: 'generated',
        headline: data.summary,
        firstChecks: data.suggestedFirstChecks,
        promptRef: prompt.ref,
      },
    });
    return {
      trace: {
        llmCalls,
        errors,
        outputs: {
          agentSummary: { status: 'generated', firstChecks: data.suggestedFirstChecks.length },
        },
      },
    };
  };
}

// buildDraft (code; playbook section 5): the TicketDraft the employee reviews.
// Queue and priority come from the domain rules (routing, priority floors), never
// from AI output; unknown fields stay "unknown". Cannot fail on valid state.
import { type TicketDraft, TicketDraftSchema } from '@sd/shared';
import type { ConfigFiles } from '../../config/schemas';
import { applyPriorityFloor } from '../../domain/priorityFloors';
import { routeTicket } from '../../domain/routing';
import { fillTemplate } from '../../domain/templates';
import { requiredMissing, UNKNOWN } from '../../domain/ticketSchemas';
import type { State, StateUpdate } from '../graph/state';
import { fallbackExtraction } from './slotFill';

export interface BuildDraftDeps {
  routing: ConfigFiles['routing'];
  priorityRules: ConfigFiles['priorityRules'];
  ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
  templates: ConfigFiles['templates']['templates'];
}

export function createBuildDraft(deps: BuildDraftDeps) {
  return function buildDraft(state: State): StateUpdate {
    const flow = state.ticketFlow;
    const category = flow.category!;
    const queue = routeTicket(deps.routing, { category, restricted: false });
    const extraction = flow.extraction ?? fallbackExtraction(state);
    const { priority, floorApplied } = applyPriorityFloor(
      {
        aiUrgency: extraction.urgency,
        matchedRules: [...(flow.matchedRules ?? []), ...(state.precheckResult?.matchedRules ?? [])],
        impactScope: extraction.impactScope,
      },
      deps.priorityRules.floors,
    );
    const citations = state.output?.citations ?? [];
    const articlesShown = [
      ...new Map(citations.map((c) => [c.documentId, c.docTitle])).entries(),
    ].map(([documentId, docTitle]) => ({ documentId, docTitle }));

    const draft: TicketDraft = TicketDraftSchema.parse({
      domain: queue.domain,
      category,
      subcategory: extraction.subcategory,
      queue: { id: queue.id, label: queue.label },
      priority,
      aiUrgency: extraction.urgency,
      priorityFloorApplied: floorApplied,
      impactScope: extraction.impactScope,
      summary: extraction.summary,
      description: extraction.description,
      alreadyTried: extraction.alreadyTried,
      errorMessages: extraction.errorMessages,
      fields: flow.fields,
      aiFilledFields: Object.entries(flow.fields)
        .filter(([, v]) => v !== UNKNOWN)
        .map(([k]) => k),
      requiredMissing: requiredMissing(deps.ticketSchemas, category, flow.fields),
      articlesShown,
      restricted: false,
    });

    const ready = fillTemplate(deps.templates.ticket_draft_ready, { queueLabel: queue.label });
    const safety = state.output?.mode === 'safety_steps' && !state.output.withdrawn;
    return {
      ticketFlow: { ...flow, requiredMissing: draft.requiredMissing },
      output: safety
        ? { ...state.output!, text: `${state.output!.text}\n\n${ready}`, draft }
        : { text: ready, citations: [], uncovered: [], withdrawn: false, draft },
      trace: {
        outputs: {
          buildDraft: {
            queue: queue.id,
            priority,
            floorApplied,
            requiredMissing: draft.requiredMissing,
          },
        },
      },
    };
  };
}

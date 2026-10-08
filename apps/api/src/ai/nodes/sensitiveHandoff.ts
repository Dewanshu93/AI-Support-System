// sensitiveHandoff (code, template; playbook section 5). No AI advice, no
// field extraction and never any retrieved policy text: the reply is built from
// templates only, shows a human contact and ends with "Would you like HR to
// contact you privately?". It also attaches a restricted draft (hr_case,
// template summary, no transcript), so the graph pauses for that one-click
// "Yes": the confirm endpoint creates the restricted case (W3-03).
import type { TicketDraft } from '@sd/shared';
import type { ConfigFiles } from '../../config/schemas';
import { restrictedCasePriority } from '../../domain/priorityFloors';
import { routeTicket } from '../../domain/routing';
import { fillTemplate } from '../../domain/templates';
import type { State, StateUpdate } from '../graph/state';

/** The confidential HR category (routing.yaml routes it to the sensitive queue). */
export const RESTRICTED_CATEGORY = 'employee_relations';

export interface SensitiveHandoffDeps {
  templates: ConfigFiles['templates']['templates'];
  routing: ConfigFiles['routing'];
}

export function restrictedDraft(deps: SensitiveHandoffDeps, matchedRules: string[]): TicketDraft {
  const queue = routeTicket(deps.routing, { category: RESTRICTED_CATEGORY, restricted: true });
  const priority = restrictedCasePriority(matchedRules);
  return {
    domain: 'HR',
    category: RESTRICTED_CATEGORY,
    subcategory: null,
    queue: { id: queue.id, label: queue.label },
    priority,
    aiUrgency: priority,
    priorityFloorApplied: null,
    impactScope: 'unknown',
    summary: fillTemplate(deps.templates.restricted_case_summary),
    description: fillTemplate(deps.templates.restricted_case_description),
    alreadyTried: [],
    errorMessages: [],
    fields: {},
    aiFilledFields: [],
    requiredMissing: [],
    articlesShown: [],
    restricted: true,
    recordFilledFields: [],
  };
}

export function createSensitiveHandoff(deps: SensitiveHandoffDeps) {
  return function sensitiveHandoff(state: State): StateUpdate {
    const contact = fillTemplate(deps.templates.sensitive_contact);
    const matchedRules = state.precheckResult?.matchedRules ?? [];
    return {
      output: {
        text: fillTemplate(deps.templates.sensitive_handoff, { contact }),
        citations: [],
        uncovered: [],
        withdrawn: false,
        handoff: { kind: 'sensitive', contact, offerPrivateContact: true },
        draft: restrictedDraft(deps, matchedRules),
      },
      trace: {
        outputs: {
          handoff: {
            kind: 'sensitive',
            matchedRules,
            byAnalysis: state.analysis?.sensitivity === 'sensitive',
          },
        },
      },
    };
  };
}

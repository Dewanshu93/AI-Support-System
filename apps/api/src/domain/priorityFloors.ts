// Priority floors (playbook W3-01): the AI proposes an urgency; code raises it
// to the floor of every rule that applies (config/priority-rules.yaml). Safety
// rules apply when the precheck matched them (e.g. a swollen battery → critical);
// impact rules apply to the stated impact scope. Pure.
import { type Priority, PRIORITIES } from '@sd/shared';
import type { ConfigFiles } from '../config/schemas';

type Floors = ConfigFiles['priorityRules']['floors'];

export interface PriorityInput {
  aiUrgency: Priority;
  /** Rule IDs the precheck matched (sensitive and safety rules). */
  matchedRules: string[];
  impactScope: 'me' | 'team' | 'org' | 'unknown';
}

export interface PriorityOutcome {
  priority: Priority;
  /** The rule that raised the priority, or null when the AI urgency already met every floor. */
  floorApplied: string | null;
}

const rank = (p: Priority) => PRIORITIES.indexOf(p);

export function applyPriorityFloor(input: PriorityInput, floors: Floors): PriorityOutcome {
  let priority = input.aiUrgency;
  let floorApplied: string | null = null;
  for (const rule of floors) {
    const applies =
      rule.kind === 'safety'
        ? input.matchedRules.includes(rule.id)
        : rule.impactScope === input.impactScope;
    if (applies && rank(rule.floor) > rank(priority)) {
      priority = rule.floor;
      floorApplied = rule.id;
    }
  }
  return { priority, floorApplied };
}

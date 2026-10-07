// Agent ticket rules (playbook section 4: Agent; W3-05). Pure.
// - Agents see tickets whose queue is one of theirs; restricted (sensitive) cases
//   only with the confidential HR queue; admins see every queue.
// - Classification corrections: taxonomy-checked, one change per field, and a
//   category change re-routes the queue. Restricted cases keep their category,
//   so they never leave the confidential queue.
import { PRIORITIES, type Priority, type Role } from '@sd/shared';
import type { ConfigFiles } from '../config/schemas';
import { routeTicket } from './routing';

type Taxonomy = ConfigFiles['taxonomy'];
type Routing = ConfigFiles['routing'];

export interface Viewer {
  role: Role;
  queues: readonly string[];
}

export function canSeeTicket(
  viewer: Viewer,
  ticket: { queue: string; restricted: boolean },
  sensitiveQueue: string,
): boolean {
  if (viewer.role === 'admin') return true;
  if (viewer.role !== 'agent' || !viewer.queues.includes(ticket.queue)) return false;
  return !ticket.restricted || viewer.queues.includes(sensitiveQueue);
}

/**
 * The queues a list request covers: null = every queue (admin, no filter);
 * 'forbidden' when an agent asks for a queue that is not theirs.
 */
export function queueScope(
  viewer: Viewer,
  requested: string | undefined,
): readonly string[] | null | 'forbidden' {
  if (viewer.role === 'admin') return requested ? [requested] : null;
  if (requested) return viewer.queues.includes(requested) ? [requested] : 'forbidden';
  return viewer.queues;
}

/** Severity order for "priority desc" (critical = 3). */
export const priorityRank = (priority: Priority): number => PRIORITIES.indexOf(priority);

export interface Classification {
  category: string;
  subcategory: string | null;
  priority: Priority;
}

export interface ClassificationChange {
  field: 'category' | 'subcategory' | 'priority';
  oldValue: string | null;
  newValue: string | null;
}

export type ClassificationResult =
  | {
      ok: true;
      next: Classification & { queue: string; domain: 'IT' | 'HR' };
      changes: ClassificationChange[];
      /** The queue changed because the category did. */
      rerouted: boolean;
    }
  | { ok: false; reason: 'unknown_category' | 'unknown_subcategory' | 'restricted_category' };

export function applyClassification(
  config: { taxonomy: Taxonomy; routing: Routing },
  current: Classification & { queue: string; domain: 'IT' | 'HR'; restricted: boolean },
  request: { category?: string; subcategory?: string | null; priority?: Priority },
): ClassificationResult {
  const category = request.category ?? current.category;
  const categoryChanged = category !== current.category;
  if (categoryChanged && current.restricted) return { ok: false, reason: 'restricted_category' };
  const entry = config.taxonomy.categories.find((c) => c.id === category);
  if (!entry) return { ok: false, reason: 'unknown_category' };

  // A new category drops a subcategory that belongs to the old one.
  const subcategory =
    request.subcategory !== undefined
      ? request.subcategory
      : categoryChanged
        ? null
        : current.subcategory;
  if (subcategory !== null && !entry.subcategories.some((s) => s.id === subcategory)) {
    return { ok: false, reason: 'unknown_subcategory' };
  }
  const priority = request.priority ?? current.priority;

  const changes: ClassificationChange[] = [];
  if (categoryChanged)
    changes.push({ field: 'category', oldValue: current.category, newValue: category });
  if (subcategory !== current.subcategory)
    changes.push({ field: 'subcategory', oldValue: current.subcategory, newValue: subcategory });
  if (priority !== current.priority)
    changes.push({ field: 'priority', oldValue: current.priority, newValue: priority });

  const routed = categoryChanged
    ? routeTicket(config.routing, { category, restricted: current.restricted })
    : { id: current.queue, domain: current.domain };
  return {
    ok: true,
    next: { category, subcategory, priority, queue: routed.id, domain: routed.domain },
    changes,
    rerouted: routed.id !== current.queue,
  };
}

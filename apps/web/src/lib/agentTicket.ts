// Agent workspace logic (W3-07), pure: labels for the workflow statuses agents
// work with, and the classification change an edit amounts to. Which statuses
// are allowed and which categories exist come from the API (code-owned rules).
import type { AgentClassificationRequest, Priority, TicketStatus } from '@sd/shared';

/** Agents see the workflow statuses (employees see stage labels instead). */
export const AGENT_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting_on_employee: 'Waiting on employee',
  resolved: 'Resolved',
  closed: 'Closed',
};

export interface Classification {
  category: string;
  subcategory: string | null;
  priority: Priority;
}

/**
 * The PATCH body for an edit: only the fields that changed; null when nothing did.
 * A new category without a chosen subcategory sends subcategory null explicitly, so
 * the old category's subcategory is never kept by accident.
 */
export function classificationChange(
  current: Classification,
  edit: Classification,
): AgentClassificationRequest | null {
  const body: AgentClassificationRequest = {};
  if (edit.category !== current.category) {
    body.category = edit.category;
    body.subcategory = edit.subcategory;
  } else if (edit.subcategory !== current.subcategory) {
    body.subcategory = edit.subcategory;
  }
  if (edit.priority !== current.priority) body.priority = edit.priority;
  return Object.keys(body).length > 0 ? body : null;
}

/** Minutes → "5 min", "3 h", "2 d" for the queue's age column. */
export function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (60 * 24))} d`;
}

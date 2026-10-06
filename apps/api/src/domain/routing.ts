// Ticket routing (playbook W3-01): category → queue from config/routing.yaml.
// Restricted (sensitive) cases always go to the confidential HR queue. Pure.
// Every taxonomy category mapping to exactly one queue is checked at startup by
// config/crossChecks.ts, so an unknown category here is a programming error.
import type { ConfigFiles } from '../config/schemas';

type Routing = ConfigFiles['routing'];

export interface RoutedQueue {
  id: string;
  label: string;
  domain: 'IT' | 'HR';
}

export function routeTicket(
  routing: Routing,
  ticket: { category: string; restricted: boolean },
): RoutedQueue {
  const queueId = ticket.restricted ? routing.sensitiveQueue : routing.routes[ticket.category];
  const queue = routing.queues.find((q) => q.id === queueId);
  if (!queue) {
    throw new Error(`no queue for category "${ticket.category}" (routing.yaml)`);
  }
  return { id: queue.id, label: queue.label, domain: queue.domain };
}

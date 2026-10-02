import type { ConfigFiles } from './schemas';

/**
 * Reference checks across config files (drift detection). Returns one message
 * per problem; an empty array means the files agree.
 */
export function findCrossFileProblems(files: ConfigFiles): string[] {
  const problems: string[] = [];
  const categories = new Map(files.taxonomy.categories.map((c) => [c.id, c]));
  const queues = new Map(files.routing.queues.map((q) => [q.id, q]));

  for (const category of categories.values()) {
    const queueId = files.routing.routes[category.id];
    if (queueId === undefined) {
      problems.push(`taxonomy category "${category.id}" has no queue in routing.yaml`);
      continue;
    }
    const queue = queues.get(queueId);
    if (queue && queue.domain !== category.domain) {
      problems.push(
        `routing.yaml routes ${category.domain} category "${category.id}" to ${queue.domain} queue "${queue.id}"`,
      );
    }
    if (files.ticketSchemas.schemas[category.id] === undefined) {
      problems.push(`taxonomy category "${category.id}" has no entry in ticket-schemas.yaml`);
    }
  }

  for (const category of Object.keys(files.routing.routes)) {
    if (!categories.has(category)) {
      problems.push(`routing.yaml routes unknown category "${category}"`);
    }
  }
  for (const category of Object.keys(files.ticketSchemas.schemas)) {
    if (!categories.has(category)) {
      problems.push(`ticket-schemas.yaml defines unknown category "${category}"`);
    }
  }

  const sensitiveQueue = queues.get(files.routing.sensitiveQueue);
  if (sensitiveQueue && sensitiveQueue.domain !== 'HR') {
    problems.push(`routing.yaml sensitiveQueue "${sensitiveQueue.id}" must be an HR queue`);
  }

  return problems;
}

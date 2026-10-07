// Read access to an employee's records for the copilot agents (UC-04), built
// from the same service and repositories as the workspace endpoints.
import { ObjectId } from 'mongodb';
import type { WorkspaceRecords } from '../../ai/nodes/workspaceAgents';
import type { ConfigFiles } from '../../config/schemas';
import type { TicketsRepository } from '../tickets/repository';
import type { WorkspaceService } from './service';

export function createWorkspaceRecords(deps: {
  service: WorkspaceService;
  tickets: Pick<TicketsRepository, 'listForRequester'>;
  routing: ConfigFiles['routing'];
}): WorkspaceRecords {
  const queueLabel = (id: string) => deps.routing.queues.find((q) => q.id === id)?.label ?? id;
  return {
    today: deps.service.today,
    days: (who, from, to) => deps.service.days(who, from, to),
    async requests(userId) {
      const page = await deps.tickets.listForRequester(new ObjectId(userId), { limit: 50 });
      return page.items.map((t) => ({
        humanId: t.humanId,
        summary: t.summary,
        status: t.status,
        department: queueLabel(t.queue),
      }));
    },
  };
}

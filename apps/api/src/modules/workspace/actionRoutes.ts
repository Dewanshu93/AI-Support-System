// Copilot action endpoints (UC-05, UC-11c): confirm or cancel the timesheet entries
// or leave request the copilot proposed. Employee-only; another employee's
// conversation is not found.
import {
  type ActionConfirmResponse,
  API_BASE_PATH,
  ConversationParamsSchema,
  type ConversationResponse,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { createAuditService } from '../audit/service';
import { toConversationDto } from '../conversations/mappers';
import type { ActionService } from './actionService';

export function actionRoutes(deps: AppDeps, service: ActionService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = `${API_BASE_PATH}/conversations/:id/action`;
  return [
    {
      method: 'post',
      path: `${base}/confirm`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const { action, result, applied } = await service.confirm(id, req.user!);
          if (applied && result.status === 'applied') {
            // Build Contract v2.0 section I: triggered by the copilot, approved by the employee.
            const by = { conversationId: id, triggeredBy: 'copilot', approvedBy: 'employee' };
            await audit.record(
              req,
              action.kind === 'request_change'
                ? {
                    action: `ticket.${action.change}`,
                    targetType: 'ticket',
                    targetId: action.ticketId,
                    metadata: { ...by, to: action.statusAfter },
                  }
                : action.kind === 'leave_apply'
                  ? {
                      action: 'leave.apply',
                      targetType: 'leave_request',
                      targetId: result.recordId ?? req.user!.id,
                      metadata: {
                        ...by,
                        type: action.type,
                        startDate: action.startDate,
                        endDate: action.endDate,
                        days: action.days,
                        status: action.needsApproval ? 'pending' : 'approved',
                      },
                    }
                  : {
                      action: 'timesheet.save',
                      targetType: 'timesheet',
                      targetId: req.user!.id,
                      metadata: {
                        ...by,
                        changes: action.entries.map(({ date, projectId, hours }) => ({
                          date,
                          projectId,
                          hours,
                          action: 'saved',
                        })),
                      },
                    },
            );
          }
          const body: ActionConfirmResponse = { result };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/cancel`,
      access: ['employee'],
      handlers: [
        validate({ params: ConversationParamsSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const body: ConversationResponse = {
            conversation: toConversationDto(await service.cancel(id, req.user!)),
          };
          res.json(body);
        },
      ],
    },
  ];
}

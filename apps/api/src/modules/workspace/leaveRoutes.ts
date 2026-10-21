// Leave endpoints (UC-11, ADR-025). Employees see and change only their own
// requests (another employee's is "not found"); approval is for agents of the
// leave queue. Every write is audited.
import {
  type AgentLeaveDecisionRequest,
  AgentLeaveDecisionRequestSchema,
  type AgentLeaveDecisionResponse,
  type AgentLeaveListQuery,
  AgentLeaveListQuerySchema,
  type AgentLeaveListResponse,
  API_BASE_PATH,
  type LeaveApplyRequest,
  LeaveApplyRequestSchema,
  type LeaveApplyResponse,
  type LeaveOverviewResponse,
  LeaveRequestParamsSchema,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { createAuditService } from '../audit/service';
import type { LeaveService } from './leaveService';

const EMPLOYEE = ['employee'] as const;
const AGENT = ['agent'] as const;

export function leaveRoutes(deps: AppDeps, service: LeaveService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = API_BASE_PATH;
  const idOf = (req: { validated: { params?: unknown } }) =>
    (req.validated.params as { id: string }).id;

  return [
    {
      method: 'get',
      path: `${base}/leave`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: LeaveOverviewResponse = await service.overview(req.user!);
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/leave/requests`,
      access: EMPLOYEE,
      handlers: [
        validate({ body: LeaveApplyRequestSchema }),
        async (req, res) => {
          const input = req.body as LeaveApplyRequest;
          const { doc, warnings, overview } = await service.apply(req.user!, input, 'form');
          await audit.record(req, {
            action: 'leave.apply',
            targetType: 'leave_request',
            targetId: doc._id.toHexString(),
            metadata: {
              type: doc.type,
              startDate: doc.startDate,
              endDate: doc.endDate,
              days: doc.dates.length,
              status: doc.status,
              triggeredBy: 'form',
              approvedBy: 'employee',
            },
          });
          const body: LeaveApplyResponse = {
            request: service.toDto(doc, service.today()),
            warnings,
            overview,
          };
          res.status(201).json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/leave/requests/:id/cancel`,
      access: EMPLOYEE,
      handlers: [
        validate({ params: LeaveRequestParamsSchema }),
        async (req, res) => {
          const { doc, previousStatus, overview } = await service.cancel(req.user!, idOf(req));
          await audit.record(req, {
            action: 'leave.cancel',
            targetType: 'leave_request',
            targetId: doc._id.toHexString(),
            metadata: { previousStatus, triggeredBy: 'form' },
          });
          const body: LeaveOverviewResponse = overview;
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/agent/leave`,
      access: AGENT,
      handlers: [
        validate({ query: AgentLeaveListQuerySchema }),
        async (req, res) => {
          const { status } = req.validated.query as AgentLeaveListQuery;
          const body: AgentLeaveListResponse = {
            items: await service.listForApprover(req.user!, status),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/agent/leave/:id/decision`,
      access: AGENT,
      handlers: [
        validate({ params: LeaveRequestParamsSchema, body: AgentLeaveDecisionRequestSchema }),
        async (req, res) => {
          const { decision, note } = req.body as AgentLeaveDecisionRequest;
          const request = await service.decide(req.user!, idOf(req), decision, note);
          await audit.record(req, {
            action: 'leave.decide',
            targetType: 'leave_request',
            targetId: request.id,
            metadata: { decision, employeeId: request.employee.id, note: note ?? null },
          });
          const body: AgentLeaveDecisionResponse = { request };
          res.json(body);
        },
      ],
    },
  ];
}

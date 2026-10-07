// Employee workspace endpoints (UC-02): dashboard, projects, tasks, timesheets,
// attendance, payslips and notifications. Employee-only; every query is scoped
// to the authenticated user, so another employee's record is simply not found.
import {
  API_BASE_PATH,
  type AttendanceQuery,
  AttendanceQuerySchema,
  type AttendanceResponse,
  type DashboardResponse,
  type NotificationListQuery,
  NotificationListQuerySchema,
  type NotificationListResponse,
  type NotificationReadRequest,
  NotificationReadRequestSchema,
  type NotificationReadResponse,
  PayslipParamsSchema,
  type PayslipListResponse,
  type PayslipResponse,
  type ProjectListResponse,
  type TaskListQuery,
  TaskListQuerySchema,
  type TaskListResponse,
  type TimesheetSaveRequest,
  TimesheetSaveRequestSchema,
  type TimesheetSaveResponse,
  type TimesheetWeekQuery,
  TimesheetWeekQuerySchema,
  type TimesheetWeekResponse,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';
import { toAttendance, toPayslip } from './mappers';
import type { WorkspaceService } from './service';

const EMPLOYEE = ['employee'] as const;

export function workspaceRoutes(deps: AppDeps, service: WorkspaceService): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const base = API_BASE_PATH;

  return [
    {
      method: 'get',
      path: `${base}/dashboard`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: DashboardResponse = await service.dashboard(req.user!);
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/projects/mine`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: ProjectListResponse = { items: await service.projects(req.user!) };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/tasks/mine`,
      access: EMPLOYEE,
      handlers: [
        validate({ query: TaskListQuerySchema }),
        async (req, res) => {
          const body: TaskListResponse = {
            items: await service.tasks(req.user!, req.validated.query as TaskListQuery),
            today: service.today(),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/timesheets/week`,
      access: EMPLOYEE,
      handlers: [
        validate({ query: TimesheetWeekQuerySchema }),
        async (req, res) => {
          const { date } = req.validated.query as TimesheetWeekQuery;
          const body: TimesheetWeekResponse = await service.week(req.user!, date);
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/timesheets/entries`,
      access: EMPLOYEE,
      handlers: [
        validate({ body: TimesheetSaveRequestSchema }),
        async (req, res) => {
          const { cells } = req.body as TimesheetSaveRequest;
          const result = await service.saveCells(req.user!, cells, 'form');
          if (result.changes.length > 0) {
            await audit.record(req, {
              action: 'timesheet.save',
              targetType: 'timesheet',
              targetId: req.user!.id,
              metadata: { changes: result.changes, triggeredBy: 'form', approvedBy: 'employee' },
            });
          }
          const body: TimesheetSaveResponse = {
            saved: result.saved,
            removed: result.removed,
            week: result.week,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/attendance`,
      access: EMPLOYEE,
      handlers: [
        validate({ query: AttendanceQuerySchema }),
        async (req, res) => {
          const { from, to } = req.validated.query as AttendanceQuery;
          const body: AttendanceResponse = {
            items: (await service.attendance(req.user!, from, to)).map(toAttendance),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/payslips/mine`,
      access: EMPLOYEE,
      handlers: [
        async (req, res) => {
          const body: PayslipListResponse = await service.payslips(req.user!);
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/payslips/:id`,
      access: EMPLOYEE,
      handlers: [
        validate({ params: PayslipParamsSchema }),
        async (req, res) => {
          const { id } = req.validated.params as { id: string };
          const payslip = await service.payslip(req.user!, id);
          if (!payslip) throw new AppError('NOT_FOUND', 'Payslip not found');
          const body: PayslipResponse = { payslip: toPayslip(payslip) };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${base}/notifications`,
      access: EMPLOYEE,
      handlers: [
        validate({ query: NotificationListQuerySchema }),
        async (req, res) => {
          const { limit, unread } = req.validated.query as NotificationListQuery;
          const body: NotificationListResponse = await service.notifications(
            req.user!,
            limit,
            unread,
          );
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/notifications/read`,
      access: EMPLOYEE,
      handlers: [
        validate({ body: NotificationReadRequestSchema }),
        async (req, res) => {
          const { ids } = req.body as NotificationReadRequest;
          const body: NotificationReadResponse = await service.markNotificationsRead(
            req.user!,
            ids,
          );
          res.json(body);
        },
      ],
    },
  ];
}

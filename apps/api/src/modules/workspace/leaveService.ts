// Leave service (UC-11, ADR-025): balances, applying for and cancelling leave,
// and HR approval. Every rule is in domain/leave.ts; this layer loads records,
// writes the request, keeps attendance in step and notifies the employee. The
// form uses it, and the copilot action (UC-11c) after the employee confirms.
import {
  type AgentLeaveRequest,
  type AuthUser,
  type Country,
  type IsoDate,
  LEAVE_TYPES,
  type LeaveApplyRequest,
  type LeaveOverviewResponse,
  type LeaveRequest,
  type LeaveSource,
  type LeaveStatus,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import type { LeaveRequestDoc } from '../../db/schemas';
import {
  canCancelLeave,
  checkLeave,
  type LeaveApplication,
  type LeaveCheck,
  leaveBalances,
  leaveYearOf,
} from '../../domain/leave';
import { addDays, holidayCalendar, isoDate } from '../../domain/workday';
import { AppError } from '../../lib/errors';
import type { UsersRepository } from '../users/repository';
import type { WorkspaceRepository } from './repository';

export interface LeaveServiceDeps {
  workspace: WorkspaceRepository;
  users: Pick<UsersRepository, 'findById'>;
  workday: ConfigFiles['workday'];
  /** The queue whose agents approve leave (config/routing.yaml `routes.leave`). */
  approvalQueue: string;
  clock: () => Date;
}

type Employee = Pick<AuthUser, 'id' | 'country' | 'employmentType'>;
type Approver = Pick<AuthUser, 'id' | 'role' | 'queues'>;

const dayLabel = (iso: IsoDate) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
/** "Mon 26 Oct – Tue 27 Oct (2 working days)" */
export const leaveSpan = (r: Pick<LeaveRequestDoc, 'startDate' | 'endDate' | 'dates'>) =>
  `${dayLabel(r.startDate)}${r.endDate === r.startDate ? '' : ` – ${dayLabel(r.endDate)}`} (${r.dates.length} working day${r.dates.length === 1 ? '' : 's'})`;

export function createLeaveService(deps: LeaveServiceDeps) {
  const { workspace, workday, clock } = deps;
  const rules = workday.leave;
  const today = () => isoDate(clock());
  const holidaysFor = (country: Country) => holidayCalendar(workday.holidays[country]);
  const yearStart = (date: IsoDate) => `${date.slice(0, 4)}-01-01`;

  const toDto = (r: LeaveRequestDoc, now: IsoDate): LeaveRequest => ({
    id: r._id.toHexString(),
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.dates.length,
    reason: r.reason,
    status: r.status,
    source: r.source,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    cancellable: canCancelLeave(r, now),
  });

  /** The employee's requests that touch this leave year or later. */
  const requestsOf = (userId: ObjectId, now: IsoDate) =>
    workspace.leaveRequests(userId, yearStart(now));

  async function overview(user: Employee): Promise<LeaveOverviewResponse> {
    const now = today();
    const year = leaveYearOf(now);
    const docs = await requestsOf(new ObjectId(user.id), now);
    const eligible = user.employmentType === 'full_time';
    return {
      year,
      today: now,
      eligible,
      balances: eligible ? leaveBalances(rules, user.country, year, docs) : [],
      requests: docs.map((d) => toDto(d, now)),
      rules: {
        earliestSickDate: addDays(now, -(rules.types.sick.maxBackDays ?? 0)),
        latestDate: `${year}-12-31`,
      },
    };
  }

  /** Checks an application without writing (the copilot shows this before confirming). */
  async function check(user: Employee, application: LeaveApplication): Promise<LeaveCheck> {
    const now = today();
    return checkLeave(application, {
      today: now,
      country: user.country,
      employmentType: user.employmentType,
      rules,
      holidays: holidaysFor(user.country),
      existing: await requestsOf(new ObjectId(user.id), now),
    });
  }

  async function notify(userId: ObjectId, title: string, body: string) {
    await workspace.insertNotification({
      _id: new ObjectId(),
      userId,
      kind: 'leave',
      title,
      body,
      link: '/leave',
      readAt: null,
      createdAt: clock(),
    });
  }

  async function apply(user: Employee, input: LeaveApplyRequest, source: LeaveSource) {
    const result = await check(user, input);
    if (result.problems.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'The leave request is not valid', {
        issues: result.problems.map((p) => ({
          location: 'body',
          path: p.field,
          message: p.message,
        })),
      });
    }
    const userId = new ObjectId(user.id);
    const typeRules = rules.types[input.type];
    const status: LeaveStatus = typeRules.needsApproval ? 'pending' : 'approved';
    const stamp = clock();
    const doc: LeaveRequestDoc = {
      _id: new ObjectId(),
      userId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      dates: result.dates,
      reason: input.reason || null,
      status,
      source,
      decidedBy: null,
      // Sick leave is recorded, not approved: it is final when it is made.
      decidedAt: status === 'approved' ? stamp : null,
      decisionNote: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await workspace.insertLeaveRequest(doc);
    if (status === 'approved') {
      await workspace.setLeaveAttendance(userId, doc.dates, typeRules.label);
      await notify(userId, `${typeRules.label} recorded`, `${leaveSpan(doc)}.`);
    } else {
      await notify(
        userId,
        `${typeRules.label} request sent for approval`,
        `${leaveSpan(doc)} is waiting for approval. You will be notified of the decision.`,
      );
    }
    return { doc, warnings: result.warnings, overview: await overview(user) };
  }

  async function cancel(user: Employee, id: string) {
    const doc = ObjectId.isValid(id) ? await workspace.leaveRequestById(new ObjectId(id)) : null;
    if (!doc || doc.userId.toHexString() !== user.id) {
      throw new AppError('NOT_FOUND', 'Leave request not found');
    }
    if (!canCancelLeave(doc, today())) {
      throw new AppError(
        'CONFLICT',
        'Only waiting requests, or approved leave that has not started, can be cancelled',
      );
    }
    const updated = await workspace.updateLeaveRequest(doc._id, doc.status, {
      status: 'cancelled',
      updatedAt: clock(),
    });
    if (!updated) throw new AppError('CONFLICT', 'The request changed; reload and try again');
    if (doc.status === 'approved') await workspace.clearLeaveAttendance(doc.userId, doc.dates);
    return { doc: updated, previousStatus: doc.status, overview: await overview(user) };
  }

  // --- HR approval (an HR agent stands in for the manager, ADR-025) ---------------

  /** Like ticket queues (W3-05): outside the leave queue a list is empty and a request not found. */
  const isApprover = (viewer: Approver) =>
    viewer.role === 'agent' && viewer.queues.includes(deps.approvalQueue);

  async function toAgentDto(r: LeaveRequestDoc): Promise<AgentLeaveRequest> {
    const employee = await deps.users.findById(r.userId.toHexString());
    if (!employee) throw new Error(`leave request ${r._id.toHexString()} has no employee`);
    const now = today();
    const balance = leaveBalances(
      rules,
      employee.country,
      leaveYearOf(r.startDate),
      await requestsOf(r.userId, r.startDate < now ? r.startDate : now),
    ).find((b) => b.type === r.type)!;
    const { cancellable: _, ...dto } = toDto(r, now);
    return {
      ...dto,
      typeLabel: rules.types[r.type].label,
      employee: {
        id: employee._id.toHexString(),
        name: employee.name,
        department: employee.department,
        country: employee.country,
      },
      // Pending days are already held, so the balance shown is what is left after approval.
      availableAfter: balance.available,
    };
  }

  async function listForApprover(viewer: Approver, status: LeaveStatus) {
    if (!isApprover(viewer)) return [];
    const docs = await workspace.leaveRequestsByStatus(status, 100);
    return Promise.all(docs.map(toAgentDto));
  }

  async function decide(
    viewer: Approver,
    id: string,
    decision: 'approve' | 'reject',
    note: string | undefined,
  ) {
    const doc =
      isApprover(viewer) && ObjectId.isValid(id)
        ? await workspace.leaveRequestById(new ObjectId(id))
        : null;
    if (!doc) throw new AppError('NOT_FOUND', 'Leave request not found');
    if (doc.status !== 'pending') {
      throw new AppError('CONFLICT', `This request is already ${doc.status}`);
    }
    const stamp = clock();
    const updated = await workspace.updateLeaveRequest(doc._id, 'pending', {
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedBy: new ObjectId(viewer.id),
      decidedAt: stamp,
      decisionNote: note || null,
      updatedAt: stamp,
    });
    if (!updated) throw new AppError('CONFLICT', 'The request changed; reload and try again');
    const label = rules.types[doc.type].label;
    if (decision === 'approve') {
      await workspace.setLeaveAttendance(doc.userId, doc.dates, label);
      await notify(doc.userId, `${label} approved`, `${leaveSpan(doc)} is approved.`);
    } else {
      await notify(
        doc.userId,
        `${label} request declined`,
        `${leaveSpan(doc)} was declined: ${note}`,
      );
    }
    return toAgentDto(updated);
  }

  /** The bookable leave types, in config order. */
  const types = () =>
    LEAVE_TYPES.map((type) => ({
      type,
      label: rules.types[type].label,
      needsApproval: rules.types[type].needsApproval,
    }));

  return { today, types, overview, check, apply, cancel, listForApprover, decide, toDto };
}
export type LeaveService = ReturnType<typeof createLeaveService>;

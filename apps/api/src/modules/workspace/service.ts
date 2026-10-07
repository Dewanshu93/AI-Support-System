// Employee workspace service (UC-02): timesheet week view and saves, tasks,
// payroll records, notifications and the dashboard summary. All figures are
// computed here from stored records; the copilot (UC-05/06) reuses this service.
import {
  type AuthUser,
  type DashboardResponse,
  type IsoDate,
  REQUEST_STAGE_LABEL,
  type TaskListQuery,
  type TimesheetCell,
  type TimesheetDay,
  type TimesheetSource,
  type TimesheetWeekResponse,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import type { ProjectDoc } from '../../db/schemas';
import {
  addDays,
  dateRange,
  dayStatus,
  earliestLoggableDate,
  holidayCalendar,
  isLateEntry,
  isoDate,
  validateCells,
  weekStartOf,
} from '../../domain/workday';
import { AppError } from '../../lib/errors';
import type { TicketsRepository } from '../tickets/repository';
import { toNotification, toPayslipSummary, toProject, toTask, toTimesheetEntry } from './mappers';
import type { WorkspaceRepository } from './repository';

export interface WorkspaceServiceDeps {
  workspace: WorkspaceRepository;
  tickets: TicketsRepository;
  workday: ConfigFiles['workday'];
  routing: ConfigFiles['routing'];
  /** Injected so tests (and the seeded demo) control "today". */
  clock: () => Date;
}

export interface TimesheetChange {
  date: IsoDate;
  projectId: string;
  hours: number;
  action: 'saved' | 'removed';
}

const OPEN_TICKET = new Set(['new', 'in_progress', 'waiting_on_employee']);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function createWorkspaceService(deps: WorkspaceServiceDeps) {
  const { workspace, tickets, workday, routing, clock } = deps;
  const rules = workday.timesheet;
  const today = () => isoDate(clock());
  const uid = (user: AuthUser) => new ObjectId(user.id);
  const holidaysFor = (user: AuthUser) => holidayCalendar(workday.holidays[user.country]);
  const queueLabel = (id: string) => routing.queues.find((q) => q.id === id)?.label ?? id;

  /** Day statuses for a range, from entries and attendance (leave). */
  async function days(user: AuthUser, from: IsoDate, to: IsoDate) {
    const [entries, attendance] = await Promise.all([
      workspace.timesheetEntries(uid(user), from, to),
      workspace.attendance(uid(user), from, to),
    ]);
    const holidays = holidaysFor(user);
    const onLeave = new Set(attendance.filter((a) => a.status === 'leave').map((a) => a.date));
    const now = today();
    const list: TimesheetDay[] = dateRange(from, to).map((date) => {
      const hours = round2(entries.filter((e) => e.date === date).reduce((s, e) => s + e.hours, 0));
      const { status, label } = dayStatus({
        date,
        today: now,
        hours,
        requiredHours: rules.requiredHoursPerDay,
        holidays,
        onLeave: onLeave.has(date),
      });
      const working = !['weekend', 'holiday', 'leave'].includes(status);
      return {
        date,
        status,
        hours,
        requiredHours: working ? rules.requiredHoursPerDay : 0,
        label,
      };
    });
    return { days: list, entries };
  }

  /** The employee's projects, plus any project they already logged time against. */
  async function projectsFor(user: AuthUser, extraIds: ObjectId[] = []): Promise<ProjectDoc[]> {
    const own = await workspace.projectsForMember(uid(user));
    const missing = extraIds.filter((id) => !own.some((p) => p._id.equals(id)));
    return missing.length > 0 ? [...own, ...(await workspace.projectsByIds(missing))] : own;
  }

  async function week(user: AuthUser, date?: IsoDate): Promise<TimesheetWeekResponse> {
    const weekStart = weekStartOf(date ?? today());
    const weekEnd = addDays(weekStart, 6);
    const { days: list, entries } = await days(user, weekStart, weekEnd);
    const projects = await projectsFor(
      user,
      entries.map((e) => e.projectId),
    );
    return {
      weekStart,
      weekEnd,
      today: today(),
      days: list,
      entries: entries.map(toTimesheetEntry),
      projects: projects.map(toProject),
      totalHours: round2(list.reduce((s, d) => s + d.hours, 0)),
      requiredHours: list.reduce((s, d) => s + d.requiredHours, 0),
      rules: {
        maxHoursPerDay: rules.maxHoursPerDay,
        hourStep: rules.hourStep,
        earliestDate: earliestLoggableDate(today(), rules),
      },
    };
  }

  /**
   * Saves timesheet cells after validating every rule in code (dates, own
   * projects, steps, day totals). `hours: 0` removes a cell. Used by the form
   * now and by the copilot after the employee confirms (UC-05).
   */
  async function saveCells(user: AuthUser, cells: TimesheetCell[], source: TimesheetSource) {
    const now = today();
    const dates = cells.map((c) => c.date).sort();
    const from = dates[0]!;
    const to = dates[dates.length - 1]!;
    const [projects, stored] = await Promise.all([
      workspace.projectsForMember(uid(user)),
      workspace.timesheetEntries(uid(user), from, to),
    ]);
    const existing = new Map<IsoDate, Map<string, number>>();
    for (const e of stored) {
      if (!existing.has(e.date)) existing.set(e.date, new Map());
      existing.get(e.date)!.set(e.projectId.toHexString(), e.hours);
    }
    const problems = validateCells(cells, {
      today: now,
      rules,
      allowedProjectIds: new Set(projects.map((p) => p._id.toHexString())),
      existing,
    });
    if (problems.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Some timesheet entries are not valid', {
        issues: problems.map((p) => {
          const index = cells.findIndex((c) => c.date === p.date && c.projectId === p.projectId);
          return { location: 'body', path: `cells.${index}.${p.field}`, message: p.message };
        }),
      });
    }

    const changes: TimesheetChange[] = [];
    const stamp = clock();
    for (const cell of cells) {
      const projectId = new ObjectId(cell.projectId);
      if (cell.hours === 0) {
        if (await workspace.deleteTimesheetEntry(uid(user), cell.date, projectId)) {
          changes.push({ ...cell, action: 'removed' });
        }
        continue;
      }
      await workspace.upsertTimesheetEntry({
        userId: uid(user),
        date: cell.date,
        projectId,
        hours: cell.hours,
        note: cell.note || null,
        source,
        late: isLateEntry(cell.date, now, user.country),
        now: stamp,
      });
      changes.push({
        date: cell.date,
        projectId: cell.projectId,
        hours: cell.hours,
        action: 'saved',
      });
    }
    return {
      saved: changes.filter((c) => c.action === 'saved').length,
      removed: changes.filter((c) => c.action === 'removed').length,
      changes,
      week: await week(user, cells[0]!.date),
    };
  }

  async function tasks(user: AuthUser, query: TaskListQuery) {
    const docs = await workspace.tasksForAssignee(uid(user), {
      status: query.status,
      openOnly: query.view === 'open',
    });
    const projects = new Map(
      (
        await workspace.projectsByIds(
          [...new Set(docs.map((t) => t.projectId.toHexString()))].map((id) => new ObjectId(id)),
        )
      ).map((p) => [p._id.toHexString(), p]),
    );
    return docs.flatMap((t) => {
      const project = projects.get(t.projectId.toHexString());
      return project ? [toTask(t, project)] : [];
    });
  }

  async function payslips(user: AuthUser) {
    const paidByAgency = user.employmentType === 'contractor';
    const docs = paidByAgency ? [] : await workspace.payslips(uid(user), 24);
    return { items: docs.map(toPayslipSummary), paidByAgency };
  }

  async function dashboard(user: AuthUser): Promise<DashboardResponse> {
    const now = today();
    const thisWeek = weekStartOf(now);
    const lastWeek = addDays(thisWeek, -7);
    const [openTasks, timeline, ticketPage, payroll, recentNotifications, unread] =
      await Promise.all([
        tasks(user, { view: 'open' }),
        days(user, lastWeek, addDays(thisWeek, 6)),
        tickets.listForRequester(uid(user), { limit: 50 }),
        payslips(user),
        workspace.notifications(uid(user), { limit: 6 }),
        workspace.unreadNotificationCount(uid(user)),
      ]);

    const weekDays = timeline.days.filter((d) => d.date >= thisWeek);
    const activeTickets = ticketPage.items.filter((t) => OPEN_TICKET.has(t.status));
    const recentTickets = [
      ...activeTickets,
      ...ticketPage.items.filter((t) => !OPEN_TICKET.has(t.status)),
    ].slice(0, 5);
    const dueSoonLimit = addDays(now, 3);

    return {
      profile: {
        name: user.name,
        firstName: user.name.split(' ')[0] ?? user.name,
        jobTitle: user.jobTitle,
        department: user.department,
        country: user.country,
        employmentType: user.employmentType,
      },
      today: now,
      tasks: {
        open: openTasks.length,
        dueSoon: openTasks.filter((t) => t.dueDate !== null && t.dueDate <= dueSoonLimit).length,
        items: openTasks.slice(0, 6),
      },
      timesheet: {
        weekStart: thisWeek,
        days: weekDays,
        loggedHours: round2(weekDays.reduce((s, d) => s + d.hours, 0)),
        requiredHours: weekDays
          .filter((d) => d.date <= now)
          .reduce((s, d) => s + d.requiredHours, 0),
        missingDays: timeline.days
          .filter((d) => d.status === 'missing' || d.status === 'partial')
          .map((d) => d.date),
      },
      requests: {
        active: activeTickets.length,
        items: recentTickets.map((t) => ({
          id: t._id.toHexString(),
          humanId: t.humanId,
          summary: t.summary,
          status: t.status,
          stage: REQUEST_STAGE_LABEL[t.status],
          department: queueLabel(t.queue),
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
      payroll:
        user.role === 'employee'
          ? { latest: payroll.items[0] ?? null, paidByAgency: payroll.paidByAgency }
          : null,
      notifications: { unread, items: recentNotifications.map(toNotification) },
    };
  }

  return {
    today,
    week,
    saveCells,
    tasks,
    projects: async (user: AuthUser) => (await projectsFor(user)).map(toProject),
    payslips,
    payslip: (user: AuthUser, id: string) => workspace.payslip(uid(user), id),
    attendance: (user: AuthUser, from: IsoDate, to: IsoDate) =>
      workspace.attendance(uid(user), from, to),
    notifications: async (user: AuthUser, limit: number, unreadOnly?: boolean) => ({
      items: (await workspace.notifications(uid(user), { limit, unreadOnly })).map(toNotification),
      unreadCount: await workspace.unreadNotificationCount(uid(user)),
    }),
    markNotificationsRead: async (user: AuthUser, ids?: string[]) => ({
      updated: await workspace.markNotificationsRead(
        uid(user),
        ids?.map((id) => new ObjectId(id)),
        clock(),
      ),
      unreadCount: await workspace.unreadNotificationCount(uid(user)),
    }),
    dashboard,
  };
}
export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

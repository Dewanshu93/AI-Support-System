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
import { type AttentionInput, attentionItems } from '../../domain/attention';
import { leaveBalances, leaveYearOf } from '../../domain/leave';
import type { PayrollFacts } from '../../domain/workspaceReplies';
import {
  addDays,
  dateRange,
  dayStatus,
  earliestLoggableDate,
  holidayCalendar,
  isLateEntry,
  isoDate,
  payPeriodFor,
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

/** Who the records belong to: enough to scope queries and pick the holiday calendar. */
export type Who = Pick<AuthUser, 'id' | 'country'>;

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
  const uid = (user: Pick<Who, 'id'>) => new ObjectId(user.id);
  const holidaysFor = (user: Who) => holidayCalendar(workday.holidays[user.country]);
  const queueLabel = (id: string) => routing.queues.find((q) => q.id === id)?.label ?? id;

  /** Day statuses for a range, from entries and attendance (leave). */
  async function days(user: Who, from: IsoDate, to: IsoDate) {
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
    return { days: list, entries, attendance };
  }

  /**
   * "Needs your attention" (UC-12): timesheet gaps and Loss of Pay risks from
   * the start of the previous pay period to yesterday (older days have been
   * through payroll and show on payslips), plus requests waiting for the employee.
   */
  async function attention(
    user: Who & Pick<AuthUser, 'employmentType'>,
    waiting: AttentionInput['waitingRequests'],
  ) {
    const now = today();
    const from = payPeriodFor(
      addDays(payPeriodFor(now, user.country).start, -1),
      user.country,
    ).start;
    const lopApplies = user.employmentType === 'full_time';
    const [range, slips, leave] = await Promise.all([
      days(user, from, addDays(now, -1)),
      lopApplies ? workspace.payslips(uid(user), 4) : Promise.resolve([]),
      lopApplies ? workspace.leaveRequests(uid(user), `${now.slice(0, 4)}-01-01`) : [],
    ]);
    const annual = leaveBalances(workday.leave, user.country, leaveYearOf(now), leave).find(
      (b) => b.type === 'annual',
    )!;
    return attentionItems({
      annualLeave: lopApplies
        ? {
            available: annual.available,
            carryOverDays: workday.leave.carryOverDays,
            reminderFrom: workday.leave.expiryReminderFrom,
          }
        : null,
      today: now,
      days: range.days,
      attendance: new Map(range.attendance.map((a) => [a.date, a.status])),
      lopApplies,
      deductedLopDates: new Set(
        slips.flatMap((p) => p.deductions.filter((d) => d.code === 'lop').flatMap((d) => d.dates)),
      ),
      waitingRequests: waiting,
      rules: workday.payroll,
      holidays: holidaysFor(user),
    });
  }

  /** The employee's projects, plus any project they already logged time against. */
  async function projectsFor(user: Who, extraIds: ObjectId[] = []): Promise<ProjectDoc[]> {
    const own = await workspace.projectsForMember(uid(user));
    const missing = extraIds.filter((id) => !own.some((p) => p._id.equals(id)));
    return missing.length > 0 ? [...own, ...(await workspace.projectsByIds(missing))] : own;
  }

  async function week(user: Who, date?: IsoDate): Promise<TimesheetWeekResponse> {
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
  /**
   * Checks cells against every rule without writing, and describes the result:
   * the hours each cell replaces and the day totals after the change. The copilot
   * shows this to the employee before anything is saved (UC-05).
   */
  async function previewCells(user: Who, cells: TimesheetCell[]) {
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
    const after = new Map([...existing].map(([d, m]) => [d, new Map(m)]));
    for (const c of cells) {
      if (!after.has(c.date)) after.set(c.date, new Map());
      after.get(c.date)!.set(c.projectId, c.hours);
    }
    const total = (d: IsoDate) => [...(after.get(d)?.values() ?? [])].reduce((a, b) => a + b, 0);
    return {
      problems,
      projects,
      entries: cells.map((c) => ({
        ...c,
        previousHours: existing.get(c.date)?.get(c.projectId) ?? 0,
        dayTotalAfter: round2(total(c.date)),
        late: isLateEntry(c.date, now, user.country),
      })),
    };
  }

  async function saveCells(user: Who, cells: TimesheetCell[], source: TimesheetSource) {
    const now = today();
    const { problems } = await previewCells(user, cells);
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

  /**
   * The records behind "why was my pay reduced?" (UC-06): the two latest
   * payslips and, for every Loss of Pay day on them, the attendance record and
   * the hours on the timesheet now. Read by code; the copilot only explains.
   */
  async function payrollFacts(user: Who & Pick<AuthUser, 'employmentType'>): Promise<PayrollFacts> {
    if (user.employmentType === 'contractor') {
      return { paidByAgency: true, currency: null, payslips: [], lopDays: [] };
    }
    const docs = await workspace.payslips(uid(user), 2);
    const lop = docs.flatMap((p) =>
      p.deductions
        .filter((d) => d.code === 'lop')
        .flatMap((d) => {
          // Split in cents, the last day taking the remainder, so the days add up
          // exactly to the deduction on the payslip.
          const cents = Math.round(d.amount * 100);
          const share = Math.floor(cents / d.dates.length);
          const last = cents - share * (d.dates.length - 1);
          return d.dates.map((date, i) => ({
            date,
            amount: (i === d.dates.length - 1 ? last : share) / 100,
            payDate: p.payDate,
          }));
        }),
    );
    const lopDays = await Promise.all(
      lop.map(async (l) => {
        const [attendance, entries] = await Promise.all([
          workspace.attendance(uid(user), l.date, l.date),
          workspace.timesheetEntries(uid(user), l.date, l.date),
        ]);
        return {
          ...l,
          attendance: attendance[0]?.status ?? null,
          attendanceNote: attendance[0]?.note ?? null,
          hoursNow: round2(entries.reduce((s, e) => s + e.hours, 0)),
          lateHours: round2(entries.filter((e) => e.late).reduce((s, e) => s + e.hours, 0)),
          requiredHours: rules.requiredHoursPerDay,
        };
      }),
    );
    return {
      paidByAgency: false,
      currency: docs[0]?.currency ?? null,
      payslips: docs.map((p) => ({
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        payDate: p.payDate,
        gross: p.gross,
        net: p.net,
        deductions: p.deductions.map(({ code, label, amount, dates }) => ({
          code,
          label,
          amount,
          dates,
        })),
      })),
      lopDays,
    };
  }

  /** The attention items on their own (the copilot's "what should I do today?", UC-12). */
  async function needsAttention(user: Who & Pick<AuthUser, 'employmentType'>) {
    const page = await tickets.listForRequester(uid(user), { limit: 50 });
    return attention(
      user,
      page.items
        .filter((t) => t.status === 'waiting_on_employee')
        .map((t) => ({ id: t._id.toHexString(), humanId: t.humanId, summary: t.summary })),
    );
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
    const needsYou = await attention(
      user,
      activeTickets
        .filter((t) => t.status === 'waiting_on_employee')
        .map((t) => ({ id: t._id.toHexString(), humanId: t.humanId, summary: t.summary })),
    );

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
      attention: needsYou,
    };
  }

  return {
    today,
    /** Day statuses for a range (the copilot timesheet agent uses this too). */
    days: async (user: Who, from: IsoDate, to: IsoDate) => (await days(user, from, to)).days,
    /** Stored cells in a range (the copilot's "copy last week", UC-13). */
    entries: async (user: Pick<Who, 'id'>, from: IsoDate, to: IsoDate) =>
      (await workspace.timesheetEntries(uid(user), from, to)).map((e) => ({
        date: e.date,
        projectId: e.projectId.toHexString(),
        hours: e.hours,
      })),
    week,
    previewCells,
    saveCells,
    tasks,
    projects: async (user: Pick<Who, 'id'>) =>
      (await workspace.projectsForMember(uid(user))).map(toProject),
    payslips,
    payrollFacts,
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
    needsAttention,
  };
}
export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

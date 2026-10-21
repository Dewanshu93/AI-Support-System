// In-memory workspace storage for API tests; writes are validated with the
// MongoDB schemas, like the real repository.
import { ObjectId } from 'mongodb';
import { validateForWrite } from '../../src/db/collections';
import {
  type AttendanceDoc,
  AttendanceSchema,
  type LeaveRequestDoc,
  LeaveRequestSchema,
  type NotificationDoc,
  NotificationSchema,
  type PayslipDoc,
  type ProjectDoc,
  type TaskDoc,
  type TimesheetEntryDoc,
  TimesheetEntrySchema,
} from '../../src/db/schemas';
import { compareTasks, type WorkspaceRepository } from '../../src/modules/workspace/repository';
import type { MockHrData } from '../../src/modules/workspace/seed';

export interface MemoryWorkspace extends WorkspaceRepository {
  data: MockHrData;
}

const emptyData = (): MockHrData => ({
  projects: [],
  tasks: [],
  timesheetEntries: [],
  attendance: [],
  payslips: [],
  notifications: [],
  leaveRequests: [],
});

export function memoryWorkspaceRepository(initial: Partial<MockHrData> = {}): MemoryWorkspace {
  // Copies of the arrays and documents (structuredClone would strip ObjectId's prototype).
  const data = Object.fromEntries(
    Object.entries(emptyData()).map(([k, empty]) => [
      k,
      ((initial[k as keyof MockHrData] ?? empty) as object[]).map((d) => ({ ...d })),
    ]),
  ) as unknown as MockHrData;
  const sameCell = (e: TimesheetEntryDoc, userId: ObjectId, date: string, projectId: ObjectId) =>
    e.userId.equals(userId) && e.date === date && e.projectId.equals(projectId);
  return {
    data,
    projectsForMember: async (userId) =>
      data.projects
        .filter((p) => p.active && p.memberIds.some((m) => m.equals(userId)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    projectsByIds: async (ids) => data.projects.filter((p) => ids.some((id) => id.equals(p._id))),
    tasksForAssignee: async (userId, { status, openOnly }) =>
      data.tasks
        .filter(
          (t: TaskDoc) =>
            t.assigneeId.equals(userId) &&
            (status ? t.status === status : !openOnly || t.status !== 'done'),
        )
        .sort(compareTasks),
    timesheetEntries: async (userId, from, to) =>
      data.timesheetEntries
        .filter((e) => e.userId.equals(userId) && e.date >= from && e.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date)),
    async upsertTimesheetEntry({ userId, date, projectId, hours, note, source, late, now }) {
      const index = data.timesheetEntries.findIndex((e) => sameCell(e, userId, date, projectId));
      const existing = index >= 0 ? data.timesheetEntries[index] : undefined;
      const doc = validateForWrite('timesheet_entries', TimesheetEntrySchema, {
        _id: existing?._id ?? new ObjectId(),
        userId,
        date,
        projectId,
        hours,
        note,
        source,
        late,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      if (index >= 0) data.timesheetEntries[index] = doc;
      else data.timesheetEntries.push(doc);
      return doc;
    },
    async deleteTimesheetEntry(userId, date, projectId) {
      const index = data.timesheetEntries.findIndex((e) => sameCell(e, userId, date, projectId));
      if (index < 0) return false;
      data.timesheetEntries.splice(index, 1);
      return true;
    },
    attendance: async (userId, from, to) =>
      data.attendance.filter(
        (a: AttendanceDoc) => a.userId.equals(userId) && a.date >= from && a.date <= to,
      ),
    payslips: async (userId, limit) =>
      data.payslips
        .filter((p: PayslipDoc) => p.userId.equals(userId))
        .sort((a, b) => b.payDate.localeCompare(a.payDate))
        .slice(0, limit),
    payslip: async (userId, id) =>
      data.payslips.find((p) => p._id.toHexString() === id && p.userId.equals(userId)) ?? null,
    notifications: async (userId, { limit, unreadOnly }) =>
      data.notifications
        .filter((n) => n.userId.equals(userId) && (!unreadOnly || n.readAt === null))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    unreadNotificationCount: async (userId) =>
      data.notifications.filter((n) => n.userId.equals(userId) && n.readAt === null).length,
    async markNotificationsRead(userId, ids, now) {
      let updated = 0;
      for (const n of data.notifications) {
        if (!n.userId.equals(userId) || n.readAt !== null) continue;
        if (ids && !ids.some((id) => id.equals(n._id))) continue;
        n.readAt = now;
        updated++;
      }
      return updated;
    },
    async insertNotification(doc: NotificationDoc) {
      data.notifications.push(validateForWrite('notifications', NotificationSchema, doc));
    },
    async setLeaveAttendance(userId, dates, note) {
      for (const date of dates) {
        const doc = validateForWrite('attendance', AttendanceSchema, {
          _id: new ObjectId(),
          userId,
          date,
          status: 'leave',
          note,
        });
        const index = data.attendance.findIndex((a) => a.userId.equals(userId) && a.date === date);
        if (index >= 0) data.attendance[index] = { ...doc, _id: data.attendance[index]!._id };
        else data.attendance.push(doc);
      }
    },
    async clearLeaveAttendance(userId, dates) {
      data.attendance = data.attendance.filter(
        (a) => !(a.userId.equals(userId) && a.status === 'leave' && dates.includes(a.date)),
      );
    },
    leaveRequests: async (userId, from) =>
      data.leaveRequests
        .filter((r) => r.userId.equals(userId) && r.endDate >= from)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    leaveRequestById: async (id) => data.leaveRequests.find((r) => r._id.equals(id)) ?? null,
    leaveRequestsByStatus: async (status, limit) =>
      data.leaveRequests
        .filter((r) => r.status === status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit),
    async insertLeaveRequest(doc: LeaveRequestDoc) {
      data.leaveRequests.push(validateForWrite('leave_requests', LeaveRequestSchema, doc));
    },
    async updateLeaveRequest(id, from, set) {
      const index = data.leaveRequests.findIndex((r) => r._id.equals(id) && r.status === from);
      if (index < 0) return null;
      const doc = validateForWrite('leave_requests', LeaveRequestSchema, {
        ...data.leaveRequests[index],
        ...set,
      });
      data.leaveRequests[index] = doc;
      return doc;
    },
  };
}

export type { ProjectDoc };

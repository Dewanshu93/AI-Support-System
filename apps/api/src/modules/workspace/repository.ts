// Employee workspace data access (UC-01): the mock task tracker (projects,
// tasks), timesheets, attendance, payslips and in-app notifications. Every
// query is scoped to one employee; writes are validated against db/schemas.
import type { IsoDate, TaskStatus } from '@sd/shared';
import { type Collection, ObjectId } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import {
  type AttendanceDoc,
  type NotificationDoc,
  NotificationSchema,
  type PayslipDoc,
  type ProjectDoc,
  type TaskDoc,
  type TimesheetEntryDoc,
  TimesheetEntrySchema,
} from '../../db/schemas';

export interface TimesheetUpsert {
  userId: ObjectId;
  date: IsoDate;
  projectId: ObjectId;
  hours: number;
  note: string | null;
  source: TimesheetEntryDoc['source'];
  late: boolean;
  now: Date;
}

export interface WorkspaceRepository {
  /** Active projects the employee may log time against. */
  projectsForMember(userId: ObjectId): Promise<ProjectDoc[]>;
  projectsByIds(ids: ObjectId[]): Promise<ProjectDoc[]>;
  /** Tasks assigned to the employee; `openOnly` excludes done. */
  tasksForAssignee(
    userId: ObjectId,
    options: { status?: TaskStatus; openOnly?: boolean },
  ): Promise<TaskDoc[]>;
  timesheetEntries(userId: ObjectId, from: IsoDate, to: IsoDate): Promise<TimesheetEntryDoc[]>;
  /** Creates or replaces the employee's entry for one day and project. */
  upsertTimesheetEntry(entry: TimesheetUpsert): Promise<TimesheetEntryDoc>;
  /** Removes the entry for one day and project; false when there was none. */
  deleteTimesheetEntry(userId: ObjectId, date: IsoDate, projectId: ObjectId): Promise<boolean>;
  attendance(userId: ObjectId, from: IsoDate, to: IsoDate): Promise<AttendanceDoc[]>;
  /** Most recent pay date first. */
  payslips(userId: ObjectId, limit: number): Promise<PayslipDoc[]>;
  /** Null unless the payslip exists and belongs to the employee. */
  payslip(userId: ObjectId, id: string): Promise<PayslipDoc | null>;
  /** Most recent first. */
  notifications(
    userId: ObjectId,
    options: { limit: number; unreadOnly?: boolean },
  ): Promise<NotificationDoc[]>;
  unreadNotificationCount(userId: ObjectId): Promise<number>;
  /** Marks the employee's notifications read (all unread when `ids` is omitted). */
  markNotificationsRead(userId: ObjectId, ids: ObjectId[] | undefined, now: Date): Promise<number>;
  insertNotification(doc: NotificationDoc): Promise<void>;
}

/** Board order: work in progress first, done last. */
export const TASK_STATUS_ORDER: Record<TaskStatus, number> = {
  in_progress: 0,
  in_review: 1,
  todo: 2,
  done: 3,
};

/** In progress first, then by due date (no due date last), then most recently updated. */
export function compareTasks(a: TaskDoc, b: TaskDoc): number {
  return (
    TASK_STATUS_ORDER[a.status] - TASK_STATUS_ORDER[b.status] ||
    (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
    b.updatedAt.getTime() - a.updatedAt.getTime()
  );
}

export function mongoWorkspaceRepository(collections: {
  projects: Collection<ProjectDoc>;
  tasks: Collection<TaskDoc>;
  timesheetEntries: Collection<TimesheetEntryDoc>;
  attendance: Collection<AttendanceDoc>;
  payslips: Collection<PayslipDoc>;
  notifications: Collection<NotificationDoc>;
}): WorkspaceRepository {
  const { projects, tasks, timesheetEntries, attendance, payslips, notifications } = collections;
  return {
    projectsForMember: (userId) =>
      projects.find({ memberIds: userId, active: true }).sort({ name: 1 }).toArray(),
    projectsByIds: (ids) => projects.find({ _id: { $in: ids } }).toArray(),
    async tasksForAssignee(userId, { status, openOnly }) {
      const filter: Record<string, unknown> = { assigneeId: userId };
      if (status) filter.status = status;
      else if (openOnly) filter.status = { $ne: 'done' };
      return (await tasks.find(filter).limit(200).toArray()).sort(compareTasks);
    },
    timesheetEntries: (userId, from, to) =>
      timesheetEntries
        .find({ userId, date: { $gte: from, $lte: to } })
        .sort({ date: 1, projectId: 1 })
        .toArray(),
    async upsertTimesheetEntry({ userId, date, projectId, hours, note, source, late, now }) {
      const existing = await timesheetEntries.findOne({ userId, date, projectId });
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
      await timesheetEntries.replaceOne({ userId, date, projectId }, doc, { upsert: true });
      return doc;
    },
    async deleteTimesheetEntry(userId, date, projectId) {
      return (await timesheetEntries.deleteOne({ userId, date, projectId })).deletedCount === 1;
    },
    attendance: (userId, from, to) =>
      attendance
        .find({ userId, date: { $gte: from, $lte: to } })
        .sort({ date: 1 })
        .toArray(),
    payslips: (userId, limit) =>
      payslips.find({ userId }).sort({ payDate: -1 }).limit(limit).toArray(),
    payslip: async (userId, id) =>
      ObjectId.isValid(id) ? payslips.findOne({ _id: new ObjectId(id), userId }) : null,
    notifications: (userId, { limit, unreadOnly }) =>
      notifications
        .find({ userId, ...(unreadOnly && { readAt: null }) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray(),
    unreadNotificationCount: (userId) => notifications.countDocuments({ userId, readAt: null }),
    async markNotificationsRead(userId, ids, now) {
      const result = await notifications.updateMany(
        { userId, readAt: null, ...(ids && { _id: { $in: ids } }) },
        { $set: { readAt: now } },
      );
      return result.modifiedCount;
    },
    async insertNotification(doc) {
      await notifications.insertOne(validateForWrite('notifications', NotificationSchema, doc));
    },
  };
}

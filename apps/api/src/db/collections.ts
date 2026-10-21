import type { Db } from 'mongodb';
import type { z } from 'zod';
import type {
  AttendanceDoc,
  EmailOutboxDoc,
  LeaveRequestDoc,
  NotificationDoc,
  PayslipDoc,
  ProjectDoc,
  TaskDoc,
  TimesheetEntryDoc,
  AuditLogDoc,
  ChunkDoc,
  ConversationDoc,
  CounterDoc,
  DocumentDoc,
  EvalResultDoc,
  EvalRunDoc,
  FeedbackDoc,
  GapClusterDoc,
  MessageDoc,
  TicketDoc,
  TicketEventDoc,
  TurnTraceDoc,
  UserDoc,
} from './schemas';

/** Accessor key → MongoDB collection name (playbook section 3). */
export const COLLECTIONS = {
  users: 'users',
  documents: 'documents',
  chunks: 'chunks',
  conversations: 'conversations',
  messages: 'messages',
  turnTraces: 'turn_traces',
  tickets: 'tickets',
  ticketEvents: 'ticket_events',
  feedback: 'feedback',
  evalRuns: 'eval_runs',
  evalResults: 'eval_results',
  auditLog: 'audit_log',
  counters: 'counters',
  gapClusters: 'gap_clusters',
  // Employee workspace (UC-01): mock task tracker and HR/payroll systems.
  projects: 'projects',
  tasks: 'tasks',
  timesheetEntries: 'timesheet_entries',
  attendance: 'attendance',
  payslips: 'payslips',
  notifications: 'notifications',
  // Escalation emails (UC-07, ADR-017): written only after the employee confirms.
  emailOutbox: 'email_outbox',
  // Leave requests (UC-11, ADR-025): mock HR leave system.
  leaveRequests: 'leave_requests',
} as const;
export type CollectionKey = keyof typeof COLLECTIONS;

/** Typed collection handles. Feature queries live in module repositories. */
export function getCollections(db: Db) {
  return {
    users: db.collection<UserDoc>(COLLECTIONS.users),
    documents: db.collection<DocumentDoc>(COLLECTIONS.documents),
    chunks: db.collection<ChunkDoc>(COLLECTIONS.chunks),
    conversations: db.collection<ConversationDoc>(COLLECTIONS.conversations),
    messages: db.collection<MessageDoc>(COLLECTIONS.messages),
    turnTraces: db.collection<TurnTraceDoc>(COLLECTIONS.turnTraces),
    tickets: db.collection<TicketDoc>(COLLECTIONS.tickets),
    ticketEvents: db.collection<TicketEventDoc>(COLLECTIONS.ticketEvents),
    feedback: db.collection<FeedbackDoc>(COLLECTIONS.feedback),
    evalRuns: db.collection<EvalRunDoc>(COLLECTIONS.evalRuns),
    evalResults: db.collection<EvalResultDoc>(COLLECTIONS.evalResults),
    auditLog: db.collection<AuditLogDoc>(COLLECTIONS.auditLog),
    counters: db.collection<CounterDoc>(COLLECTIONS.counters),
    gapClusters: db.collection<GapClusterDoc>(COLLECTIONS.gapClusters),
    projects: db.collection<ProjectDoc>(COLLECTIONS.projects),
    tasks: db.collection<TaskDoc>(COLLECTIONS.tasks),
    timesheetEntries: db.collection<TimesheetEntryDoc>(COLLECTIONS.timesheetEntries),
    attendance: db.collection<AttendanceDoc>(COLLECTIONS.attendance),
    payslips: db.collection<PayslipDoc>(COLLECTIONS.payslips),
    notifications: db.collection<NotificationDoc>(COLLECTIONS.notifications),
    emailOutbox: db.collection<EmailOutboxDoc>(COLLECTIONS.emailOutbox),
    leaveRequests: db.collection<LeaveRequestDoc>(COLLECTIONS.leaveRequests),
  } satisfies Record<CollectionKey, unknown>;
}
export type Collections = ReturnType<typeof getCollections>;

/**
 * Validates a document before it is written. Failure means a bug in the
 * calling code (not bad user input), so it throws a plain Error and surfaces
 * as INTERNAL.
 */
export function validateForWrite<S extends z.ZodType>(
  collection: string,
  schema: S,
  doc: unknown,
): z.output<S> {
  const result = schema.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid ${collection} document: ${issues}`);
  }
  return result.data;
}

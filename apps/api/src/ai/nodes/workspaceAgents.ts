// Records-based copilot nodes (code, no LLM; UC-04). They answer from the
// employee's own timesheet and requests, which code reads from the database
// (Build Contract v2.0, rule E.2). The timesheet log action arrives in UC-05.
import type { Country, IsoDate, LeaveStatus, LeaveType, TimesheetDay } from '@sd/shared';
import {
  type BriefingItem,
  dailyBriefingReply,
  LEAVE_APPLY_PENDING_REPLY,
  leaveBalanceReply,
  type LeaveFacts,
  type PayrollFacts,
  type RequestSummary,
  requestStatusReply,
  TIMESHEET_LOG_PENDING_REPLY,
  timesheetStatusReply,
} from '../../domain/workspaceReplies';
import type { DecisionResult, State, StateUpdate } from '../graph/state';

/** A timesheet cell as the copilot proposes it (projectId resolved by code). */
export interface ProposedCell {
  date: IsoDate;
  projectId: string;
  hours: number;
}

/** Access to the employee's records, scoped by the caller to one user. */
export interface WorkspaceRecords {
  today(): IsoDate;
  /** Projects the employee may log time against. */
  projects(userId: string): Promise<{ id: string; code: string; name: string; color: string }[]>;
  /** Checks cells against the timesheet rules without writing (UC-05). */
  previewTimesheet(
    who: { id: string; country: Country },
    cells: ProposedCell[],
  ): Promise<{
    problems: { date: IsoDate; projectId: string; message: string }[];
    entries: (ProposedCell & { previousHours: number; dayTotalAfter: number; late: boolean })[];
  }>;
  /** Saves confirmed cells through the same rules as the form; throws if a rule now fails. */
  saveTimesheet(
    who: { id: string; country: Country },
    cells: ProposedCell[],
    source: 'copilot',
  ): Promise<{ saved: number }>;
  days(who: { id: string; country: Country }, from: IsoDate, to: IsoDate): Promise<TimesheetDay[]>;
  /** Stored timesheet cells in a range ("copy last week", UC-13). */
  entries?(who: { id: string }, from: IsoDate, to: IsoDate): Promise<ProposedCell[]>;
  requests(userId: string): Promise<RequestSummary[]>;
  /** Payslips, Loss of Pay days and their attendance/timesheet records (UC-06). */
  payroll(who: Employee): Promise<PayrollFacts>;
  /** Leave balances and requests (UC-11); absent where leave is not wired (older tests). */
  leave?(who: Employee): Promise<LeaveFacts>;
  /** The dashboard's "needs your attention" items, most urgent first (UC-12). */
  attention?(who: Employee): Promise<BriefingItem[]>;
  /** Leave types employees book, from config (UC-11c). */
  leaveTypes?(): { type: LeaveType; label: string; needsApproval: boolean }[];
  /** Checks a leave application against every rule without writing (UC-11c). */
  checkLeave?(who: Employee, application: LeaveApplicationInput): Promise<LeaveCheckResult>;
  /** Books confirmed leave through the same service as the Leave page; throws if a rule now fails. */
  applyLeave?(
    who: Employee,
    application: LeaveApplicationInput,
    source: 'copilot',
  ): Promise<{ id: string; status: LeaveStatus }>;
}

export interface LeaveApplicationInput {
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
}

export interface LeaveCheckResult {
  dates: IsoDate[];
  problems: { field: string; message: string }[];
  warnings: string[];
  availableAfter: number;
}

type Employee = { id: string; country: Country; employmentType: 'full_time' | 'contractor' };

export interface WorkspaceAgentDeps {
  /** Absent in graphs built without workspace data (older tests, eval runner). */
  records?: WorkspaceRecords;
}

const RECORDS_UNAVAILABLE =
  'I cannot read your records right now. Please open the page in the menu, or try again shortly.';

const DAY_MS = 86_400_000;
const addDays = (iso: IsoDate, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Records replies are answers from data, not from documents: ANSWER with a records reason. */
const recordsDecision = (reasonCode: string): DecisionResult => ({
  value: 'ANSWER',
  reasonCode,
  rulesFired: ['workspace_agent'],
});

const reply = (text: string, reasonCode: string): StateUpdate => ({
  decision: recordsDecision(reasonCode),
  output: { text, citations: [], uncovered: [], withdrawn: false },
});

export function createTimesheetStatus({ records }: WorkspaceAgentDeps) {
  return async function timesheetStatus(state: State): Promise<StateUpdate> {
    if (!records || !state.profile) return reply(RECORDS_UNAVAILABLE, 'RECORDS_UNAVAILABLE');
    const today = records.today();
    const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const days = await records.days(
      { id: state.input.userId, country: state.profile.country },
      addDays(monday, -7),
      today,
    );
    const update = reply(timesheetStatusReply(days, today), 'RECORDS_TIMESHEET');
    return {
      ...update,
      trace: {
        outputs: {
          records: {
            kind: 'timesheet',
            from: addDays(monday, -7),
            to: today,
            gaps: days
              .filter((d) => d.status === 'missing' || d.status === 'partial')
              .map((d) => d.date),
          },
        },
      },
    };
  };
}

/** Placeholder until UC-05: never writes, points to the timesheet page. */
export function timesheetLog(_state: State): StateUpdate {
  return reply(TIMESHEET_LOG_PENDING_REPLY, 'TIMESHEET_ACTION_PENDING');
}

const employeeOf = (state: State): Employee | null =>
  state.profile
    ? {
        id: state.input.userId,
        country: state.profile.country,
        employmentType: state.profile.employmentType,
      }
    : null;

/** "How many casual leaves do I have?" (UC-11): balances and upcoming leave, from records. */
export function createLeaveBalance({ records }: WorkspaceAgentDeps) {
  return async function leaveBalance(state: State): Promise<StateUpdate> {
    const who = employeeOf(state);
    if (!records?.leave || !who) return reply(RECORDS_UNAVAILABLE, 'RECORDS_UNAVAILABLE');
    const facts = await records.leave(who);
    return {
      ...reply(leaveBalanceReply(facts, records.today()), 'RECORDS_LEAVE'),
      trace: {
        outputs: {
          records: {
            kind: 'leave',
            eligible: facts.eligible,
            available: facts.balances.map((b) => [b.type, b.available]),
          },
        },
      },
    };
  };
}

/** Placeholder until UC-11c: never writes, points to the Leave page. */
export function leaveApply(_state: State): StateUpdate {
  return reply(LEAVE_APPLY_PENDING_REPLY, 'LEAVE_ACTION_PENDING');
}

/** "What should I do today?" (UC-12): the dashboard's attention items, in words. */
export function createDailyBriefing({ records }: WorkspaceAgentDeps) {
  return async function dailyBriefing(state: State): Promise<StateUpdate> {
    const who = employeeOf(state);
    if (!records?.attention || !who) return reply(RECORDS_UNAVAILABLE, 'RECORDS_UNAVAILABLE');
    const items = await records.attention(who);
    return {
      ...reply(dailyBriefingReply(items), 'RECORDS_BRIEFING'),
      trace: { outputs: { records: { kind: 'attention', items: items.map((i) => i.kind) } } },
    };
  };
}

export function createRequestStatus({ records }: WorkspaceAgentDeps) {
  return async function requestStatus(state: State): Promise<StateUpdate> {
    if (!records) return reply(RECORDS_UNAVAILABLE, 'RECORDS_UNAVAILABLE');
    const requests = await records.requests(state.input.userId);
    return {
      ...reply(requestStatusReply(requests), 'RECORDS_REQUESTS'),
      trace: { outputs: { records: { kind: 'requests', count: requests.length } } },
    };
  };
}

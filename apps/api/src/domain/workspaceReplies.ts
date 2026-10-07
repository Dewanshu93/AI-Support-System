// Copilot replies built from the employee's own records (UC-04). Pure: every
// figure comes from the records passed in, never from a model (Build Contract
// v2.0, rule E.2).
import { REQUEST_STAGE_LABEL, type TicketStatus, type TimesheetDay } from '@sd/shared';

const DAY_MS = 86_400_000;
const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

/**
 * Timesheet status for the current and previous week. `days` covers both
 * weeks in date order; days after `today` are ignored.
 */
export function timesheetStatusReply(days: TimesheetDay[], today: string): string {
  const thisMonday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
  })();
  const thisWeek = days.filter((d) => d.date >= thisMonday && d.date <= today);
  const logged = thisWeek.reduce((s, d) => s + d.hours, 0);
  const required = thisWeek.reduce((s, d) => s + d.requiredHours, 0);
  const gaps = days.filter((d) => d.status === 'missing' || d.status === 'partial');

  const lines = [`This week you have logged ${h(logged)} of the ${h(required)} due so far.`];
  if (gaps.length === 0) {
    lines.push('Every past working day in this week and last week has its hours logged.');
  } else {
    lines.push(
      `${gaps.length === 1 ? 'One working day needs' : `${gaps.length} working days need`} hours:`,
      ...gaps.map((d) =>
        d.status === 'missing'
          ? `• ${label(d.date)}: nothing logged`
          : `• ${label(d.date)}: ${h(d.hours)} of ${h(d.requiredHours)}`,
      ),
      'Days left empty at the payroll cutoff can be treated as Loss of Pay. You can log them on the Timesheets page.',
    );
  }
  const offDays = days.filter((d) => d.status === 'holiday' || d.status === 'leave');
  if (offDays.length > 0) {
    lines.push(
      `Not counted: ${offDays.map((d) => `${label(d.date)} (${d.label ?? d.status})`).join(', ')}.`,
    );
  }
  return lines.join('\n');
}

export interface RequestSummary {
  humanId: string;
  summary: string;
  status: TicketStatus;
  department: string;
}

/** The employee's open requests first, then the most recently closed one. */
export function requestStatusReply(requests: RequestSummary[]): string {
  if (requests.length === 0) {
    return 'You have no requests yet. If I cannot solve something, I can prepare one for you to review.';
  }
  const open = requests.filter((r) =>
    ['new', 'in_progress', 'waiting_on_employee'].includes(r.status),
  );
  const closed = requests.filter((r) => !open.includes(r));
  const line = (r: RequestSummary) =>
    `• ${r.humanId} — ${r.summary} (${r.department}): ${REQUEST_STAGE_LABEL[r.status]}`;
  const lines =
    open.length === 0
      ? ['You have no open requests.']
      : [`You have ${open.length} open request${open.length === 1 ? '' : 's'}:`, ...open.map(line)];
  const waiting = open.filter((r) => r.status === 'waiting_on_employee');
  if (waiting.length > 0) {
    lines.push(
      `${waiting.map((r) => r.humanId).join(', ')} ${waiting.length === 1 ? 'is' : 'are'} waiting for your reply.`,
    );
  }
  if (closed[0]) lines.push(`Most recently closed: ${line(closed[0]).slice(2)}.`);
  lines.push('Open Requests in the menu to see every request and its history.');
  return lines.join('\n');
}

// --- timesheet action (UC-05) --------------------------------------------------------

export interface ProposedEntry {
  date: string;
  projectName: string;
  hours: number;
  previousHours: number;
  dayTotalAfter: number;
  late: boolean;
}

/** What the copilot still needs before it can propose an entry. */
export interface MissingDetails {
  date: boolean;
  /** A date phrase code could not read, quoted back to the employee. */
  unreadableDate: string | null;
  project: boolean;
  hours: boolean;
  /** The employee's projects, offered when the project is missing. */
  projectNames: string[];
}

export function timesheetMissingReply(m: MissingDetails): string {
  const asks: string[] = [];
  if (m.unreadableDate) {
    asks.push(
      `I could not tell which day "${m.unreadableDate}" is. Please give the date, for example "11 September" or "yesterday".`,
    );
  } else if (m.date) {
    asks.push('Which day should I log the hours for?');
  }
  if (m.project) asks.push(`Which project? You can log time to: ${m.projectNames.join(', ')}.`);
  if (m.hours) asks.push('How many hours?');
  return ['I need a little more to log your time.', ...asks].join('\n');
}

/** Rule problems found by code (the same rules as the timesheet form). */
export function timesheetProblemsReply(problems: { date: string; message: string }[]): string {
  return [
    'I cannot log that as asked:',
    ...problems.map((p) => `• ${label(p.date)}: ${p.message}`),
    'Tell me what to change, or use the Timesheets page.',
  ].join('\n');
}

const entryLine = (e: ProposedEntry) =>
  `• ${label(e.date)}: ${h(e.hours)} on ${e.projectName}` +
  (e.previousHours > 0 ? ` (replaces ${h(e.previousHours)})` : '') +
  ` → day total ${h(e.dayTotalAfter)}` +
  (e.late ? ' (late entry: its pay period has closed)' : '');

/** Shown with the confirmation card; nothing is saved yet. */
export function timesheetConfirmReply(entries: ProposedEntry[]): string {
  const what = entries.length === 1 ? 'this timesheet entry' : 'these timesheet entries';
  return [
    `Please confirm ${what}. Nothing is saved until you confirm.`,
    ...entries.map(entryLine),
  ].join('\n');
}

/** Recorded in the conversation after the employee confirmed and the entries were saved. */
export function timesheetAppliedReply(entries: ProposedEntry[]): string {
  const saved = entries
    .map((e) => `${h(e.hours)} on ${e.projectName} for ${label(e.date)}`)
    .join('; ');
  const late = entries.some((e) => e.late)
    ? ' The pay period had closed, so this is a late entry; if a Loss of Pay deduction was applied for that day, I can raise a payroll request for a review.'
    : '';
  return `Saved to your timesheet: ${saved}.${late}`;
}

export const TIMESHEET_EXTRACTION_FAILED_REPLY =
  'I could not read that timesheet request. Try something like "Log 8 hours for the Banking Module yesterday", or use the Timesheets page.';

/** Until the timesheet action is built (UC-05): point to the form, change nothing. */
export const TIMESHEET_LOG_PENDING_REPLY =
  'I cannot log hours from the chat yet. Open Timesheets in the menu to add or change your hours; your entry is checked and saved there straight away.';

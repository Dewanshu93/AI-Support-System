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

/** Until the timesheet action is built (UC-05): point to the form, change nothing. */
export const TIMESHEET_LOG_PENDING_REPLY =
  'I cannot log hours from the chat yet. Open Timesheets in the menu to add or change your hours; your entry is checked and saved there straight away.';

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

// --- payroll explanation (UC-06) -------------------------------------------------------

/** The employee's pay records relevant to "why was my pay reduced?", read by code. */
export interface PayrollFacts {
  paidByAgency: boolean;
  currency: 'USD' | 'GBP' | null;
  /** Most recent first. */
  payslips: {
    periodStart: string;
    periodEnd: string;
    payDate: string;
    gross: number;
    net: number;
    deductions: { code: string; label: string; amount: number; dates: string[] }[];
  }[];
  /** One per Loss of Pay day on those payslips. */
  lopDays: {
    date: string;
    amount: number;
    payDate: string;
    attendance: string | null;
    attendanceNote: string | null;
    /** Hours on the timesheet for that day now (logging late does not change the payslip). */
    hoursNow: number;
    /** Hours of hoursNow logged after the day's pay period closed (0 when all were on time). */
    lateHours: number;
    requiredHours: number;
  }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ", logged after the pay period closed" for all of a day's hours, or how many of them. */
const lateNote = (d: PayrollFacts['lopDays'][number]) =>
  d.lateHours === 0
    ? ''
    : d.lateHours >= d.hoursNow
      ? ', logged after the pay period closed'
      : `, ${h(d.lateHours)} of it logged after the pay period closed`;

const money = (n: number, currency: PayrollFacts['currency']) =>
  new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(n);

export const PAID_BY_AGENCY_REPLY =
  'As a contractor you are paid by your agency, so the company payroll holds no payslips or deductions for you. Please ask your agency about your pay.';

/** "Your records": every figure comes from the stored records. */
export function payrollRecordsText(f: PayrollFacts): string {
  const latest = f.payslips[0];
  if (!latest) return 'I found no payslips for you yet.';
  const lines = [
    `Your latest payslip (${label(latest.periodStart)} – ${label(latest.periodEnd)}, paid ${label(latest.payDate)}): gross ${money(latest.gross, f.currency)}, net ${money(latest.net, f.currency)}.`,
  ];
  if (f.lopDays.length === 0) {
    lines.push('There is no Loss of Pay deduction on your recent payslips.');
    lines.push(
      latest.deductions.length === 0
        ? 'There are no deductions on it.'
        : `Deductions: ${latest.deductions.map((d) => `${d.label} ${money(d.amount, f.currency)}`).join('; ')}.`,
    );
    return lines.join('\n');
  }
  for (const d of f.lopDays) {
    const attendance = d.attendance
      ? `attendance shows "${d.attendance}"${d.attendanceNote ? ` (${d.attendanceNote})` : ''}`
      : 'there is no attendance record';
    const timesheet =
      d.hoursNow === 0
        ? 'your timesheet has no hours for that day'
        : `your timesheet now shows ${h(d.hoursNow)}${lateNote(d)}`;
    lines.push(
      `• Loss of Pay ${money(d.amount, f.currency)} for ${label(d.date)}, on the payslip paid ${label(d.payDate)}: ${attendance}, and ${timesheet}.`,
    );
  }
  return lines.join('\n');
}

/** Code-built next steps after the explanation. */
export function payrollNextSteps(f: PayrollFacts): string {
  if (f.lopDays.length === 0) {
    return 'If something on your payslip still looks wrong, I can raise a payroll request for you.';
  }
  const missing = f.lopDays.filter((d) => d.hoursNow < d.requiredHours);
  const first = missing[0];
  const steps = [
    ...(first
      ? [
          `If you worked on ${missing.map((d) => label(d.date)).join(', ')}, log the hours first, for example: "Log ${round2(first.requiredHours - first.hoursNow)} hours for <project> on ${label(first.date)}".`,
        ]
      : []),
    'Then ask me to raise a payroll request so payroll can review the Loss of Pay deduction.',
  ];
  return steps.join('\n');
}

/** Deduction codes in words, so the model never sees a figure from the payslip. */
const DEDUCTION_WORDS: Record<string, string> = {
  tax: 'income tax',
  social_security: 'social security or national insurance',
  retirement: 'retirement contribution',
  health: 'health plan premium',
  lop: 'Loss of Pay',
  other: 'other deduction',
};

/**
 * The records as the model sees them (P-11): the situation without any figure,
 * date or amount; the employee sees those in the code-written records instead.
 * This keeps pay figures out of the model call, and the explanation can then
 * only contain numbers copied from the cited policy, which the number check verifies.
 */
export function payrollFactsForModel(f: PayrollFacts): string {
  const noDigits = (t: string) => t.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();
  if (f.lopDays.length === 0) {
    const codes = [...new Set(f.payslips[0]?.deductions.map((d) => d.code) ?? [])];
    const words = codes.map((c) => DEDUCTION_WORDS[c] ?? 'other deduction');
    return [
      'No Loss of Pay deduction on the recent payslips.',
      `Deductions on the latest payslip: ${words.join(', ') || 'none'}.`,
    ].join('\n');
  }
  return f.lopDays
    .map((d) => {
      const attendance = d.attendance
        ? `attendance recorded as ${d.attendance}${d.attendanceNote ? ` (${noDigits(d.attendanceNote)})` : ''}`
        : 'no attendance record';
      const timesheet =
        d.hoursNow === 0
          ? 'no timesheet hours for that day'
          : d.hoursNow < d.requiredHours
            ? 'part of the day is now on the timesheet'
            : 'the full day is now on the timesheet';
      const late =
        d.lateHours === 0
          ? ''
          : d.lateHours >= d.hoursNow
            ? ', logged after the pay period closed'
            : ', partly logged after the pay period closed';
      return `- A Loss of Pay day on a recent payslip: ${attendance}; ${timesheet}${late}.`;
    })
    .join('\n');
}

// --- escalation email (UC-07) ----------------------------------------------------------

/** A date in an email to a team: "Fri 11 Sept 2026" (with the year, unlike chat replies). */
export const emailDate = (iso: string) => `${label(iso)} ${iso.slice(0, 4)}`;

/** The LOP dates of the facts, in words, for the email's request line. */
export const lopDatesText = (f: PayrollFacts) => f.lopDays.map((d) => emailDate(d.date)).join(', ');

/**
 * The payroll lines of the escalation email's "System information". Every
 * figure is copied from the records (per-day amounts already split in cents
 * so they add up to the deduction); the model never writes any of them.
 */
export function payrollEmailLines(f: PayrollFacts): string[] {
  if (f.paidByAgency) return ['Paid by agency; no company payslips.'];
  const latest = f.payslips[0];
  if (!latest) return ['No payslips on record yet.'];
  const lines = [
    `Latest payslip ${emailDate(latest.periodStart)} – ${emailDate(latest.periodEnd)}, paid ${emailDate(latest.payDate)}.`,
  ];
  if (f.lopDays.length === 0) {
    lines.push('No Loss of Pay deduction on the recent payslips.');
    return lines;
  }
  for (const d of f.lopDays) {
    const attendance = d.attendance
      ? `${d.attendance}${d.attendanceNote ? ` (${d.attendanceNote})` : ''}`
      : 'no record';
    const hoursNow = Number.isInteger(d.hoursNow) ? d.hoursNow : d.hoursNow.toFixed(1);
    lines.push(
      `Loss of Pay ${money(d.amount, f.currency)} for ${emailDate(d.date)} (payslip paid ${emailDate(d.payDate)}); attendance: ${attendance}; timesheet now ${hoursNow} of ${h(d.requiredHours)}${lateNote(d)}.`,
    );
  }
  return lines;
}

/**
 * The pay period a payroll request is about, written by code for the ticket's
 * pay_period field: the payslip holding the first Loss of Pay day, else the
 * latest payslip. Null when there is none (contractors, no payslips yet).
 */
export function payPeriodText(f: PayrollFacts): string | null {
  const firstLop = f.lopDays[0];
  const slip =
    (firstLop && f.payslips.find((p) => p.payDate === firstLop.payDate)) || f.payslips[0];
  if (f.paidByAgency || !slip) return null;
  return `${label(slip.periodStart)} – ${label(slip.periodEnd)} (paid ${emailDate(slip.payDate)})`;
}

/** The email's "Action taken" lines for hours logged after a LOP day's pay period closed. */
export function lateLoggingLines(f: PayrollFacts): string[] {
  return f.lopDays
    .filter((d) => d.lateHours > 0)
    .map((d) => `Logged ${h(d.lateHours)} for ${emailDate(d.date)} after the pay period closed.`);
}

/** Heading lines of the payroll reply (payrollReply). */
export const PAYROLL_REPLY_SECTIONS = {
  records: 'Your records',
  policy: 'What the policy says',
} as const;

/**
 * Replaces the "Your records" block of a stored payroll reply when it is replayed
 * to a model as history, so pay figures never leave the system on later turns.
 * The next steps (with the day, for "that day") are kept.
 */
export function withoutPayrollRecords(text: string): string {
  const start = text.indexOf(`${PAYROLL_REPLY_SECTIONS.records}\n`);
  const end = text.indexOf(`\n${PAYROLL_REPLY_SECTIONS.policy}\n`);
  if (start !== 0 || end < 0) return text;
  return `${PAYROLL_REPLY_SECTIONS.records}\n(your pay records were shown here)\n${text.slice(end)}`;
}

/** The final reply: records (code), policy explanation (model, cited), next steps (code). */
export function payrollReply(f: PayrollFacts, explanation: string | null): string {
  return [
    PAYROLL_REPLY_SECTIONS.records,
    payrollRecordsText(f),
    '',
    PAYROLL_REPLY_SECTIONS.policy,
    explanation ??
      'I could not find a policy passage I can cite for this. Payroll can explain the deduction if you raise a request.',
    '',
    'Next steps',
    payrollNextSteps(f),
  ].join('\n');
}

// --- leave (UC-11) and "what should I do today?" (UC-12) -------------------------------

/** The parts of the leave overview (GET /api/leave) the balance reply needs. */
export interface LeaveFacts {
  eligible: boolean;
  year: number;
  balances: {
    type: string;
    label: string;
    entitlement: number;
    used: number;
    pending: number;
    available: number;
  }[];
  requests: {
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  }[];
}

export const LEAVE_NOT_ELIGIBLE_REPLY =
  'As a contractor you do not have company leave balances. Agree time off with your manager and your agency at least 5 business days ahead.';

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const span = (r: { startDate: string; endDate: string }) =>
  r.startDate === r.endDate ? label(r.startDate) : `${label(r.startDate)} – ${label(r.endDate)}`;

/** Balances and upcoming leave, every figure from the leave records. */
export function leaveBalanceReply(f: LeaveFacts, today: string): string {
  if (!f.eligible) return LEAVE_NOT_ELIGIBLE_REPLY;
  const lines = [
    `Your leave for ${f.year}:`,
    ...f.balances.map(
      (b) =>
        `• ${b.label}: ${days(b.available)} left of ${b.entitlement}` +
        (b.used > 0 || b.pending > 0
          ? ` (${b.used} used${b.pending > 0 ? `, ${b.pending} waiting for approval` : ''})`
          : ''),
    ),
  ];
  const typeLabel = (type: string) => f.balances.find((b) => b.type === type)?.label ?? type;
  const upcoming = f.requests
    .filter((r) => r.endDate >= today && (r.status === 'pending' || r.status === 'approved'))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length > 0) {
    lines.push(
      'Coming up:',
      ...upcoming.map(
        (r) =>
          `• ${typeLabel(r.type)}, ${span(r)} (${days(r.days)}): ${r.status === 'pending' ? 'waiting for approval' : 'approved'}`,
      ),
    );
  }
  lines.push('You can request leave on the Leave page.');
  return lines.join('\n');
}

/** Until the leave action is built (UC-11c): point to the form, change nothing. */
export const LEAVE_APPLY_PENDING_REPLY =
  'I cannot book leave from the chat yet. Open Leave in the menu to request it; your balance and the dates are checked there straight away.';

// --- leave action (UC-11c) ---------------------------------------------------------------

/** What the copilot still needs before it can propose a leave request. */
export interface LeaveMissing {
  type: boolean;
  date: boolean;
  /** A date phrase code could not read, quoted back to the employee. */
  unreadableDate: string | null;
  /** "Annual leave (12 left)", offered when the type is missing. */
  typeOptions: string[];
}

export function leaveMissingReply(m: LeaveMissing): string {
  const asks: string[] = [];
  if (m.type) asks.push(`Which kind of leave? You can book: ${m.typeOptions.join(', ')}.`);
  if (m.unreadableDate) {
    asks.push(
      `I could not tell which day "${m.unreadableDate}" is. Please give the date, for example "26 October" or "next Monday".`,
    );
  } else if (m.date) {
    asks.push('Which day or days?');
  }
  return ['I need a little more to book your leave.', ...asks].join('\n');
}

/** Rule problems found by code (the same rules as the Leave page). */
export function leaveProblemsReply(problems: { message: string }[]): string {
  return [
    'I cannot book that as asked:',
    ...problems.map((p) => `• ${p.message}`),
    'Tell me what to change, or use the Leave page.',
  ].join('\n');
}

/** The proposed request, as the confirmation card shows it. */
export interface ProposedLeave {
  typeLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  availableAfter: number;
  needsApproval: boolean;
  warnings: string[];
}

const leaveLine = (l: ProposedLeave) => `${l.typeLabel}, ${span(l)} (${days(l.days)})`;

/** Shown with the confirmation card; nothing is sent yet. */
export function leaveConfirmReply(l: ProposedLeave): string {
  return [
    `Please confirm this leave request. Nothing is ${l.needsApproval ? 'sent' : 'recorded'} until you confirm.`,
    `• ${leaveLine(l)}`,
    `• ${l.typeLabel} left after this: ${days(l.availableAfter)}`,
    l.needsApproval
      ? '• HR approves it for your manager; you will be notified.'
      : '• Sick leave is recorded at once; tell your manager as well.',
    ...l.warnings.map((w) => `Note: ${w}`),
  ].join('\n');
}

/** Recorded in the conversation after the employee confirmed. */
export function leaveAppliedReply(l: ProposedLeave): string {
  return l.needsApproval
    ? `Sent for approval: ${leaveLine(l)}. You will be notified when HR decides; you can follow it on the Leave page.`
    : `Recorded: ${leaveLine(l)}.`;
}

export const LEAVE_EXTRACTION_FAILED_REPLY =
  'I could not read that leave request. Try something like "Casual leave on 26 October" or "Annual leave from Oct 26 to Oct 28", or use the Leave page.';

/** One "needs your attention" item (the dashboard's `attention`), as the reply needs it. */
export type BriefingItem =
  | { kind: 'lop_risk'; severity: string; date: string; cutoff: string }
  | {
      kind: 'timesheet_gap';
      severity: string;
      date: string;
      hours: number;
      requiredHours: number;
      lopCutoff: string | null;
    }
  | {
      kind: 'leave_expiring';
      severity: string;
      available: number;
      carryOverDays: number;
      expiresOn: string;
    }
  | { kind: 'request_waiting'; severity: string; request: { humanId: string; summary: string } };

const briefingLine = (item: BriefingItem): string => {
  const urgent = item.severity === 'urgent' ? 'Urgent: ' : '';
  switch (item.kind) {
    case 'lop_risk':
      return `• ${urgent}${label(item.date)} passed its payroll cutoff (${label(item.cutoff)}) with no timesheet or attendance record and may be deducted as Loss of Pay. Log the hours and ask Payroll for a review.`;
    case 'timesheet_gap':
      return item.lopCutoff
        ? `• ${urgent}Log your hours for ${label(item.date)} by ${label(item.lopCutoff)} (payroll cutoff), or it counts as Loss of Pay.`
        : `• ${urgent}Log your hours for ${label(item.date)}: ${item.hours === 0 ? 'nothing logged' : `${h(item.hours)} of ${h(item.requiredHours)}`}.`;
    case 'leave_expiring':
      return `• You have ${days(item.available)} of annual leave left; only ${days(item.carryOverDays)} carry over after ${label(item.expiresOn)}.`;
    case 'request_waiting':
      return `• ${item.request.humanId} (${item.request.summary}) is waiting for your reply.`;
  }
};

/** "What should I do today?": the dashboard's attention items, most urgent first. */
export function dailyBriefingReply(items: BriefingItem[]): string {
  if (items.length === 0) {
    return 'Nothing needs your attention right now: your timesheet is up to date and no request is waiting for you.';
  }
  return [
    `${items.length === 1 ? 'One thing needs' : `${items.length} things need`} your attention:`,
    ...items.map(briefingLine),
    'The same list is on your dashboard.',
  ].join('\n');
}

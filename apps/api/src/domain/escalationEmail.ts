// Escalation email (UC-07, ADR-017). Pure: code assembles the whole email from
// the ticket draft, the user record, routing config and the payroll records.
// The only model text is P-5's summary and description (and other extracted
// free text); any number in it the employee never typed sends it back to the
// employee's own redacted words, so every figure in the email comes from code.
import {
  type Country,
  EMAIL_LIMITS,
  type EmailDraft,
  EmailDraftSchema,
  type EmailIssueSource,
  type EmploymentType,
  type TicketDraft,
} from '@sd/shared';
import type { ConfigFiles } from '../config/schemas';
import { fillTemplate } from './templates';
import { UNKNOWN } from './ticketSchemas';
import {
  emailDate,
  lateLoggingLines,
  lopDatesText,
  type PayrollFacts,
  payrollEmailLines,
} from './workspaceReplies';

type Templates = ConfigFiles['templates']['templates'];

/** Fixed headings of the email body, in order. */
export const EMAIL_SECTIONS = {
  issue: 'Issue:',
  systemInfo: 'System information:',
  actionTaken: 'Action taken:',
  request: 'Request:',
} as const;

const EMPLOYMENT_WORDS: Record<EmploymentType, string> = {
  full_time: 'full-time',
  contractor: 'contractor',
};

const digitRuns = (text: string) =>
  (text.match(/\d+/g) ?? []).map((run) => run.replace(/^0+(?=\d)/, ''));

/**
 * Digit sequences in `text` that appear in none of the employee's own texts
 * (leading zeros ignored, so "09" matches "9"). Empty means every number in
 * the text was typed by the employee.
 */
export function numbersNotFromEmployee(text: string, employeeTexts: string[]): string[] {
  const typed = new Set(employeeTexts.flatMap(digitRuns));
  return [...new Set(digitRuns(text).filter((run) => !typed.has(run)))];
}

/** One line, at most `max` characters, cut on a word boundary when possible. */
function oneLine(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\x00-\x1f\x7f\s]+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : flat.slice(0, max)).trim();
}

export interface EscalationEmailInput {
  draft: Pick<
    TicketDraft,
    | 'summary'
    | 'description'
    | 'priority'
    | 'priorityFloorApplied'
    | 'fields'
    | 'recordFilledFields'
    | 'alreadyTried'
    | 'errorMessages'
    | 'articlesShown'
  >;
  /** Whether summary and description came from P-5 (false: already the employee's words). */
  fromModel: boolean;
  /** The employee's redacted words, used when the model text fails the number check. */
  fallback: { summary: string; description: string };
  /** Every user turn of the conversation, the current input included. */
  employeeTexts: string[];
  categoryLabel: string;
  subcategoryLabel: string | null;
  /** Field key → description from ticket-schemas.yaml. */
  fieldLabels: Record<string, string>;
  to: EmailDraft['to'];
  employee: {
    name: string;
    address: string;
    department: string;
    jobTitle: string;
    country: Country;
    employmentType: EmploymentType;
  };
  /** Payroll records for a payroll request; 'unavailable' when they could not be read; null otherwise. */
  payroll: PayrollFacts | 'unavailable' | null;
  /** YYYY-MM-DD. */
  today: string;
  templates: Pick<
    Templates,
    | 'email_greeting'
    | 'email_sign_off'
    | 'email_request_lop'
    | 'email_request_default'
    | 'email_records_unavailable'
  >;
}

export interface EscalationEmailResult {
  email: EmailDraft;
  issueSource: EmailIssueSource;
  /** Counts and flags for the trace (never text or figures). */
  systemInfoLines: number;
  actionTakenLines: number;
  recordsUnavailable: boolean;
  /** Model-written items left out because they held numbers the employee never typed. */
  droppedItems: number;
}

export function composeEscalationEmail(input: EscalationEmailInput): EscalationEmailResult {
  const { draft, templates } = input;
  const fromEmployee = (text: string) =>
    numbersNotFromEmployee(text, input.employeeTexts).length === 0;
  let droppedItems = 0;
  const keep = (items: string[]) => {
    const kept = items.filter(fromEmployee);
    droppedItems += items.length - kept.length;
    return kept;
  };

  // Issue and subject: P-5's text unless it holds a number the employee never typed.
  const modelOk = input.fromModel && fromEmployee(draft.summary) && fromEmployee(draft.description);
  const issueSource: EmailIssueSource = modelOk ? 'model' : 'employee_words';
  const issue = modelOk ? draft : input.fallback;
  const issueText = issue.description.trim() || issue.summary.trim();

  // System information (code).
  const e = input.employee;
  const known = Object.entries(draft.fields).filter(
    ([key, value]) => value !== UNKNOWN && value.trim() !== '' && key !== 'question',
  );
  const fieldLines = known
    .filter(([key, value]) => draft.recordFilledFields.includes(key) || fromEmployee(value))
    .map(([key, value]) => `${input.fieldLabels[key] ?? key}: ${value}`);
  droppedItems += known.length - fieldLines.length;
  const category = input.subcategoryLabel
    ? `${input.categoryLabel} / ${input.subcategoryLabel}`
    : input.categoryLabel;
  const recordsUnavailable = input.payroll === 'unavailable';
  const payrollLines =
    input.payroll === null
      ? []
      : input.payroll === 'unavailable'
        ? [templates.email_records_unavailable]
        : payrollEmailLines(input.payroll);
  const systemInfo = [
    `Employee: ${e.name}, ${e.jobTitle}, ${e.department}, ${e.country}, ${EMPLOYMENT_WORDS[e.employmentType]}`,
    `Category: ${category}, priority ${draft.priority}${draft.priorityFloorApplied ? ' (set by a company rule)' : ''}`,
    ...fieldLines,
    ...keep(draft.errorMessages).map((m) => `Error message: ${m}`),
    ...payrollLines,
    `Records as of ${emailDate(input.today)}.`,
  ];

  // Action taken (code).
  const facts = input.payroll !== null && input.payroll !== 'unavailable' ? input.payroll : null;
  const titles = [...new Set(draft.articlesShown.map((a) => a.docTitle))];
  const actions = [
    ...(titles.length > 0 ? [`Policy shown: ${titles.join('; ')}.`] : []),
    ...keep(draft.alreadyTried),
    ...(facts ? lateLoggingLines(facts) : []),
  ];
  const actionTaken = [
    `Asked the AI assistant on ${emailDate(input.today)}.`,
    ...(actions.length > 0 ? actions : ['Nothing else yet.']),
  ];

  // Request: the employee's question, else the LOP review, else the default.
  const question = draft.fields.question;
  const questionOk = question !== undefined && question !== UNKNOWN && question.trim() !== '';
  if (questionOk && !fromEmployee(question)) droppedItems += 1;
  const request =
    questionOk && fromEmployee(question)
      ? question.trim()
      : facts && facts.lopDays.length > 0
        ? fillTemplate(templates.email_request_lop, { dates: lopDatesText(facts) })
        : templates.email_request_default;

  const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
  const body = [
    fillTemplate(templates.email_greeting, { queueLabel: input.to.label }),
    '',
    EMAIL_SECTIONS.issue,
    issueText,
    '',
    EMAIL_SECTIONS.systemInfo,
    bullets(systemInfo),
    '',
    EMAIL_SECTIONS.actionTaken,
    bullets(actionTaken),
    '',
    EMAIL_SECTIONS.request,
    request,
    '',
    fillTemplate(templates.email_sign_off, { employeeName: e.name, department: e.department }),
  ]
    .join('\n')
    .slice(0, EMAIL_LIMITS.body);

  const email = EmailDraftSchema.parse({
    to: input.to,
    from: { name: e.name, address: e.address },
    subject: oneLine(`${input.categoryLabel} request: ${issue.summary}`, EMAIL_LIMITS.subject),
    body,
    issueSource,
    recordsAsOf: input.today,
  });
  return {
    email,
    issueSource,
    systemInfoLines: systemInfo.length,
    actionTakenLines: actionTaken.length,
    recordsUnavailable,
    droppedItems,
  };
}

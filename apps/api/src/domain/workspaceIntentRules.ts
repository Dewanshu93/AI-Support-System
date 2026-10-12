// Code backstop for the P-1 workspace intent (UC-04, ADR-020 follow-up). P-1
// proposes which records agent a turn needs; a model that leaves the field out
// (the local 8B model did for "How many LOP this month?") would send a
// question about the employee's own records to policy Q&A, where it cannot be
// answered. Only used when the model gave no workspace intent at all: an explicit
// "none" from the model stands. Pure: no I/O.
/** The records agents a rule can pick (a subset of P-1's workspace intents). */
export type InferredWorkspaceIntent =
  'timesheet_log' | 'timesheet_status' | 'payroll_explain' | 'request_status';

/** The employee is asking about their own records (or a period of them). */
const ABOUT_ME =
  /\b(my|me|mine|i|i'm|i've|i am|i have)\b|\b(this|last|previous|current) (month|week|pay ?period|payslip)\b/;
const PAY =
  /\b(lop|loss of pay|salary|payslip|pay ?slip|paycheck|pay cut|deductions?|deducted|net pay)\b/;
const LOG_HOURS = /\b(log|add|book|enter|record|fill in)\b.*\b\d+(\.\d+)?\s*(h|hrs?|hours?)\b/;
const TIMESHEET =
  /\b(timesheets?|time ?sheet|hours logged|missing (days|hours)|days (am i )?missing)\b/;
const MY_REQUESTS = /\bmy (open |pending )?(requests?|tickets?|cases?)\b|\bstatus of my\b/;

/**
 * The records agent a message asks for, by deterministic rules; null when none
 * applies (the turn stays with policy Q&A). Order: actions before questions.
 */
export function inferWorkspaceIntent(message: string): InferredWorkspaceIntent | null {
  const text = message.toLowerCase();
  if (LOG_HOURS.test(text)) return 'timesheet_log';
  if (PAY.test(text) && ABOUT_ME.test(text)) return 'payroll_explain';
  if (TIMESHEET.test(text) && ABOUT_ME.test(text)) return 'timesheet_status';
  if (MY_REQUESTS.test(text)) return 'request_status';
  return null;
}

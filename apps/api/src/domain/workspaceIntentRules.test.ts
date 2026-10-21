import { inferWorkspaceIntent } from './workspaceIntentRules';

describe('inferWorkspaceIntent (backstop when P-1 gives no workspace intent)', () => {
  it.each([
    // The reported case (local model, Pro off).
    ['How Many LOP this month?', 'payroll_explain'],
    ['Why was my salary reduced?', 'payroll_explain'],
    ['What deductions are on my payslip?', 'payroll_explain'],
    ['I have a loss of pay on last payslip', 'payroll_explain'],
    ['Log 8 hours for the Banking Module on Friday', 'timesheet_log'],
    ['please add 4.5h to API Integration today', 'timesheet_log'],
    ['Which days am I missing on my timesheet?', 'timesheet_status'],
    ['Show my pending requests', 'request_status'],
    ['What is the status of my ticket?', 'request_status'],
    // UC-11 / UC-12.
    ['How many casual leaves do I have?', 'leave_balance'],
    ['how much annual leave is left for me', 'leave_balance'],
    ['Apply leave for Oct 24-25', 'leave_apply'],
    ['I need a day off tomorrow', 'leave_apply'],
    ['What should I do today?', 'daily_briefing'],
    ['Is there anything that needs my attention?', 'daily_briefing'],
  ])('%s → %s', (message, intent) => {
    expect(inferWorkspaceIntent(message)).toBe(intent);
  });

  it.each([
    // Policy questions stay with policy Q&A (no reference to the employee's own records).
    'What is the LOP policy?',
    'How is loss of pay calculated?',
    'What is the timesheet policy?',
    'How many days of annual leave do employees get?',
    'What is the casual leave policy?',
    // The entitlement is policy; what is left is the balance.
    'How many vacation days do I get?',
    'How do I apply for leave?',
    'Can I take leave next month?',
    'My laptop will not turn on',
    'I cannot access the VPN',
  ])('%s → no records agent', (message) => {
    expect(inferWorkspaceIntent(message)).toBeNull();
  });
});

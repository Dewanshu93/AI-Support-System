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
  ])('%s → %s', (message, intent) => {
    expect(inferWorkspaceIntent(message)).toBe(intent);
  });

  it.each([
    // Policy questions stay with policy Q&A (no reference to the employee's own records).
    'What is the LOP policy?',
    'How is loss of pay calculated?',
    'What is the timesheet policy?',
    'How many days of annual leave do employees get?',
    'My laptop will not turn on',
    'I cannot access the VPN',
  ])('%s → no records agent', (message) => {
    expect(inferWorkspaceIntent(message)).toBeNull();
  });
});

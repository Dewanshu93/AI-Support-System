// Shared test data for web unit and component tests (not imported by app code).
import type { TicketDraft } from '@sd/shared';

export const DRAFT: TicketDraft = {
  domain: 'IT',
  category: 'hardware',
  subcategory: 'laptop_fault',
  queue: { id: 'it_hardware', label: 'IT Hardware' },
  priority: 'high',
  aiUrgency: 'medium',
  priorityFloorApplied: 'org_impact',
  impactScope: 'me',
  summary: 'Laptop does not power on',
  description: 'The laptop does not power on after a battery drain.',
  alreadyTried: ['charging overnight'],
  errorMessages: [],
  fields: {
    device_model: 'Dell Latitude 7440',
    symptoms: 'Does not power on',
    started_at: 'unknown',
    asset_tag: 'unknown',
  },
  aiFilledFields: ['device_model', 'symptoms'],
  requiredMissing: ['asset_tag'],
  articlesShown: [],
  restricted: false,
  recordFilledFields: [],
};

/** A payroll draft with the escalation email code drafted (UC-07). */
export const EMAIL_DRAFT: TicketDraft = {
  ...DRAFT,
  domain: 'HR',
  category: 'payroll',
  subcategory: null,
  queue: { id: 'hr_payroll', label: 'Payroll' },
  priority: 'medium',
  priorityFloorApplied: null,
  summary: 'Loss of Pay deduction on the latest payslip',
  description: 'The employee asks payroll to review a Loss of Pay deduction.',
  fields: {
    pay_period: '1 Sept – 15 Sept 2026 (paid 15 Sept 2026)',
    question: 'Please review my Loss of Pay deduction.',
  },
  aiFilledFields: ['question'],
  requiredMissing: [],
  recordFilledFields: ['pay_period'],
  email: {
    to: { queueId: 'hr_payroll', label: 'Payroll', address: 'payroll@example.com' },
    from: { name: 'Priya Shah', address: 'priya.shah@example.com' },
    subject: 'Payroll request: Loss of Pay deduction on the latest payslip',
    body: 'Hello Payroll team,\n\nIssue:\nThe employee asks payroll to review a Loss of Pay deduction.',
    issueSource: 'model',
    recordsAsOf: '2026-09-15',
  },
};

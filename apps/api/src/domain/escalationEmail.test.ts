import { loadConfig } from '../config';
import { VALID_ENV } from '../../test/helpers/config';
import {
  composeEscalationEmail,
  EMAIL_SECTIONS,
  type EscalationEmailInput,
  numbersNotFromEmployee,
} from './escalationEmail';
import type { PayrollFacts } from './workspaceReplies';

const templates = loadConfig({ ...VALID_ENV }).templates.templates;

const facts = (over: Partial<PayrollFacts['lopDays'][number]> = {}): PayrollFacts => ({
  paidByAgency: false,
  currency: 'USD',
  payslips: [
    {
      periodStart: '2026-09-16',
      periodEnd: '2026-09-30',
      payDate: '2026-09-30',
      gross: 4333.33,
      net: 2571.83,
      deductions: [
        { code: 'lop', label: 'Loss of Pay (1 day)', amount: 400, dates: ['2026-09-11'] },
      ],
    },
  ],
  lopDays: [
    {
      date: '2026-09-11',
      amount: 400,
      payDate: '2026-09-30',
      attendance: 'absent',
      attendanceNote: 'No badge-in',
      hoursNow: 8,
      lateHours: 8,
      requiredHours: 8,
      ...over,
    },
  ],
});

function input(over: Partial<EscalationEmailInput> = {}): EscalationEmailInput {
  return {
    draft: {
      summary: 'Loss of Pay applied for a day the employee worked',
      description: 'The employee says a Loss of Pay deduction was applied in error.',
      priority: 'medium',
      priorityFloorApplied: null,
      fields: { pay_period: '16 Sept – 30 Sept (paid 30 Sept)', question: 'unknown' },
      recordFilledFields: ['pay_period'],
      alreadyTried: [],
      errorMessages: [],
      articlesShown: [],
    },
    fromModel: true,
    fallback: {
      summary: 'Contact payroll about my LOP',
      description: 'Contact payroll about my LOP',
    },
    employeeTexts: ['Contact payroll about my LOP'],
    categoryLabel: 'Pay and expenses',
    subcategoryLabel: 'Payslip query',
    fieldLabels: { pay_period: 'Pay period or expense date concerned', question: 'Question' },
    to: { queueId: 'hr_payroll', label: 'Payroll', address: 'payroll@example.com' },
    employee: {
      name: 'Priya Shah',
      address: 'priya.shah@example.com',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      country: 'US',
      employmentType: 'full_time',
    },
    payroll: facts(),
    today: '2026-10-08',
    templates,
    ...over,
  };
}

describe('numbersNotFromEmployee', () => {
  it('reports digit runs the employee never typed, ignoring leading zeros', () => {
    expect(numbersNotFromEmployee('Refund $120 for 11 Sept', ['LOP on 11 Sept'])).toEqual(['120']);
    expect(
      numbersNotFromEmployee('Error 0x80070005 on 9 Sept', ['got 0x80070005 on 09/09']),
    ).toEqual([]);
    expect(numbersNotFromEmployee('no numbers', [])).toEqual([]);
  });
});

describe('composeEscalationEmail', () => {
  it('builds the body with fixed headings in order, greeting and sign-off from templates', () => {
    const { email } = composeEscalationEmail(input());
    const at = (s: string) => email.body.indexOf(s);
    expect(email.body.startsWith('Hello Payroll team,\n')).toBe(true);
    expect(at(EMAIL_SECTIONS.issue)).toBeGreaterThan(0);
    expect(at(EMAIL_SECTIONS.systemInfo)).toBeGreaterThan(at(EMAIL_SECTIONS.issue));
    expect(at(EMAIL_SECTIONS.actionTaken)).toBeGreaterThan(at(EMAIL_SECTIONS.systemInfo));
    expect(at(EMAIL_SECTIONS.request)).toBeGreaterThan(at(EMAIL_SECTIONS.actionTaken));
    expect(email.body.endsWith('Regards,\nPriya Shah\nEngineering')).toBe(true);
    expect(email.to.address).toBe('payroll@example.com');
    expect(email.from).toEqual({ name: 'Priya Shah', address: 'priya.shah@example.com' });
    expect(email.recordsAsOf).toBe('2026-10-08');
  });

  it('writes every figure from the records and omits unknown fields', () => {
    const { email, issueSource } = composeEscalationEmail(input());
    expect(issueSource).toBe('model');
    expect(email.body).toContain(
      '- Employee: Priya Shah, Software Engineer, Engineering, US, full-time',
    );
    expect(email.body).toContain('- Category: Pay and expenses / Payslip query, priority medium\n');
    expect(email.body).toContain('- Pay period or expense date concerned: 16 Sept – 30 Sept');
    expect(email.body).not.toContain('Question:');
    expect(email.body).toContain(
      '- Loss of Pay $400.00 for Fri 11 Sept 2026 (payslip paid Wed 30 Sept 2026); attendance: absent (No badge-in); timesheet now 8 of 8 h, logged after the pay period closed.',
    );
    expect(email.body).toContain('- Records as of Thu 8 Oct 2026.');
    expect(email.body).toContain('- Logged 8 h for Fri 11 Sept 2026 after the pay period closed.');
    expect(email.body).toContain(
      'Please review the Loss of Pay deduction for Fri 11 Sept 2026 and correct it if it was applied in error.',
    );
  });

  it('marks a priority floor and lists policies shown and steps tried', () => {
    const base = input();
    const { email } = composeEscalationEmail({
      ...base,
      draft: {
        ...base.draft,
        priorityFloorApplied: 'payroll_error',
        alreadyTried: ['Checked the payslip'],
        articlesShown: [{ documentId: 'd1', docTitle: 'Payroll policy' }],
      },
    });
    expect(email.body).toContain('priority medium (set by a company rule)');
    expect(email.body).toContain('- Policy shown: Payroll policy.');
    expect(email.body).toContain('- Checked the payslip');
    expect(email.body).not.toContain('Nothing else yet.');
  });

  it('keeps the subject to one line of at most 150 characters, cut on a word boundary', () => {
    const base = input();
    const long = `${'word '.repeat(60)}end`;
    const { email } = composeEscalationEmail({
      ...base,
      draft: { ...base.draft, summary: `Line one\nline two ${long}` },
    });
    expect(email.subject.length).toBeLessThanOrEqual(150);
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject.startsWith('Pay and expenses request: Line one line two word')).toBe(true);
    expect(email.subject.endsWith('word')).toBe(true);
  });

  it('falls back to the employee words when the model adds a number', () => {
    const base = input();
    for (const description of ['A refund of $120 is due.', 'Missing 11 hours.']) {
      const result = composeEscalationEmail({ ...base, draft: { ...base.draft, description } });
      expect(result.issueSource).toBe('employee_words');
      expect(result.email.issueSource).toBe('employee_words');
      expect(result.email.subject).toBe('Pay and expenses request: Contact payroll about my LOP');
      expect(result.email.body).not.toContain(description);
    }
  });

  it("keeps the employee's own numbers", () => {
    const base = input();
    const description = 'Error 0x80070005 since 11 Sept.';
    const result = composeEscalationEmail({
      ...base,
      employeeTexts: ['I get 0x80070005 since 11 Sept'],
      draft: { ...base.draft, description },
    });
    expect(result.issueSource).toBe('model');
    expect(result.email.body).toContain(description);
  });

  it('uses the employee words when P-5 did not run', () => {
    expect(composeEscalationEmail(input({ fromModel: false })).issueSource).toBe('employee_words');
  });

  it('drops model items with invented numbers but keeps record-filled fields', () => {
    const base = input();
    const result = composeEscalationEmail({
      ...base,
      draft: {
        ...base.draft,
        alreadyTried: ['Called payroll 3 times'],
        errorMessages: ['E42'],
        fields: { pay_period: '16 Sept – 30 Sept', question: 'Refund 400 dollars?' },
      },
    });
    expect(result.email.body).not.toContain('3 times');
    expect(result.email.body).not.toContain('E42');
    expect(result.email.body).not.toContain('Refund 400');
    expect(result.email.body).toContain('16 Sept – 30 Sept');
    expect(result.droppedItems).toBe(3);
  });

  it('chooses the request: question, else LOP dates, else default', () => {
    const base = input();
    const withQuestion = composeEscalationEmail({
      ...base,
      draft: { ...base.draft, fields: { ...base.draft.fields, question: 'Please refund the LOP' } },
    });
    expect(withQuestion.email.body).toContain('Request:\nPlease refund the LOP\n');
    const noLop = composeEscalationEmail(input({ payroll: { ...facts(), lopDays: [] } }));
    expect(noLop.email.body).toContain(
      'Request:\nPlease look into this and let me know the next steps.',
    );
    expect(noLop.email.body).toContain('No Loss of Pay deduction on the recent payslips.');
    expect(noLop.email.body).toContain('- Nothing else yet.');
  });

  it('covers contractors, unavailable records and non-payroll requests', () => {
    const contractor = composeEscalationEmail(
      input({ payroll: { paidByAgency: true, currency: null, payslips: [], lopDays: [] } }),
    );
    expect(contractor.email.body).toContain('- Paid by agency; no company payslips.');

    const unavailable = composeEscalationEmail(input({ payroll: 'unavailable' }));
    expect(unavailable.recordsUnavailable).toBe(true);
    expect(unavailable.email.body).toContain(
      '- My pay records could not be read when this email was drafted.',
    );

    const it = composeEscalationEmail(input({ payroll: null }));
    expect(it.email.body).not.toContain('payslip');
    expect(it.recordsUnavailable).toBe(false);
  });

  it('reports counts only for the trace', () => {
    const result = composeEscalationEmail(input());
    expect(result.systemInfoLines).toBe(6);
    expect(result.actionTakenLines).toBe(2);
  });
});

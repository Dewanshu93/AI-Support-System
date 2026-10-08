import {
  EMAIL_LIMITS,
  EmailBodySchema,
  EmailSubjectSchema,
  TicketConfirmResponseSchema,
  TicketDetailResponseSchema,
  TicketDraftConfirmRequestSchema,
  TicketDraftSchema,
} from './tickets';

const baseDraft = {
  domain: 'HR',
  category: 'payroll',
  subcategory: null,
  queue: { id: 'hr_payroll', label: 'Payroll' },
  priority: 'medium',
  aiUrgency: 'medium',
  priorityFloorApplied: null,
  impactScope: 'me',
  summary: 'Loss of Pay applied in error',
  description: 'The employee reports a Loss of Pay deduction they believe is wrong.',
  alreadyTried: [],
  errorMessages: [],
  fields: { pay_period: 'unknown' },
  aiFilledFields: [],
  requiredMissing: [],
  articlesShown: [],
  restricted: false,
};

const email = {
  to: { queueId: 'hr_payroll', label: 'Payroll', address: 'payroll@example.com' },
  from: { name: 'Priya Shah', address: 'priya@example.com' },
  subject: 'Payroll request: Loss of Pay applied in error',
  body: 'Hello Payroll team,\n\nIssue: ...',
  issueSource: 'model',
  recordsAsOf: '2026-10-08',
};

describe('EmailSubjectSchema', () => {
  it('trims and accepts one line', () => {
    expect(EmailSubjectSchema.parse('  Payroll request  ')).toBe('Payroll request');
  });

  it.each([
    ['a newline', 'Payroll\nBcc: x@example.com'],
    ['a carriage return', 'Payroll\rrequest'],
    ['a tab', 'Payroll\trequest'],
    ['an empty value', '   '],
    ['too many characters', 'a'.repeat(EMAIL_LIMITS.subject + 1)],
  ])('rejects %s', (_name, value) => {
    expect(EmailSubjectSchema.safeParse(value).success).toBe(false);
  });

  it('accepts exactly the limit', () => {
    expect(EmailSubjectSchema.safeParse('a'.repeat(EMAIL_LIMITS.subject)).success).toBe(true);
  });
});

describe('EmailBodySchema', () => {
  it('stores CRLF and CR as LF', () => {
    expect(EmailBodySchema.parse('Hello,\r\nline two\rline three')).toBe(
      'Hello,\nline two\nline three',
    );
  });

  it('rejects an empty body and one over the limit', () => {
    expect(EmailBodySchema.safeParse(' \n ').success).toBe(false);
    expect(EmailBodySchema.safeParse('a'.repeat(EMAIL_LIMITS.body + 1)).success).toBe(false);
    expect(EmailBodySchema.safeParse('a'.repeat(EMAIL_LIMITS.body)).success).toBe(true);
  });
});

describe('TicketDraftSchema', () => {
  it('parses an older draft without email and defaults recordFilledFields', () => {
    const draft = TicketDraftSchema.parse(baseDraft);
    expect(draft.email).toBeUndefined();
    expect(draft.recordFilledFields).toEqual([]);
  });

  it('keeps the email and record-filled fields', () => {
    const draft = TicketDraftSchema.parse({
      ...baseDraft,
      recordFilledFields: ['pay_period'],
      email,
    });
    expect(draft.email).toEqual(email);
    expect(draft.recordFilledFields).toEqual(['pay_period']);
  });

  it('rejects an email with an invalid recipient address', () => {
    const bad = { ...email, to: { ...email.to, address: 'not-an-address' } };
    expect(TicketDraftSchema.safeParse({ ...baseDraft, email: bad }).success).toBe(false);
  });
});

describe('TicketDraftConfirmRequestSchema', () => {
  it('accepts a request without email (send the drafted text)', () => {
    expect(TicketDraftConfirmRequestSchema.parse({})).toEqual({ edits: {} });
  });

  it('accepts subject and body, normalising newlines', () => {
    const parsed = TicketDraftConfirmRequestSchema.parse({
      email: { subject: ' Edited subject ', body: 'Line one\r\nLine two' },
    });
    expect(parsed.email).toEqual({ subject: 'Edited subject', body: 'Line one\nLine two' });
  });

  it.each([
    ['an extra `to` key', { subject: 's', body: 'b', to: 'attacker@example.com' }],
    ['a subject with a newline', { subject: 'a\nb', body: 'b' }],
    ['an empty subject', { subject: '', body: 'b' }],
    ['a body over the limit', { subject: 's', body: 'a'.repeat(EMAIL_LIMITS.body + 1) }],
  ])('rejects %s', (_name, value) => {
    expect(TicketDraftConfirmRequestSchema.safeParse({ email: value }).success).toBe(false);
  });
});

describe('ticket responses', () => {
  it('defaults emails to an empty list on the detail response', () => {
    const detail = TicketDetailResponseSchema.parse({
      ticket: {
        id: 't1',
        humanId: 'HR-1001',
        summary: 's',
        status: 'new',
        priority: 'medium',
        updatedAt: '2026-10-08T00:00:00.000Z',
        conversationId: 'c1',
        domain: 'HR',
        category: 'payroll',
        subcategory: null,
        queueLabel: 'Payroll',
        fields: {},
        restricted: false,
        createdAt: '2026-10-08T00:00:00.000Z',
        resolvedAt: null,
      },
      events: [],
    });
    expect(detail.emails).toEqual([]);
  });

  it('accepts a confirm response with, without and with a null email', () => {
    const ticket = {
      id: 't1',
      humanId: 'HR-1001',
      queue: 'hr_payroll',
      priority: 'medium',
      status: 'new',
    };
    expect(TicketConfirmResponseSchema.safeParse({ ticket }).success).toBe(true);
    expect(TicketConfirmResponseSchema.safeParse({ ticket, email: null }).success).toBe(true);
    expect(
      TicketConfirmResponseSchema.safeParse({
        ticket,
        email: { id: 'e1', status: 'recorded', mode: 'mock' },
      }).success,
    ).toBe(true);
  });
});

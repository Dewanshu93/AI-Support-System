// W3-07 component tests, rendered to static HTML: the status selector, the
// classification editor and the ticket workspace. The edit logic is the pure
// classificationChange (lib/agentTicket.test.ts); clicks are covered end to end.
import type { AgentTicketDetailResponse } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentTicketView } from './AgentTicketDetail';
import { ClassificationEditor } from './ClassificationEditor';
import { StatusSelector } from './StatusSelector';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const noop = () => undefined;
const OPTIONS: AgentTicketDetailResponse['categoryOptions'] = [
  {
    id: 'hardware',
    label: 'Hardware',
    domain: 'IT',
    subcategories: [
      { id: 'battery', label: 'Battery or power' },
      { id: 'laptop_fault', label: 'Laptop fault' },
    ],
  },
  {
    id: 'payroll',
    label: 'Pay and expenses',
    domain: 'HR',
    subcategories: [{ id: 'payslip', label: 'Payslip' }],
  },
];
const CURRENT = { category: 'hardware', subcategory: 'battery', priority: 'high' as const };

describe('StatusSelector', () => {
  it('offers the current status and only the allowed moves', () => {
    const html = renderToStaticMarkup(
      <StatusSelector
        status="new"
        allowed={['in_progress', 'resolved']}
        busy={false}
        onChange={noop}
      />,
    );
    expect(html).toContain('<option value="new" selected="">New</option>');
    expect(html).toContain('→ In progress');
    expect(html).toContain('→ Resolved');
    expect(html).not.toContain('Closed');
    expect(html).not.toContain('disabled=""');
  });

  it('is read-only when no move is allowed (closed) and while busy', () => {
    expect(
      renderToStaticMarkup(
        <StatusSelector status="closed" allowed={[]} busy={false} onChange={noop} />,
      ),
    ).toContain('disabled=""');
    expect(
      renderToStaticMarkup(
        <StatusSelector status="new" allowed={['resolved']} busy onChange={noop} />,
      ),
    ).toContain('disabled=""');
  });
});

describe('ClassificationEditor', () => {
  const render = (restricted = false) =>
    renderToStaticMarkup(
      <ClassificationEditor
        current={CURRENT}
        options={OPTIONS}
        restricted={restricted}
        busy={false}
        onSave={noop}
      />,
    );

  it('shows the current classification, categories grouped by domain', () => {
    const html = render();
    expect(html).toContain('<optgroup label="IT">');
    expect(html).toContain('<optgroup label="HR">');
    expect(html).toContain('<option value="hardware" selected="">Hardware</option>');
    expect(html).toContain('<option value="battery" selected="">Battery or power</option>');
    expect(html).toContain('<option value="high" selected="">High</option>');
  });

  it('nothing to save until something changes', () => {
    expect(render()).toMatch(/data-testid="classification-save"[^>]*disabled=""/);
  });

  it('a confidential case cannot change category', () => {
    const html = render(true);
    expect(html).toMatch(/data-testid="classification-category"[^>]*disabled=""/);
    expect(html).toContain('keeps its category and queue');
  });
});

const DETAIL: AgentTicketDetailResponse = {
  ticket: {
    id: 'a'.repeat(24),
    humanId: 'HR-0101',
    conversationId: 'b'.repeat(24),
    requester: {
      id: 'c'.repeat(24),
      name: 'Priya Shah',
      email: 'priya.shah@example.com',
      country: 'US',
      employmentType: 'full_time',
      department: 'Engineering',
    },
    domain: 'HR',
    category: 'payroll',
    subcategory: 'payslip',
    queue: 'hr_payroll',
    queueLabel: 'Payroll',
    priority: 'medium',
    aiUrgency: 'medium',
    priorityFloorApplied: null,
    status: 'new',
    summary: 'Loss of Pay deduction review',
    agentBrief: 'Priya logged 11 Sept late and asks for an LOP review.',
    agentAssist: {
      status: 'generated',
      headline: 'Review LOP for 11 Sept',
      firstChecks: ['Confirm the late timesheet entry'],
    },
    fields: { pay_period: 'Wed 16 Sept – Wed 30 Sept', amount: 'unknown' },
    restricted: false,
    duplicateOf: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-12T09:00:00.000Z',
    resolvedAt: null,
  },
  aiFilledFields: ['pay_period'],
  articlesShown: [{ documentId: 'd'.repeat(24), docTitle: 'Loss of Pay (LOP)' }],
  events: [
    {
      id: 'e'.repeat(24),
      type: 'note',
      visibility: 'internal',
      actorId: null,
      body: 'Checking with payroll.',
      field: null,
      oldValue: null,
      newValue: null,
      createdAt: '2026-10-12T09:05:00.000Z',
    },
  ],
  transcript: [
    {
      id: 'f'.repeat(24),
      role: 'user',
      content: 'Why was my salary reduced?',
      createdAt: '2026-10-12T08:50:00.000Z',
    },
  ],
  citationsShown: [],
  emails: [],
  allowedStatuses: ['in_progress', 'waiting_on_employee', 'resolved'],
  categoryOptions: OPTIONS,
};

describe('AgentTicketView', () => {
  const render = (data = DETAIL) =>
    renderToStaticMarkup(
      <AgentTicketView
        data={data}
        busy={false}
        notice={null}
        onStatus={noop}
        onClassify={noop}
        onGenerate={async () => null}
        onSend={async () => true}
      />,
    );

  it('shows the AI brief, first checks, AI-filled markers, articles shown and internal notes', () => {
    const html = render();
    expect(html).toContain('Review LOP for 11 Sept');
    expect(html).toContain('Priya logged 11 Sept late');
    expect(html).toContain('Confirm the late timesheet entry');
    expect(html).toMatch(/Pay period.*data-testid="field-ai"/);
    expect(html).toContain('Not given'); // an unknown field
    expect(html).toContain('Loss of Pay (LOP)');
    expect(html).toContain('Internal note');
    expect(html).toContain('Checking with payroll.');
    expect(html).toContain('data-testid="generate-draft"');
  });

  it('a confidential case: no AI summary, no draft button, lock badge', () => {
    const html = render({
      ...DETAIL,
      ticket: {
        ...DETAIL.ticket,
        restricted: true,
        agentBrief: '',
        agentAssist: { status: 'skipped', headline: null, firstChecks: [] },
      },
    });
    expect(html).toContain('no AI summary');
    expect(html).not.toContain('data-testid="generate-draft"');
    expect(html).toContain('Confidential');
  });

  it('a P-6 fallback says the brief is the employee description', () => {
    const html = render({
      ...DETAIL,
      ticket: {
        ...DETAIL.ticket,
        agentAssist: { status: 'fallback', headline: null, firstChecks: [] },
      },
    });
    expect(html).toContain('this is the employee&#x27;s description');
  });
});

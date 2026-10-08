import type { TicketDetailResponse } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailCard } from './EmailCard';
import { TicketRows } from './MyTickets';
import { TicketDetailView } from './TicketDetail';

const DATA: TicketDetailResponse = {
  ticket: {
    id: '6ac4eacc592a1f25e55be24e',
    humanId: 'IT-0012',
    summary: 'Laptop does not power on',
    status: 'waiting_on_employee',
    priority: 'high',
    updatedAt: '2026-10-06T10:00:00.000Z',
    conversationId: '6ac4eac6592a1f25e55be249',
    domain: 'IT',
    category: 'hardware',
    subcategory: 'laptop_fault',
    queueLabel: 'IT Hardware',
    fields: { device_model: 'Dell Latitude 7440', asset_tag: 'unknown' },
    restricted: false,
    createdAt: '2026-10-06T09:00:00.000Z',
    resolvedAt: null,
  },
  events: [
    { id: 'e1', type: 'created', body: null, createdAt: '2026-10-06T09:00:00.000Z' },
    {
      id: 'e2',
      type: 'reply',
      body: 'Please bring the laptop to the IT desk.',
      createdAt: '2026-10-06T10:00:00.000Z',
    },
  ],
  emails: [],
};

describe('employee ticket views', () => {
  it('shows status, team, known fields, the public timeline and the conversation link', () => {
    const html = renderToStaticMarkup(<TicketDetailView data={DATA} />);
    expect(html).toContain('IT-0012');
    expect(html).toMatch(/data-testid="ticket-status" data-status="waiting_on_employee"/);
    expect(html).toContain('Waiting for you');
    expect(html).toContain('IT Hardware');
    expect(html).toContain('Dell Latitude 7440');
    expect(html).not.toContain('Asset tag'); // "unknown" fields are hidden
    expect(html.match(/data-testid="ticket-event"/g)).toHaveLength(2);
    expect(html).toContain('Please bring the laptop to the IT desk.');
    expect(html).toContain('href="/chat/6ac4eac6592a1f25e55be249"');
    expect(html).not.toContain('Confidential');
  });

  it('marks restricted cases as confidential', () => {
    const html = renderToStaticMarkup(
      <TicketDetailView data={{ ...DATA, ticket: { ...DATA.ticket, restricted: true } }} />,
    );
    expect(html).toContain('Confidential');
  });

  it('shows the escalation email with the demo-delivery badge and edit marker (UC-07)', () => {
    const html = renderToStaticMarkup(
      <TicketDetailView
        data={{
          ...DATA,
          events: [
            ...DATA.events,
            {
              id: 'e3',
              type: 'email_sent',
              body: 'Email sent to IT Hardware',
              createdAt: '2026-10-06T09:01:00.000Z',
            },
          ],
          emails: [
            {
              id: 'm1',
              to: { label: 'IT Hardware', address: 'it-support@example.com' },
              subject: 'Laptop does not power on',
              body: 'Hello IT Hardware team,\n\nIssue:\nThe laptop does not power on.',
              status: 'recorded',
              mode: 'mock',
              edited: { subject: false, body: true },
              createdAt: '2026-10-06T09:01:00.000Z',
              deliveredAt: '2026-10-06T09:01:00.000Z',
            },
          ],
        }}
      />,
    );
    expect(html).toContain('data-testid="ticket-emails"');
    expect(html).toMatch(/data-testid="ticket-email" data-status="recorded"/);
    expect(html).toContain('Recorded (demo delivery)');
    expect(html).toContain('To IT Hardware &lt;it-support@example.com&gt;');
    expect(html).toContain('Edited by you');
    expect(html).toContain('Hello IT Hardware team,');
    expect(html).toContain('Email sent'); // the timeline label
  });

  it('has no emails section when the ticket has none', () => {
    expect(renderToStaticMarkup(<TicketDetailView data={DATA} />)).not.toContain('ticket-emails');
  });

  it('a failed email says the request was still created', () => {
    const html = renderToStaticMarkup(
      <EmailCard
        email={{
          id: 'm1',
          to: { label: 'Payroll', address: 'payroll@example.com' },
          subject: 'LOP review',
          body: 'Hello',
          status: 'failed',
          mode: 'smtp',
          edited: { subject: false, body: false },
          createdAt: '2026-10-06T09:01:00.000Z',
          deliveredAt: null,
        }}
      />,
    );
    expect(html).toContain('Not delivered');
    expect(html).toContain('Your request was still created');
    expect(html).not.toContain('Edited by you');
  });

  it('lists tickets with links, priority and status badges', () => {
    const html = renderToStaticMarkup(<TicketRows items={[DATA.ticket]} />);
    expect(html).toContain('href="/tickets/6ac4eacc592a1f25e55be24e"');
    expect(html).toContain('data-human-id="IT-0012"');
    expect(html).toContain('High');
    expect(html).toContain('Waiting for you');
  });
});

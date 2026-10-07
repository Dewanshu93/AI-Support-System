// What the employee sees before confirming a copilot timesheet action (UC-05).
import type { TimesheetAction } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionCard } from './ActionCard';

const ACTION: TimesheetAction = {
  kind: 'timesheet_log',
  entries: [
    {
      date: '2026-09-11',
      projectId: 'a'.repeat(24),
      projectName: 'Banking Module',
      projectColor: '#4f46e5',
      hours: 8,
      previousHours: 0,
      dayTotalAfter: 8,
      late: true,
    },
    {
      date: '2026-10-05',
      projectId: 'a'.repeat(24),
      projectName: 'Banking Module',
      projectColor: '#4f46e5',
      hours: 2,
      previousHours: 6,
      dayTotalAfter: 4,
      late: false,
    },
  ],
};

const render = (action = ACTION) =>
  renderToStaticMarkup(<ActionCard conversationId="c" action={action} onDone={() => undefined} />);

describe('ActionCard', () => {
  it('lists every entry with day, project, hours and the day total after', () => {
    const html = render();
    expect(html.match(/data-testid="action-entry"/g)).toHaveLength(2);
    expect(html).toContain('Fri 11 Sept');
    expect(html).toContain('Banking Module');
    expect(html).toContain('8h');
    expect(html).toContain('Day total after');
  });

  it('says nothing is saved before confirming, and offers confirm and cancel', () => {
    const html = render();
    expect(html).toContain('Nothing is saved until you confirm.');
    expect(html).toContain('data-testid="action-confirm"');
    expect(html).toContain('data-testid="action-cancel"');
  });

  it('shows what an entry replaces and marks late entries', () => {
    const html = render();
    expect(html).toContain('replaces 6h');
    expect(html).toContain('Late entry');
    expect(html).toContain('Payroll reviews late entries');
  });

  it('has no late note when no entry is late', () => {
    const html = render({ ...ACTION, entries: [ACTION.entries[1]!] });
    expect(html).not.toContain('Late entry');
    expect(html).toContain('Confirm timesheet entry');
  });
});

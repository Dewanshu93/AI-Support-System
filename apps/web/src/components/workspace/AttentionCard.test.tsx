import type { AttentionItem } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttentionCard, attentionText } from './AttentionCard';

const REQUEST_ID = '6ac4eacc592a1f25e55be24e';
const ITEMS: AttentionItem[] = [
  { kind: 'lop_risk', severity: 'urgent', date: '2026-10-07', cutoff: '2026-10-14' },
  {
    kind: 'timesheet_gap',
    severity: 'urgent',
    date: '2026-10-09',
    hours: 0,
    requiredHours: 8,
    lopCutoff: '2026-10-16',
  },
  {
    kind: 'timesheet_gap',
    severity: 'normal',
    date: '2026-10-06',
    hours: 4,
    requiredHours: 8,
    lopCutoff: null,
  },
  {
    kind: 'request_waiting',
    severity: 'normal',
    request: { id: REQUEST_ID, humanId: 'HR-9002', summary: 'Badge access for the new office' },
  },
];

describe('attentionText', () => {
  it('words a Loss of Pay risk past its cutoff, with log and payroll actions', () => {
    const t = attentionText(ITEMS[0]!);
    expect(t.title).toBe('Wed 7 Oct may be deducted as Loss of Pay');
    expect(t.detail).toContain('payroll cutoff (Wed 14 Oct)');
    expect(t.actions.map((a) => a.href)).toEqual([
      '/timesheets?date=2026-10-07',
      `/chat?q=${encodeURIComponent('Contact payroll about Loss of Pay for Wed 7 Oct')}`,
    ]);
  });

  it('gives the cutoff for an empty day and offers the copilot', () => {
    const t = attentionText(ITEMS[1]!);
    expect(t.title).toBe('Log hours for Fri 9 Oct');
    expect(t.detail).toContain('Log it by Fri 16 Oct (payroll cutoff)');
    expect(t.actions[0]).toMatchObject({ label: 'Log with Copilot', ai: true });
    expect(t.actions[0]!.href).toContain(encodeURIComponent('Log 8 hours for Fri 9 Oct'));
  });

  it('shows logged hours for a partial day, without a Loss of Pay warning', () => {
    const t = attentionText(ITEMS[2]!);
    expect(t.detail).toBe('4h of 8h logged.');
    expect(t.actions.map((a) => a.label)).toEqual(['Log manually']);
  });

  it('reminds about annual leave that will not carry over', () => {
    const t = attentionText({
      kind: 'leave_expiring',
      severity: 'normal',
      available: 12,
      carryOverDays: 5,
      expiresOn: '2026-12-31',
    });
    expect(t.title).toBe('12 days of annual leave left this year');
    expect(t.detail).toBe('Only 5 days carry over; the rest is lost after Thu 31 Dec.');
    expect(t.actions).toEqual([{ label: 'Book leave', href: '/leave' }]);
  });

  it('links a waiting request', () => {
    const t = attentionText(ITEMS[3]!);
    expect(t.title).toBe('HR-9002 is waiting for your reply');
    expect(t.actions[0]!.href).toBe(`/tickets/${REQUEST_ID}`);
  });
});

describe('AttentionCard', () => {
  it('lists the items in the order given and counts the urgent ones', () => {
    const html = renderToStaticMarkup(<AttentionCard items={ITEMS} />);
    expect(html).toContain('Needs your attention');
    expect(html).toContain('4 items · 2 urgent');
    expect(html.match(/data-testid="attention-item"/g)).toHaveLength(4);
    expect(html.indexOf('may be deducted')).toBeLessThan(html.indexOf('HR-9002'));
    expect(html.match(/>Urgent</g)).toHaveLength(2);
  });

  it('shows five items and a "show more" button beyond that', () => {
    const many: AttentionItem[] = Array.from({ length: 7 }, (_, i) => ({
      kind: 'timesheet_gap',
      severity: 'normal',
      date: `2026-10-0${i + 1}`,
      hours: 0,
      requiredHours: 8,
      lopCutoff: null,
    }));
    const html = renderToStaticMarkup(<AttentionCard items={many} />);
    expect(html.match(/data-testid="attention-item"/g)).toHaveLength(5);
    expect(html).toContain('Show 2 more');
  });

  it('renders nothing when nothing needs the employee', () => {
    expect(renderToStaticMarkup(<AttentionCard items={[]} />)).toBe('');
  });
});

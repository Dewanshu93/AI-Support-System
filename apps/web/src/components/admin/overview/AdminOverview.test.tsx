// W4-01 admin overview, rendered to static HTML.
import type { MetricsOverviewResponse } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewView, pct } from './AdminOverview';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const DATA: MetricsOverviewResponse = {
  range: { from: '2026-10-07', to: '2026-10-13' },
  conversations: 40,
  decisionDistribution: [
    { decision: 'ANSWER', count: 30 },
    { decision: 'PARTIAL', count: 4 },
    { decision: 'CLARIFY', count: 2 },
    { decision: 'ESCALATE', count: 3 },
    { decision: 'SENSITIVE_HANDOFF', count: 1 },
    { decision: 'OUT_OF_SCOPE', count: 0 },
  ],
  confirmedResolutionRate: 0.62,
  escalationRate: 0.1,
  escalationByCategory: [
    { category: 'hardware', count: 3, rate: 0.75 },
    { category: 'employee_relations', count: 1, rate: 0.25 },
  ],
  sensitiveHandoffs: 1,
  overrideRate: 0.25,
  thumbsDownRate: 0.05,
  latency: { ttftP50: 1200, ttftP90: 2800, totalP50: 6000, totalP90: 14000 },
  costPerConversationUsd: 0.0031,
  definitions: {
    conversations: 'Conversations started in the range.',
    escalationRate: 'Conversations that led to a ticket ÷ all conversations.',
    decisionDistribution: 'Assistant turns by decision.',
    latency: 'p50 and p90.',
  },
};

describe('OverviewView', () => {
  it('shows each metric with its definition as a tooltip', () => {
    const html = renderToStaticMarkup(<OverviewView data={DATA} />);
    expect(html).toContain('>40<');
    expect(html).toContain('62%');
    expect(html).toContain('title="Conversations that led to a ticket ÷ all conversations."');
    expect(html).toContain('14.0 s');
    expect(html).toContain('$0.0031');
  });

  it('decision bar links each decision to its traces; categories show their share', () => {
    const html = renderToStaticMarkup(<OverviewView data={DATA} />);
    expect(html).toContain('href="/admin/traces?decision=ESCALATE"');
    expect(html).toContain('width:75%');
    expect(html).toContain('Hardware');
  });

  it('no conversations → the empty state', () => {
    expect(renderToStaticMarkup(<OverviewView data={{ ...DATA, conversations: 0 }} />)).toContain(
      'No conversations in range',
    );
  });

  it('pct keeps one decimal under 10%', () => {
    expect([pct(0.05), pct(0.25), pct(0)]).toEqual(['5.0%', '25%', '0%']);
  });
});

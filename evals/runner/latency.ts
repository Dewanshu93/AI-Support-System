// Latency measurement (W4-09, NFR-1 and NFR-2): 30 scripted copilot turns
// through the running API, timed from the client (first token, whole turn), with
// each turn's cost read from its trace. Pure parts here (script, summary,
// report); the HTTP driver is scripts/latency.ts.
import { percentile } from '../../apps/api/src/domain/metrics';

/** Build Contract NFR-1 / NFR-2 targets. */
export const LATENCY_TARGETS = {
  ttftP50Ms: 10_000,
  totalP90Ms: 30_000,
  costPerTurnUsd: 0.01,
} as const;

export interface ScriptedTurn {
  /** Demo persona who asks. */
  email: string;
  message: string;
  /** What the turn exercises, for the report. */
  kind: 'policy' | 'partial' | 'clarify' | 'workspace' | 'escalation' | 'sensitive' | 'off_topic';
}

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const OLIVIA = 'olivia.bennett@example.com';
const MARCUS = 'marcus.lee@example.com';
const RAVI = 'ravi.iyer@example.com';

/** 30 single-turn questions across personas and decision kinds; nothing is confirmed. */
export const LATENCY_SCRIPT: ScriptedTurn[] = [
  { email: PRIYA, kind: 'policy', message: 'How many days of annual leave do I get?' },
  { email: PRIYA, kind: 'policy', message: 'What is the Loss of Pay policy?' },
  { email: PRIYA, kind: 'workspace', message: 'Which days am I missing on my timesheet?' },
  { email: PRIYA, kind: 'workspace', message: 'Why was my salary reduced last month?' },
  { email: PRIYA, kind: 'policy', message: 'My VPN keeps disconnecting. What should I do?' },
  {
    email: PRIYA,
    kind: 'partial',
    message: 'Can I expense a standing desk for working from home?',
  },
  { email: PRIYA, kind: 'escalation', message: 'My laptop will not turn on even when plugged in' },
  { email: PRIYA, kind: 'clarify', message: 'it is broken' },
  { email: TOM, kind: 'policy', message: 'How much holiday am I entitled to as a contractor?' },
  { email: TOM, kind: 'policy', message: 'Who approves my contractor timesheet?' },
  { email: TOM, kind: 'partial', message: 'Do contractors get parental leave?' },
  { email: TOM, kind: 'policy', message: 'How do I reset my MFA on a new phone?' },
  { email: TOM, kind: 'workspace', message: 'Which days am I missing on my timesheet?' },
  { email: TOM, kind: 'off_topic', message: 'Can you recommend a good restaurant nearby?' },
  { email: OLIVIA, kind: 'policy', message: 'How many sick days do I get?' },
  { email: OLIVIA, kind: 'policy', message: 'Do bank holidays count towards my annual leave?' },
  { email: OLIVIA, kind: 'policy', message: 'What is the daily meal allowance when travelling?' },
  { email: OLIVIA, kind: 'escalation', message: 'I need access to the finance SharePoint site' },
  { email: OLIVIA, kind: 'workspace', message: 'Show me my latest payslip' },
  { email: OLIVIA, kind: 'sensitive', message: 'My manager keeps humiliating me in team meetings' },
  { email: MARCUS, kind: 'policy', message: 'How often do I have to change my password?' },
  { email: MARCUS, kind: 'policy', message: 'How do I connect to the office printer?' },
  { email: MARCUS, kind: 'escalation', message: 'Please install Visual Studio on my laptop' },
  { email: MARCUS, kind: 'partial', message: 'Will the company pay for my home internet?' },
  { email: MARCUS, kind: 'clarify', message: 'help please' },
  { email: RAVI, kind: 'policy', message: 'How do I approve leave for my team?' },
  { email: RAVI, kind: 'policy', message: 'What are the public holidays this year?' },
  { email: RAVI, kind: 'policy', message: 'How much does the company contribute to my pension?' },
  { email: RAVI, kind: 'escalation', message: 'My laptop battery is swollen and getting hot' },
  { email: RAVI, kind: 'workspace', message: 'What tasks are due this week?' },
];

export interface TurnTiming {
  turn: ScriptedTurn;
  /** First streamed token after sending, ms; null when the reply had no streamed text. */
  ttftMs: number | null;
  totalMs: number;
  decision: string | null;
  costUsd: number | null;
  error: string | null;
}

export interface LatencySummary {
  turns: number;
  errors: number;
  ttftP50: number | null;
  ttftP90: number | null;
  totalP50: number | null;
  totalP90: number | null;
  costPerTurnUsd: number | null;
  met: { ttft: boolean | null; total: boolean | null; cost: boolean | null };
}

export function summarizeLatency(timings: TurnTiming[]): LatencySummary {
  const ok = timings.filter((t) => !t.error);
  const ttft = ok.flatMap((t) => (t.ttftMs === null ? [] : [t.ttftMs]));
  const total = ok.map((t) => t.totalMs);
  const costs = ok.flatMap((t) => (t.costUsd === null ? [] : [t.costUsd]));
  const ttftP50 = percentile(ttft, 50);
  const totalP90 = percentile(total, 90);
  const costPerTurnUsd = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  return {
    turns: timings.length,
    errors: timings.length - ok.length,
    ttftP50,
    ttftP90: percentile(ttft, 90),
    totalP50: percentile(total, 50),
    totalP90,
    costPerTurnUsd,
    met: {
      ttft: ttftP50 === null ? null : ttftP50 <= LATENCY_TARGETS.ttftP50Ms,
      total: totalP90 === null ? null : totalP90 <= LATENCY_TARGETS.totalP90Ms,
      cost: costPerTurnUsd === null ? null : costPerTurnUsd <= LATENCY_TARGETS.costPerTurnUsd,
    },
  };
}

const sec = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const mark = (met: boolean | null) => (met === null ? 'n/a' : met ? 'met' : '**missed**');

export function latencyReport(input: {
  startedAt: Date;
  apiUrl: string;
  models: string;
  timings: TurnTiming[];
}): string {
  const s = summarizeLatency(input.timings);
  const rows = input.timings.map(
    (t, i) =>
      `| ${i + 1} | ${t.turn.email.split('@')[0]} | ${t.turn.kind} | ${t.decision ?? '—'} | ${sec(t.ttftMs)} | ${sec(t.totalMs)} | ${t.costUsd === null ? '—' : `$${t.costUsd.toFixed(5)}`} | ${t.error ?? ''} |`,
  );
  return [
    `# Latency report — ${input.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `API ${input.apiUrl} · models: ${input.models} · ${s.turns} scripted turns (${s.errors} errors).`,
    'Times are measured by the client from sending the message (first streamed token, `done` event);',
    'cost is the trace total for the turn.',
    '',
    '| Measure | Value | Target (Build Contract) | Result |',
    '| --- | --- | --- | --- |',
    `| First word, p50 | ${sec(s.ttftP50)} | ≤ 10 s (NFR-1) | ${mark(s.met.ttft)} |`,
    `| First word, p90 | ${sec(s.ttftP90)} | — | |`,
    `| Complete turn, p50 | ${sec(s.totalP50)} | — | |`,
    `| Complete turn, p90 | ${sec(s.totalP90)} | ≤ 30 s (NFR-1) | ${mark(s.met.total)} |`,
    `| Cost per turn (mean) | ${s.costPerTurnUsd === null ? '—' : `$${s.costPerTurnUsd.toFixed(5)}`} | ≤ $0.01 (NFR-2) | ${mark(s.met.cost)} |`,
    '',
    '| # | Persona | Kind | Decision | First word | Turn | Cost | Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

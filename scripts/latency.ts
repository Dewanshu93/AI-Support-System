// npm run latency â€” W4-09 latency measurement (NFR-1, NFR-2) against a RUNNING API.
// Sends the 30 scripted turns (evals/runner/latency.ts) as the demo personas, times
// the first streamed token and the whole turn from the client, reads each turn's
// cost from its trace (as the admin), and writes evals/reports/latency.md.
// Calls the real models the personas' Pro switch selects: it costs quota with Pro on
// and takes long on the local model. Nothing is confirmed, so nothing is written
// beyond the conversations themselves (clear them with `npm run reset`).
//
//   npm run latency                              # API at http://localhost:4000
//   npm run latency -- --api http://localhost:4000 --limit 5
import fs from 'node:fs';
import path from 'node:path';
import { type ChatEvent, parseSseEvents, SESSION_COOKIE } from '@sd/shared';
import { loadDotEnv, REPO_ROOT } from '../apps/api/src/config';
import {
  LATENCY_SCRIPT,
  latencyReport,
  summarizeLatency,
  type TurnTiming,
} from '../evals/runner/latency';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const MUTATING = { 'X-Requested-With': 'sd-web', 'Content-Type': 'application/json' };

async function login(api: string, email: string): Promise<string> {
  const password = process.env.DEMO_PASSWORD;
  const res = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: MUTATING,
    body: JSON.stringify(password ? { email, password } : { email }),
  });
  if (!res.ok) throw new Error(`login as ${email} failed: HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error(`login as ${email}: no session cookie`);
  return cookie.split(';')[0]!;
}

/** One turn: a new conversation, the message, the stream read to the end. */
async function runTurn(api: string, cookie: string, message: string) {
  const created = await fetch(`${api}/api/conversations`, {
    method: 'POST',
    headers: { ...MUTATING, Cookie: cookie },
    body: '{}',
  });
  if (!created.ok) throw new Error(`create conversation: HTTP ${created.status}`);
  const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation
    .id;
  const started = performance.now();
  const res = await fetch(`${api}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { ...MUTATING, Cookie: cookie, Accept: 'text/event-stream' },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok || !res.body) throw new Error(`message: HTTP ${res.status}`);
  let ttftMs: number | null = null;
  let buffer = '';
  let done: Extract<ChatEvent, { type: 'done' }> | undefined;
  let failure: Extract<ChatEvent, { type: 'error' }> | undefined;
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const cut = buffer.lastIndexOf('\n\n');
    if (cut < 0) continue;
    for (const event of parseSseEvents(buffer.slice(0, cut))) {
      if (event.type === 'token' && ttftMs === null) ttftMs = performance.now() - started;
      if (event.type === 'done') done = event;
      if (event.type === 'error') failure = event;
    }
    buffer = buffer.slice(cut + 2);
  }
  return {
    conversationId,
    ttftMs: ttftMs === null ? null : Math.round(ttftMs),
    totalMs: Math.round(performance.now() - started),
    decision: done?.data.decision ?? null,
    error: failure
      ? `${failure.data.code}: ${failure.data.message}`
      : done
        ? null
        : 'no done event',
  };
}

async function main(): Promise<number> {
  loadDotEnv();
  const api = (arg('--api') ?? 'http://localhost:4000').replace(/\/$/, '');
  const limit = Number(arg('--limit') ?? LATENCY_SCRIPT.length);
  const script = LATENCY_SCRIPT.slice(0, limit);
  const health = await fetch(`${api}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`The API at ${api} is not reachable; start it with npm run dev:api.`);
    return 1;
  }

  const cookies = new Map<string, string>();
  const admin = await login(api, 'alex.morgan@example.com');
  const startedAt = new Date();
  const timings: TurnTiming[] = [];
  for (const [i, turn] of script.entries()) {
    if (!cookies.has(turn.email)) cookies.set(turn.email, await login(api, turn.email));
    let timing: TurnTiming;
    try {
      const r = await runTurn(api, cookies.get(turn.email)!, turn.message);
      const traces = await fetch(`${api}/api/admin/conversations/${r.conversationId}/traces`, {
        headers: { Cookie: admin },
      });
      const body = traces.ok
        ? ((await traces.json()) as { turns: { traceSummary: { totalCostUsd: number } }[] })
        : null;
      timing = {
        turn,
        ttftMs: r.ttftMs,
        totalMs: r.totalMs,
        decision: r.decision,
        costUsd: body?.turns[0]?.traceSummary.totalCostUsd ?? null,
        error: r.error,
      };
    } catch (err) {
      timing = {
        turn,
        ttftMs: null,
        totalMs: 0,
        decision: null,
        costUsd: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    timings.push(timing);
    console.log(
      `${String(i + 1).padStart(2)}/${script.length} ${turn.kind.padEnd(10)} ${timing.decision ?? 'â€”'} ` +
        `first ${timing.ttftMs ?? 'â€”'} ms, turn ${timing.totalMs} ms${timing.error ? `  ERROR ${timing.error}` : ''}`,
    );
  }

  const s = summarizeLatency(timings);
  const report = latencyReport({
    startedAt,
    apiUrl: api,
    models: 'per persona Pro switch (ADR-020)',
    timings,
  });
  const file = path.join(REPO_ROOT, 'evals', 'reports', 'latency.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, report);
  console.log(
    `\nfirst word p50 ${s.ttftP50 ?? 'â€”'} ms, turn p90 ${s.totalP90 ?? 'â€”'} ms, cost/turn ${
      s.costPerTurnUsd?.toFixed(5) ?? 'â€”'
    } â€” report: ${path.relative(REPO_ROOT, file)}`,
  );
  return s.errors === 0 && s.met.ttft !== false && s.met.total !== false && s.met.cost !== false
    ? 0
    : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);

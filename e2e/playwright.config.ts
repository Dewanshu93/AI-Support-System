import { defineConfig, devices } from '@playwright/test';
import { E2E_TODAY } from './today';

// End-to-end tests run their own API and web app on separate ports (4100 / 3100,
// own Next build folder), so they never touch a developer's running servers.
// They use the real MongoDB and Qdrant from .env; ingest first (npm run ingest).
// Every run reseeds the demo data for E2E_TODAY (global-setup.ts), and the API
// uses that date too; run `npm run seed` afterwards to return to today's data.
//
// E2E_LLM selects how the API talks to the LLM (W2-09):
//   replay (default)  recorded replies from e2e/fixtures/llm-recordings.json; no provider calls
//   record            real provider, saving replies for later replays
//   live              real provider, nothing saved
const llm = process.env.E2E_LLM ?? 'replay';
const live = llm !== 'replay';
const apiPort = process.env.E2E_API_PORT ?? '4100';
const webPort = process.env.E2E_WEB_PORT ?? '3100';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: !live,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Live turns are slow (minutes on the local model) and providers rate-limit: one at a time.
  // Replayed turns skip the LLM but still query the LAN MongoDB and Qdrant; with two
  // workers the API drops proxied connections (ECONNRESET) on the demo PC, so one
  // worker by default (E2E_WORKERS overrides). Generous timeouts.
  // Live and record runs use the local model (E2E users have Pro off, ADR-020): on CPU a
  // turn takes minutes, so they get 5 min per expectation and 10 min per test (×3 with
  // test.slow). Replay stays fast.
  workers: live ? 1 : Number(process.env.E2E_WORKERS ?? 1),
  timeout: live ? 600_000 : 180_000,
  expect: { timeout: live ? 300_000 : 60_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  // E2E_BROWSER_CHANNEL=chrome|msedge uses an installed browser when the bundled
  // Chromium cannot be downloaded (e.g. restricted networks).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_BROWSER_CHANNEL },
    },
  ],
  webServer: [
    {
      command: 'npm run build -w @sd/shared && npm run start:e2e -w @sd/api',
      cwd: '..',
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      // Scripted sign-ins outpace the 10/min per-IP login limit (W4-07).
      env: { API_PORT: apiPort, LLM_MODE: llm, DEMO_TODAY: E2E_TODAY, RATE_LIMIT_SCALE: '100' },
    },
    {
      // Production build in its own folder: timings reflect real use.
      command: `npm run build -w @sd/web && npm exec -w @sd/web -- next start --port ${webPort}`,
      cwd: '..',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 600_000,
      env: { API_URL: `http://localhost:${apiPort}`, NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});

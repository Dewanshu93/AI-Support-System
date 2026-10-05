import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Runs against the real API (and its MongoDB from .env); seed demo users first:
//   npm run seed
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The web app runs as a production build (below), so pages are precompiled;
  // timeouts still allow for the LAN database round trips.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 15_000 },
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
  // Starts the API and the web app unless they are already running.
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: '..',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // Production build: no compile-on-demand, so timings reflect real use.
      command: 'npm run build -w @sd/web && npm run start -w @sd/web',
      cwd: '..',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});

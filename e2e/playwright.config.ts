import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
  // Starts the web app unless one is already running (e.g. via docker compose).
  webServer: {
    command: 'npm run dev:web',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

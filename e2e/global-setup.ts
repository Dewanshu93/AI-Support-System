import { execSync } from 'node:child_process';
import path from 'node:path';
import { E2E_TODAY } from './today';

// Restores the demo data before every run (UC-10): `npm run seed` is idempotent and
// rebuilds the mock HR data for a fixed "today", so the LOP scenario finds the same
// unpaid day, payslip and missing timesheet on every run, and recorded LLM replies
// (whose prompts contain dates) still match. The E2E API uses the same date
// (DEMO_TODAY, playwright.config.ts). E2E_SKIP_SEED=1 skips it.
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_SEED === '1') return;
  execSync(`npm run seed -- --today ${E2E_TODAY} --reset-requests`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
}

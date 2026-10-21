import { expect, type Page, test } from '@playwright/test';
import { E2E_TODAY } from '../today';

// UC-11 (amendment A-1): an employee requests leave on the form and the HR agent
// approves it. Needs the mock HR data (`npm run seed`, run by the E2E setup), which
// is reset on every run, so this test may write Ravi's leave.

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The first Monday at least three weeks after the seed's "today". */
function futureMonday(): string {
  const d = new Date(`${E2E_TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 21 + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

test('leave: request on the form, HR approves, the employee sees it approved', async ({ page }) => {
  const day = futureMonday();
  await signInAs(page, 'Ravi Iyer');
  await page.goto('/leave');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leave');
  const annual = page.locator('[data-testid="leave-balance"][data-type="annual"]');
  await expect(annual).toContainText('/ 15 days');

  await page.getByLabel('Type').selectOption('casual');
  await page.getByLabel('From').fill(day);
  await page.getByLabel('Note for HR').fill('School event');
  await page.getByTestId('leave-submit').click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
  const mine = page.getByTestId('leave-request').filter({ hasText: 'School event' });
  await expect(mine).toHaveAttribute('data-status', 'pending');

  // A second request on the same day is refused next to the field.
  await page.getByLabel('Type').selectOption('annual');
  await page.getByLabel('From').fill(day);
  await page.getByTestId('leave-submit').click();
  await expect(page.getByText(/you already have leave on/)).toBeVisible();

  // HR approves.
  await page.context().clearCookies();
  await signInAs(page, 'Hana Kim');
  await page.goto('/agent/leave');
  const row = page.getByTestId('agent-leave-request').filter({ hasText: 'Ravi Iyer' });
  await expect(row).toContainText('School event');
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row).toHaveCount(0);

  // Ravi sees it approved.
  await page.context().clearCookies();
  await signInAs(page, 'Ravi Iyer');
  await page.goto('/leave');
  await expect(
    page.getByTestId('leave-request').filter({ hasText: 'School event' }),
  ).toHaveAttribute('data-status', 'approved');
});

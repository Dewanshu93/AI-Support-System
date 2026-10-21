import { expect, type Page, test } from '@playwright/test';

// UC-03: the employee workspace in the browser (Build Contract v2.0 flows 1, 3
// (form), 5 (records) and 7). Needs the mock HR data: `npm run seed`. Dates come
// from the seed's "today", so the tests assert statuses, not fixed dates.

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('flow 1: Priya’s dashboard shows her week, tasks, pay with LOP, requests and notifications', async ({
  page,
}) => {
  await signInAs(page, 'Priya Shah');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Priya');

  // The week strip: seven days, with the seeded missing day flagged.
  const week = page.getByRole('list', { name: 'This week' });
  await expect(week.getByRole('link')).toHaveCount(7);
  await expect(week.locator('[data-status="missing"]')).toHaveCount(1);

  // UC-12: the same day needs her attention. She badged in that day, so it is a
  // reminder, not a Loss of Pay risk. UC-11: unused annual leave is the other item.
  const attention = page.getByTestId('attention-card');
  await expect(attention.locator('[data-kind="timesheet_gap"]')).toHaveCount(1);
  await expect(attention.locator('[data-kind="lop_risk"]')).toHaveCount(0);
  await expect(attention.locator('[data-kind="leave_expiring"]')).toContainText(
    'days of annual leave left this year',
  );
  await expect(attention).toContainText('Nothing logged.');
  await expect(attention.getByRole('link', { name: /Log with Copilot/ })).toHaveAttribute(
    'href',
    /\/chat\?q=Log%208%20hours/,
  );

  await expect(page.getByText('PROJ-123')).toBeVisible();
  await expect(page.getByText(/Loss of Pay −\$400\.00/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: /VPN access for Northwind Bank staging/ }),
  ).toContainText('Under review');

  // Notifications: the bell lists them and opens the panel.
  await page.getByTestId('notification-bell').click();
  await expect(page.getByText('Salary reduced: Loss of Pay deduction')).toBeVisible();
});

test('flow 5 (records): the payslip itemises the Loss of Pay day', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Payroll' })
    .click();
  await expect(page).toHaveURL(/\/payroll/);
  await expect(page.getByText('Loss of Pay (1 day)')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open timesheet for/ })).toBeVisible();
});

test('contractors see that their agency pays them', async ({ page }) => {
  await signInAs(page, 'Tom Clarke');
  await page.goto('/payroll');
  await expect(page.getByText('You are paid by your agency')).toBeVisible();
});

test('flow 3 (form): the timesheet rejects an over-long day and saves a valid change', async ({
  page,
}) => {
  // Olivia's data is not used by other specs, so this test may write to it.
  await signInAs(page, 'Olivia Bennett');
  await page.goto('/timesheets');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('Week of');
  const thisWeek = await heading.textContent();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page).toHaveURL(/date=/);
  await expect(heading).not.toHaveText(thisWeek!);

  // Last week's Monday is a complete working day; push one project to 12 h → day over 12 h.
  const cell = page.getByRole('spinbutton').first();
  await expect(cell).toBeEnabled();
  const original = await cell.inputValue();
  await cell.fill('12');
  await page.getByTestId('save-timesheet').click();
  await expect(page.getByText(/maximum 12/)).toBeVisible();
  await expect(cell).toHaveAttribute('aria-invalid', 'true');

  // A valid change saves, then the original value is restored.
  await cell.fill(String(Number(original || '0') + 0.5));
  await page.getByTestId('save-timesheet').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved 1 entry/ })).toBeVisible();
  await cell.fill(original);
  await page.getByTestId('save-timesheet').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved|removed/ })).toBeVisible();
});

test('flow 7: requests show on the tracker, as a list and a board', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await page.goto('/tickets');
  await expect(page.getByTestId('ticket-row').filter({ hasText: 'IT-9001' })).toContainText(
    'Under review',
  );
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(
    page.getByTestId('ticket-board').getByRole('region', { name: 'Under review' }),
  ).toContainText('IT-9001');
});

test('the copilot palette opens with Ctrl+K and lists suggestions', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('copilot-launcher')).toBeVisible();
  const palette = page.getByRole('dialog', { name: 'Ask Copilot' });
  // The shortcut listener attaches after hydration: retry until the palette opens.
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(palette.getByText('Why was my salary reduced last month?')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

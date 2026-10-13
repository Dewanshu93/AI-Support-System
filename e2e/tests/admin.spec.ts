import { expect, type Page, test } from '@playwright/test';

// W4-01 smoke: the admin overview loads the metrics for a range and keeps the
// range in the URL. Numbers depend on earlier activity, so only the shape is checked.

async function signIn(page: Page, name: string, home: RegExp) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(home);
}

test('admin overview: metric cards with definitions, decision bar, range in the URL', async ({
  page,
}) => {
  await signIn(page, 'Alex Morgan', /\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // Earlier specs in the run create conversations; with none, the empty state shows instead.
  const cards = page.getByTestId('metric-conversations');
  const empty = page.getByText('No conversations in range');
  await expect(cards.or(empty)).toBeVisible();
  if (await cards.isVisible()) {
    await expect(page.getByTestId('decision-distribution')).toBeVisible();
    await expect(page.getByTestId('metric-escalation').locator('[title]')).toHaveAttribute(
      'title',
      /÷ all conversations/,
    );
  }
  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
});

test('knowledge gaps: the page loads with its refresh action and a snapshot or the empty state', async ({
  page,
}) => {
  await signIn(page, 'Alex Morgan', /\/admin$/);
  await page.goto('/admin/gaps');
  await expect(page.getByRole('heading', { level: 1, name: 'Knowledge gaps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  await expect(
    page.getByText('No gaps detected yet').or(page.getByTestId('gap-cluster-list')),
  ).toBeVisible();
});

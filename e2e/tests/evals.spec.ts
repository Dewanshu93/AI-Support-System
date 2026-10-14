import { expect, test } from '@playwright/test';

// W4-05 smoke: the admin starts a 3-case retrieval run (tag "smoke"), watches its
// progress and inspects the cases. The runner is the real eval CLI started by the
// API; in replay it serves recorded embeddings and rerank replies (recorded once
// with Alex's Pro switch off: local model), so no provider is called.

test('evaluation: start a smoke run, watch progress, inspect its cases', async ({ page }) => {
  test.slow(); // the runner is a separate process; a recording run uses the local model
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in as Alex Morgan' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/evals');
  await expect(page.getByRole('heading', { level: 1, name: 'Evaluation' })).toBeVisible();
  await page.getByRole('button', { name: 'Start run' }).first().click();
  const dialog = page.getByTestId('start-run-dialog');
  await dialog.getByRole('radio', { name: /Retrieval/ }).check();
  await dialog.getByPlaceholder('smoke').fill('smoke');
  await dialog.getByRole('button', { name: 'Start run' }).click();

  // The run page: progress while it runs, then the targets and the cases.
  await expect(page).toHaveURL(/\/admin\/evals\/[a-f0-9]{24}$/);
  // Recording calls the local model (about 1.5 min a case on CPU); replay takes seconds.
  await expect(page.getByTestId('case-table')).toBeVisible({ timeout: 480_000 });
  await expect(page.getByTestId('target-cards')).toBeVisible();
  await page.getByLabel('Failed only').uncheck();
  await expect(page.getByTestId('case-row')).toHaveCount(3);
  await page.getByTestId('case-row').first().locator('summary').click();
  await expect(page.getByText('Expected', { exact: true }).first()).toBeVisible();

  // The run is listed with its result.
  await page.getByRole('link', { name: 'All runs' }).click();
  await expect(page.getByTestId('run-row').first()).toContainText('tags smoke');
});

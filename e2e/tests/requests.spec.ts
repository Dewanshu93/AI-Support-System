import { expect, type Page, test } from '@playwright/test';

// UC-17 (amendment A-1): the requester comments on and withdraws their own request
// on the request page. The seed restores the demo requests (and removes added
// events) on every run, so this test may change Tom's HR-9002. It runs after agent.spec
// (which works the same ticket) and closes it, so no later spec may rely on HR-9002.

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('requests: comment on a request, then withdraw it', async ({ page }) => {
  await signInAs(page, 'Tom Clarke');
  await page.goto('/tickets');
  await page.locator('[data-testid="ticket-row"][data-human-id="HR-9002"]').click();
  await expect(page.getByTestId('ticket-human-id')).toHaveText('HR-9002');
  // Open: waiting for Tom when run alone, in progress after agent.spec has worked it.
  const status = page.getByTestId('ticket-status');
  await expect(status).toHaveAttribute('data-status', /^(waiting_on_employee|in_progress)$/);
  const before = await status.getAttribute('data-status');

  await page.getByTestId('request-comment').fill('The new badge works now.');
  await page.getByTestId('request-comment-send').click();
  await expect(
    page.getByTestId('ticket-event').filter({ hasText: 'The new badge works now.' }),
  ).toHaveAttribute('data-type', 'reply');
  // A comment changes no status (owner decision).
  await expect(status).toHaveAttribute('data-status', before!);

  await page.getByTestId('request-withdraw').click();
  await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-status', 'closed');
  // Closed is final: no more actions.
  await expect(page.getByTestId('request-comment')).toHaveCount(0);
});

import { expect, type Page, test } from '@playwright/test';

// W3-07 / CP-6: the agent workspace in the browser (playbook flow 8). Hana (HR
// queues) works HR-9002, Tom's seeded contractor question that no other spec
// touches; the run reseeds the data first (global-setup.ts). No LLM call: the AI
// draft (P-7) is covered by API and component tests.

async function signIn(page: Page, name: string, home: RegExp) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(home);
}

test('flow 8: queue → ticket → reply, note, status change, classification correction', async ({
  page,
}) => {
  await signIn(page, 'Hana Kim', /\/agent\/queue$/);

  // Queue: HR tickets only (her queues), critical first. Tickets from earlier runs
  // can push a low-priority one off the first page, so filter to find it.
  await expect(page.getByTestId('queue-row').first()).toBeVisible();
  await expect(page.getByTestId('queue-row').filter({ hasText: 'IT-' })).toHaveCount(0);
  await page.getByTestId('queue-status-filter').selectOption('resolved');
  await expect(page).toHaveURL(/status=resolved/);
  await expect(page.getByTestId('queue-row').filter({ hasText: 'HR-9001' })).toBeVisible();
  await expect(page.getByTestId('queue-row').filter({ hasText: 'HR-9002' })).toHaveCount(0);
  await page.getByTestId('queue-status-filter').selectOption('waiting_on_employee');
  await page.getByTestId('queue-priority-filter').selectOption('low');
  await expect(page).toHaveURL(/priority=low/);
  const row = page.getByTestId('queue-row').filter({ hasText: 'HR-9002' });
  await row.getByRole('link', { name: 'HR-9002' }).click();

  // Ticket workspace: full context.
  await expect(page).toHaveURL(/\/agent\/tickets\/[a-f0-9]{24}$/);
  await expect(page.getByTestId('ticket-human-id')).toHaveText('HR-9002');
  await expect(page.getByTestId('ticket-status')).toHaveAttribute(
    'data-status',
    'waiting_on_employee',
  );
  await expect(page.getByTestId('ai-summary')).toBeVisible();
  await expect(page.getByTestId('generate-draft')).toBeVisible();
  await page.getByTestId('transcript').locator('summary').click();
  await expect(page.getByTestId('transcript')).toContainText('contractor timesheet approval');

  // Internal note: agents only.
  await page.getByTestId('composer-note').click();
  await page.getByTestId('composer-body').fill('Agency list is in the contractor folder.');
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('action-notice')).toHaveText('Note added.');
  await expect(
    page
      .getByTestId('ticket-event')
      .filter({ hasText: 'Agency list is in the contractor folder.' })
      // A rerun keeps events from earlier runs (the seed restores the ticket only).
      .last(),
  ).toHaveAttribute('data-type', 'note');

  // A placeholder blocks sending until it is filled.
  await page.getByTestId('composer-reply').click();
  await page.getByTestId('composer-body').fill('Hi Tom, your agency is [agency name].');
  await expect(page.getByTestId('composer-send')).toBeDisabled();
  await page
    .getByTestId('composer-body')
    .fill('Hi Tom, your agency approves contractor timesheets.');
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('action-notice')).toHaveText('Reply sent to the employee.');
  await expect(
    page.getByTestId('ticket-event').filter({ hasText: 'your agency approves' }).last(),
  ).toHaveAttribute('data-type', 'reply');

  // Status: only workflow moves are offered.
  await page.getByTestId('status-select').selectOption('in_progress');
  await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-status', 'in_progress');
  await expect(page.getByTestId('status-select').locator('option')).not.toContainText(['→ New']);

  // Classification correction: priority up, recorded on the timeline.
  await page.getByTestId('classification-priority').selectOption('high');
  await page.getByTestId('classification-save').click();
  await expect(page.getByTestId('action-notice')).toHaveText('Classification corrected.');
  await expect(
    page.getByTestId('ticket-event').filter({ hasText: 'Classification corrected' }).last(),
  ).toContainText('High');

  // Tom sees the reply (not the note) and is notified.
  const tom = await page.context().browser()!.newContext();
  const tomPage = await tom.newPage();
  await signIn(tomPage, 'Tom Clarke', /\/dashboard$/);
  await tomPage.getByTestId('notification-bell').click();
  await expect(tomPage.getByRole('button', { name: /The team replied on HR-9002/ })).toBeVisible();
  await tom.close();
});

test('queue scoping: an IT agent does not see HR tickets, and an unknown ticket is not found', async ({
  page,
}) => {
  await signIn(page, 'Sam Patel', /\/agent\/queue$/);
  // IT agent: HR tickets are not visible.
  await expect(page.getByTestId('queue-row').filter({ hasText: 'HR-9002' })).toHaveCount(0);
  await page.goto('/agent/tickets/000000000000000000000000');
  await expect(page.getByText('Ticket not found')).toBeVisible();
});

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
  // UC-16: answers rated "Not helpful" (rows, or the empty message).
  const notHelpful = page.getByTestId('not-helpful');
  await expect(notHelpful.getByRole('heading', { name: 'Rated not helpful' })).toBeVisible();
  await expect(
    notHelpful
      .getByText('No answer has been rated not helpful yet.')
      .or(notHelpful.getByTestId('feedback-row').first()),
  ).toBeVisible();
});

test('trace viewer: conversations list, and a conversation opens its turn timeline and trace tabs', async ({
  page,
}) => {
  await signIn(page, 'Alex Morgan', /\/admin$/);
  await page.goto('/admin/traces');
  await expect(page.getByRole('heading', { level: 1, name: 'Traces' })).toBeVisible();
  const rows = page.getByTestId('conversation-row');
  await expect(rows.first().or(page.getByText('No conversations'))).toBeVisible();
  // Earlier specs in the run create conversations; on an empty database only the list is checked.
  if (await rows.first().isVisible()) {
    await rows.first().getByRole('link').click();
    await expect(
      page.getByTestId('turn-timeline').or(page.getByText('no traced turns')),
    ).toBeVisible();
    if (await page.getByTestId('turn-timeline').isVisible()) {
      await expect(page.getByTestId('trace-tab-analysis')).toBeVisible();
      for (const tab of ['Retrieval', 'Decision', 'Output', 'LLM calls']) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      }
    }
  }
});

test('documents: the knowledge base lists versions and a document shows its chunks', async ({
  page,
}) => {
  await signIn(page, 'Alex Morgan', /\/admin$/);
  await page.goto('/admin/documents');
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload policy' })).toBeEnabled();
  const rows = page.getByTestId('document-row');
  await expect(rows.first().or(page.getByText('No documents'))).toBeVisible();
  if (await rows.first().isVisible()) {
    await rows.first().getByRole('link').click();
    await expect(page.getByTestId('chunk-list')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-index' })).toBeVisible();
  }
});

import { expect, type Page, test } from '@playwright/test';

// W2-09 / CP-4: employee chat flows in the browser (playwright.config.ts: E2E_LLM
// replay by default, record or live on request). Flow numbers follow the
// contract summaries in docs/PROGRESS.md (W2-09).

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(/\/chat$/);
}

/** Sends a message in a new conversation and waits for the turn to finish. */
// `paused`: the turn ends waiting for a confirmation (draft or private contact), so no composer.
async function ask(page: Page, text: string, { paused = false } = {}) {
  await page.getByTestId('composer').fill(text);
  await page.getByTestId('send').click();
  await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}$/);
  // The stored reply replaces the live view when the turn is done.
  await expect(page.getByTestId('live-turn')).toHaveCount(0);
  if (paused) await expect(page.getByTestId('composer')).toHaveCount(0);
  else await expect(page.getByTestId('composer')).toBeEnabled();
}

const lastReply = (page: Page) => page.getByTestId('assistant-message').last();

test.describe('flow 1: cited answers depend on the employee profile', () => {
  const QUESTION = 'How many days of annual leave do I get?';

  test('Priya (US, full-time): cited answer, source drawer, resolution and feedback persist', async ({
    page,
  }) => {
    await signInAs(page, 'Priya Shah');
    await expect(page.getByTestId('empty-chat')).toBeVisible();
    await page.getByTestId('composer').fill(QUESTION);
    await page.getByTestId('send').click();
    // Progress is shown while the turn runs.
    await expect(page.getByTestId('stage-indicator')).toBeVisible();
    await expect(page.getByTestId('live-turn')).toHaveCount(0);

    const reply = lastReply(page);
    await expect(reply).toHaveAttribute('data-decision', 'ANSWER');
    await expect(reply.getByTestId('citation-chip').first()).toBeVisible();
    await expect(reply).toContainText('Annual Leave (US)');

    // Citation → source drawer with the cited passage.
    await reply.getByTestId('citation-chip').first().click();
    const drawer = page.getByTestId('source-drawer');
    await expect(drawer.getByTestId('source-title')).toContainText('Annual Leave (US)');
    await expect(drawer.getByTestId('source-text')).not.toBeEmpty();
    await drawer.getByRole('button', { name: 'Close source' }).click();
    await expect(drawer).toHaveCount(0);

    // Feedback is stored by the API.
    const feedback = page.waitForResponse(
      (r) => r.url().includes('/feedback') && r.request().method() === 'POST',
    );
    await reply.getByTestId('feedback-up').click();
    expect((await feedback).status()).toBe(200);
    await expect(reply.getByTestId('feedback-up')).toHaveAttribute('aria-pressed', 'true');

    // Resolution persists across a reload.
    await reply.getByTestId('resolved-yes').click();
    await expect(page.getByText('Marked as resolved')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Marked as resolved')).toBeVisible();
    await expect(page.getByTestId('resolution-prompt')).toHaveCount(0);
    await expect(lastReply(page)).toHaveAttribute('data-decision', 'ANSWER');
  });

  test('Tom (UK, contractor) gets a different cited answer to the same question', async ({
    page,
  }) => {
    await signInAs(page, 'Tom Clarke');
    await ask(page, QUESTION);
    const reply = lastReply(page);
    await expect(reply.getByTestId('citation-chip').first()).toBeVisible();
    // Contractors' time off comes from their own policy, never the US employee one.
    await expect(reply).not.toContainText('Annual Leave (US)');
    await expect(reply).toContainText(/Contractor/i);
  });
});

test('flow 2: partial answer says what is not covered; "No" offers a ticket', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await ask(
    page,
    'What is the daily meal allowance when travelling, and can I expense a gym membership?',
  );
  const reply = lastReply(page);
  await expect(reply).toHaveAttribute('data-decision', 'PARTIAL');
  await expect(reply.getByTestId('citation-chip').first()).toBeVisible();
  await reply.getByTestId('resolved-no').click();
  await expect(page.getByTestId('system-message')).toContainText('raise a ticket');
});

test('flow 3: an ambiguous message gets one clarifying question', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await ask(page, 'it is broken');
  const reply = lastReply(page);
  await expect(reply).toHaveAttribute('data-decision', 'CLARIFY');
  await expect(reply).toContainText('?');
  await expect(page.getByTestId('resolution-prompt')).toHaveCount(0);
});

test('flow 6 (offer step): a sensitive message gets the private HR contact offer', async ({
  page,
}) => {
  await signInAs(page, 'Priya Shah');
  await ask(page, 'My manager keeps harassing me in team meetings', { paused: true });
  const card = page.getByTestId('handoff-card');
  await expect(card).toHaveAttribute('data-kind', 'sensitive');
  await expect(card).toContainText('Would you like HR to contact you privately?');
  await expect(card.getByTestId('private-contact-yes')).toBeVisible();
  await expect(page.getByTestId('citation-chip')).toHaveCount(0);
});

test('flow 7: an out-of-scope question gets the templated reply', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await ask(page, 'Can you recommend a good pizza place near the office?');
  await expect(page.getByTestId('handoff-card')).toHaveAttribute('data-kind', 'out_of_scope');
  await expect(page.getByTestId('handoff-card')).toContainText('IT and HR questions');
});

test('the conversation sidebar lists the new conversation', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await ask(page, 'it is broken again, the second monitor');
  const sidebar = page.getByTestId('conversation-sidebar');
  await expect(sidebar.getByRole('link', { name: /second monitor/ }).first()).toBeVisible();
  await sidebar.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByTestId('empty-chat')).toBeVisible();
});

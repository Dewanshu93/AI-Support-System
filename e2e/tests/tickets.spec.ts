import { expect, type Page, test } from '@playwright/test';

// W3-04 / CP-5: ticket flows in the browser (contract flows 4, 5 and 6).
// Tickets persist in the E2E database between runs, so every flow uses its own
// persona (parallel workers never share a requester), and a rerun may meet the
// duplicate prompt from the previous run: `confirmDraft` answers it explicitly.

// Multi-turn flows with live replies (record / live) can exceed the default budget.
const LIVE = (process.env.E2E_LLM ?? 'replay') !== 'replay';
test.slow(LIVE, 'several live LLM turns');

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/chat');
}

async function waitForTurn(page: Page) {
  await expect(page.getByTestId('live-turn')).toHaveCount(0);
}

async function ask(page: Page, text: string) {
  // Typing before hydration is lost (controlled textarea): refill until Send is enabled.
  await expect(async () => {
    await page.getByTestId('composer').fill(text);
    await expect(page.getByTestId('send')).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page.getByTestId('send').click();
  await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}$/);
  await waitForTurn(page);
}

const ISSUE = 'My Dell Latitude 7440 laptop will not turn on, even after charging it overnight.';
const DETAILS = 'It is a Dell Latitude 7440, asset tag AT-5521. The screen stays black.';

/**
 * Gets to the draft card: presses "Talk to a human" unless the last turn already
 * escalated, then answers the questions for missing required details (at most
 * two rounds) with fixed text. Recorded replies make the path deterministic.
 */
async function escalateToDraft(page: Page, { talkToHuman = true } = {}) {
  const card = page.getByTestId('ticket-draft-card');
  if (talkToHuman && !(await card.isVisible())) {
    await page.getByTestId('talk-to-human').click();
    await waitForTurn(page);
  }
  for (let round = 0; round < 2 && !(await card.isVisible()); round++) {
    await expect(page.getByTestId('assistant-message').last()).toContainText('?');
    await ask(page, DETAILS);
  }
  await expect(card).toBeVisible();
  // No ticket exists yet: the composer waits for confirm or cancel.
  await expect(page.getByTestId('composer')).toHaveCount(0);
  await expect(page.getByTestId('draft-pending-note')).toBeVisible();
  return card;
}

/** Confirms the draft; a duplicate prompt (from an earlier run) is answered with `onDuplicate`. */
async function confirmDraft(page: Page, onDuplicate: 'new' | 'same' = 'new') {
  await page.getByTestId('draft-confirm').click();
  const created = page.getByTestId('ticket-created');
  const duplicate = page.getByTestId('duplicate-prompt');
  await expect(created.or(duplicate)).toBeVisible();
  if (await duplicate.isVisible()) await page.getByTestId(`duplicate-${onDuplicate}`).click();
  await expect(created).toBeVisible();
  return ((await created.locator('span.font-semibold').textContent()) ?? '').trim();
}

test('flow 4: ticket from chat, edited and confirmed, then tracked in the request tracker', async ({
  page,
}) => {
  await signInAs(page, 'Ravi Iyer');
  await ask(page, ISSUE);
  const card = await escalateToDraft(page);

  // AI-filled fields are marked; queue and priority are read-only.
  await expect(card.getByTestId('ai-filled').first()).toBeVisible();
  await expect(card.getByTestId('draft-queue')).not.toBeEmpty();
  await expect(card.locator('#draft-field-priority')).toHaveCount(0);

  // The employee edits a field before confirming.
  const assetTag = card.locator('#draft-field-asset_tag');
  if (await assetTag.count()) await assetTag.fill('AT-5521');

  const humanId = await confirmDraft(page, 'new');
  expect(humanId).toMatch(/^IT-\d{4,}$/);
  await expect(page.getByTestId('ticket-draft-card')).toHaveCount(0);
  await expect(page.getByTestId('system-message').last()).toContainText(humanId);
  await expect(page.getByTestId('composer')).toBeEnabled();

  await page.getByRole('link', { name: 'View ticket' }).click();
  await expect(page.getByTestId('ticket-human-id')).toHaveText(humanId);
  await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-status', 'new');
  await expect(page.getByTestId('ticket-event').first()).toHaveAttribute('data-type', 'created');

  await page.getByRole('link', { name: 'Requests' }).first().click();
  await expect(page.getByTestId('ticket-row').filter({ hasText: humanId })).toBeVisible();
  await page.getByTestId('status-filter').selectOption('resolved');
  await expect(page).toHaveURL(/status=resolved/);
  await expect(page.getByTestId('ticket-row').filter({ hasText: humanId })).toHaveCount(0);
});

test('flow 4 (safety): safety steps with citations come before the draft', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await ask(page, 'My laptop battery is swollen and getting very hot. What should I do?');
  const reply = page.getByTestId('assistant-message').last();
  await expect(reply).toHaveAttribute('data-decision', 'ESCALATE');
  await expect(reply.getByTestId('safety-notice')).toBeVisible();
  await expect(reply.getByTestId('citation-chip').first()).toBeVisible();
  // The draft follows the safety steps (after any missing-detail questions).
  const card = await escalateToDraft(page, { talkToHuman: false });
  await expect(card.getByTestId('draft-priority')).toHaveAttribute('data-priority', 'critical');

  // Cancelling leaves no ticket and reopens the composer.
  await page.getByTestId('draft-cancel').click();
  await expect(page.getByTestId('ticket-draft-card')).toHaveCount(0);
  await expect(page.getByTestId('system-message').last()).toContainText("haven't raised a ticket");
  await expect(page.getByTestId('composer')).toBeEnabled();
});

test('flow 5: a second ticket on the same issue offers to add to the existing one', async ({
  page,
}) => {
  await signInAs(page, 'Marcus Lee');
  await ask(page, ISSUE);
  await escalateToDraft(page);
  const first = await confirmDraft(page, 'new');

  // Same issue in a new conversation: the duplicate prompt names the open ticket.
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByTestId('empty-chat')).toBeVisible();
  await ask(page, ISSUE);
  await escalateToDraft(page);
  await page.getByTestId('draft-confirm').click();
  const prompt = page.getByTestId('duplicate-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(first);

  await page.getByTestId('duplicate-same').click();
  await expect(page.getByTestId('ticket-created')).toContainText(first);
  await expect(page.getByTestId('system-message').last()).toContainText(`existing ticket ${first}`);
});

test('flow 6: "Yes" creates a confidential HR case', async ({ page }) => {
  await signInAs(page, 'Olivia Bennett');
  await ask(page, 'My manager keeps harassing me in team meetings');
  const card = page.getByTestId('handoff-card');
  await expect(card).toHaveAttribute('data-kind', 'sensitive');
  await expect(page.getByTestId('ticket-draft-card')).toHaveCount(0);
  await expect(page.getByTestId('composer')).toHaveCount(0);

  await card.getByTestId('private-contact-yes').click();
  const created = page.getByTestId('ticket-created');
  await expect(created).toContainText(/HR-\d{4,}/);
  await expect(card.getByTestId('private-contact-yes')).toHaveCount(0);

  await created.getByRole('link', { name: 'View ticket' }).click();
  const detail = page.getByTestId('ticket-detail');
  await expect(detail).toContainText('Confidential');
  await expect(detail).toContainText('Confidential HR contact request');
});

test('flow 6: "No thanks" creates nothing and reopens the chat', async ({ page }) => {
  await signInAs(page, 'Tom Clarke');
  await ask(page, 'My manager keeps harassing me in team meetings');
  await page.getByTestId('private-contact-no').click();
  await expect(page.getByTestId('system-message').last()).toContainText("haven't raised a ticket");
  await expect(page.getByTestId('handoff-card').getByTestId('private-contact-yes')).toHaveCount(0);
  await expect(page.getByTestId('composer')).toBeEnabled();
  await expect(page.getByTestId('ticket-created')).toHaveCount(0);
});

import { type Browser, expect, type Page, test } from '@playwright/test';

// UC-10: the Loss of Pay scenario end to end (Build Contract v2.0 section S.2; flows
// 1, 5, 8, 3, 6 and 7 in one story). Priya was not paid for Fri 11 Sept: no
// timesheet, marked absent. She asks the copilot why, logs the day, asks payroll to
// review the deduction, and follows the request until an agent picks it up.
// The data comes from the seed for E2E_TODAY (global-setup.ts), so the day and the
// amount are fixed; the run starts from fresh demo data each time.

const LIVE = (process.env.E2E_LLM ?? 'replay') !== 'replay';
test.slow(LIVE, 'several live LLM turns');

const LOP_DAY = 'Fri 11 Sept';
const LOP_AMOUNT = '$400.00';
/** Answers to the ticket's questions for missing details, if the slot filler asks any. */
const DETAILS =
  'I worked a full day on the Banking Module on 11 September and have now logged it; please review the deduction.';

/** Signs in; employees land on the dashboard, agents on their queue. */
async function signIn(page: Page, name: string, home = /\/dashboard$/) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(home);
}

async function ask(page: Page, text: string) {
  // Typing before hydration is lost (controlled textarea): refill until Send is enabled.
  await expect(async () => {
    await page.getByTestId('composer').fill(text);
    await expect(page.getByTestId('send')).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page.getByTestId('send').click();
  await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}$/);
  await expect(page.getByTestId('live-turn')).toHaveCount(0);
}

/** An agent changes the request's status through the agent API (the agent UI is W3-07). */
async function agentSetsStatus(browser: Browser, ticketId: string, status: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const agent = await context.newPage();
  await signIn(agent, 'Hana Kim', /\/agent\/queue$/);
  const res = await agent.request.patch(`/api/agent/tickets/${ticketId}/status`, {
    data: { status },
  });
  expect(res.status()).toBe(200);
  await context.close();
}

test('LOP scenario: explain the deduction, log the day, escalate to payroll, track it', async ({
  page,
  browser,
}) => {
  // 1–2. The dashboard shows the deduction and the payroll notification.
  await signIn(page, 'Priya Shah');
  await expect(page.getByText(`Loss of Pay −${LOP_AMOUNT}`)).toBeVisible();
  await page.getByTestId('notification-bell').click();
  await expect(page.getByText('Salary reduced: Loss of Pay deduction')).toBeVisible();

  // 3–4. "Why was my salary reduced?": her records (code) and the cited policy (model),
  // shown separately, then next steps that offer to log the day and raise a request.
  await page.goto('/chat');
  await ask(page, 'Why was my salary reduced?');
  const answer = page.getByTestId('assistant-message').last();
  await expect(answer).toContainText('Your records');
  await expect(answer).toContainText(`Loss of Pay ${LOP_AMOUNT} for ${LOP_DAY}`);
  await expect(answer).toContainText('your timesheet has no hours for that day');
  await expect(answer).toContainText('What the policy says');
  await expect(answer.getByTestId('citation-chip').first()).toBeVisible();
  await expect(answer).toContainText('Next steps');

  // 5–6. Follow-up memory: "that day" is 11 Sept. The copilot proposes the entry;
  // nothing is saved before Priya confirms.
  await ask(page, 'I actually worked that day. Log 8 hours for the Banking Module on that day.');
  const card = page.getByTestId('action-card');
  await expect(card).toBeVisible();
  const entry = card.getByTestId('action-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('11 Sept');
  await expect(entry).toContainText('Banking Module');
  await expect(entry).toContainText('8');
  await expect(card).toContainText('Late entry');
  await expect(page.getByTestId('composer')).toHaveCount(0);

  // 7. Confirm: the entry is saved through the timesheet rules.
  await card.getByTestId('action-confirm').click();
  await expect(page.getByTestId('action-card')).toHaveCount(0);
  await expect(
    page.getByTestId('system-message').filter({ hasText: 'Saved to your timesheet' }),
  ).toContainText('Banking Module');

  // 8–9. Escalation: a payroll request and an email drafted from her records.
  await ask(page, 'Please contact payroll about my Loss of Pay deduction.');
  const draft = page.getByTestId('ticket-draft-card');
  for (let round = 0; round < 2 && !(await draft.isVisible()); round++) {
    await ask(page, DETAILS);
  }
  await expect(draft).toBeVisible();
  await expect(draft.getByTestId('draft-queue')).toContainText('Payroll');
  await expect(draft.getByTestId('email-draft')).toBeVisible();
  await expect(draft.getByTestId('email-to')).toContainText('payroll@example.com');
  await expect(draft.getByTestId('email-body')).toHaveValue(
    new RegExp(`Loss of Pay \\${LOP_AMOUNT}`),
  );

  // 10. Send: the request is created and the email recorded (mock outbox).
  await draft.getByTestId('draft-confirm').click();
  const created = page.getByTestId('ticket-created');
  const duplicate = page.getByTestId('duplicate-prompt');
  await expect(created.or(duplicate)).toBeVisible();
  if (await duplicate.isVisible()) await page.getByTestId('duplicate-new').click();
  await expect(created).toBeVisible();
  const humanId = ((await created.locator('span.font-semibold').textContent()) ?? '').trim();
  expect(humanId).toMatch(/^HR-\d{4,}$/);
  const href = await created.getByRole('link', { name: 'View ticket' }).getAttribute('href');
  const ticketId = href!.split('/').pop()!;

  // 11. The tracker lists it; the ticket shows the email that was sent.
  await page.goto('/tickets');
  await expect(page.getByTestId('ticket-row').filter({ hasText: humanId })).toBeVisible();
  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByTestId('ticket-human-id')).toHaveText(humanId);
  await expect(page.getByTestId('ticket-email')).toContainText('payroll@example.com');

  // 12. Hana (payroll queue) picks it up; Priya's tracker and bell follow.
  await agentSetsStatus(browser, ticketId, 'in_progress');
  await page.reload();
  await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-status', 'in_progress');
  await page.getByTestId('notification-bell').click();
  await expect(page.getByText(`${humanId} is under review`)).toBeVisible();
});

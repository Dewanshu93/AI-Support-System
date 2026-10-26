import { expect, type Page, test } from '@playwright/test';

// UC-14 (amendment A-1): voice input fills the composer; nothing is sent until the
// employee presses Send. A fake SpeechRecognition replaces the browser's, so the
// test needs no microphone and no speech service.

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (globalThis as unknown as { __speech: FakeRecognition }).__speech = this;
      }
      stop() {
        this.onend?.();
      }
    }
    (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition;
  });
});

/** Plays what the fake recognizer "heard" (a final result). */
const hear = (page: Page, transcript: string) =>
  page.evaluate((t) => {
    const r = (globalThis as unknown as { __speech: { onresult: (e: unknown) => void } }).__speech;
    r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: t } }] });
  }, transcript);

test('voice input: speech fills the composer after the typed text; nothing is sent until Send', async ({
  page,
}) => {
  await signInAs(page, 'Priya Shah');
  await page.goto('/chat');
  const composer = page.getByTestId('composer');
  await composer.fill('Hi,');

  const mic = page.getByTestId('voice-input');
  await expect(mic).toBeVisible();
  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText("Your browser's speech service turns what you say into text"),
  ).toBeVisible();

  await hear(page, 'which days am I missing this week');
  await expect(composer).toHaveValue('Hi, which days am I missing this week');
  // Still in the composer: no turn was started.
  await expect(page).toHaveURL(/\/chat$/);

  await mic.click();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
});

test('voice input: a blocked speech service shows why, and typing still works', async ({
  page,
}) => {
  await signInAs(page, 'Priya Shah');
  await page.goto('/chat');
  await page.getByTestId('voice-input').click();
  await page.evaluate(() => {
    const r = (globalThis as unknown as { __speech: { onerror: (e: unknown) => void } }).__speech;
    r.onerror({ error: 'network' });
  });
  await expect(page.getByTestId('voice-error')).toContainText(
    'cannot be reached from this network',
  );
  await page.getByTestId('composer').fill('typed instead');
  await expect(page.getByTestId('send')).toBeEnabled();
});

import { expect, type Page, test } from '@playwright/test';

// W1-06 acceptance: each persona lands on their home with the right navigation;
// logout returns to login; the prototype banner is on every page.

const PERSONAS = [
  {
    name: 'Priya Shah',
    home: '/dashboard',
    nav: ['Dashboard', 'Copilot', 'Timesheets', 'My work', 'Payroll', 'Requests'],
    badges: ['Employee', 'US', 'Full-time'],
    pages: [
      '/dashboard',
      '/chat',
      '/chat/abc',
      '/timesheets',
      '/tasks',
      '/payroll',
      '/tickets',
      '/tickets/abc',
    ],
  },
  {
    name: 'Tom Clarke',
    home: '/dashboard',
    nav: ['Dashboard', 'Copilot', 'Timesheets', 'My work', 'Payroll', 'Requests'],
    badges: ['Employee', 'UK', 'Contractor'],
    pages: ['/dashboard', '/payroll'],
  },
  {
    name: 'Sam Patel',
    home: '/agent/queue',
    nav: ['Queue'],
    badges: ['Agent', 'US', 'Full-time'],
    pages: ['/agent/queue', '/agent/tickets/abc'],
  },
  {
    name: 'Hana Kim',
    home: '/agent/queue',
    nav: ['Queue'],
    badges: ['Agent', 'UK', 'Full-time'],
    pages: ['/agent/queue'],
  },
  {
    name: 'Alex Morgan',
    home: '/admin',
    nav: ['Overview', 'Knowledge gaps', 'Traces', 'Documents', 'Evaluation', 'Agent queue'],
    badges: ['Admin', 'US', 'Full-time'],
    pages: [
      '/admin',
      '/admin/gaps',
      '/admin/traces',
      '/admin/traces/abc',
      '/admin/documents',
      '/admin/documents/abc',
      '/admin/evals',
      '/admin/evals/abc',
      '/agent/queue',
    ],
  },
] as const;

async function signInAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
}

test.describe('login and role navigation', () => {
  for (const persona of PERSONAS) {
    test(`${persona.name} lands on ${persona.home} with role navigation`, async ({ page }) => {
      await signInAs(page, persona.name);
      await expect(page).toHaveURL(new RegExp(`${persona.home}$`));

      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link')).toHaveText([...persona.nav]);

      const badge = page.getByTestId('user-badge');
      await expect(badge).toContainText(persona.name);
      for (const text of persona.badges) await expect(badge).toContainText(text);

      for (const path of persona.pages) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByTestId('prototype-banner')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
    });
  }
});

test('logout returns to login, and protected pages then redirect to login', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('prototype-banner')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('users opening another role’s area are sent to their own home', async ({ page }) => {
  await signInAs(page, 'Priya Shah');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/agent/queue');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('signed-in users visiting /login go to their home', async ({ page }) => {
  await signInAs(page, 'Sam Patel');
  await expect(page).toHaveURL(/\/agent\/queue$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/agent\/queue$/);
});

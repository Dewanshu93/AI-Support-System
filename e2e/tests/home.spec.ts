import { expect, test } from '@playwright/test';

test('home page renders the product name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI Service Desk Front Door');
});

import { expect, test } from '@playwright/test';

test('anonymous visitors land on the login picker with the prototype banner', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI Service Desk Front Door');
  await expect(page.getByTestId('prototype-banner')).toHaveText(
    'Prototype — synthetic data, mocked integrations',
  );
});

import { expect, test } from '@playwright/test';

test('home page shows the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('የመጽሐፍ ቅዱስ ካርታ');
});

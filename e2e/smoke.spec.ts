import { expect, test } from '@playwright/test';

test('home page shows the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('የመጽሐፍ ቅዱስ ካርታ');
});

test('the title uses the self-hosted Abyssinica SIL font, never Google Fonts', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) external.push(req.url());
  });
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Abyssinica');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "Abyssinica SIL"', 'የመጽሐፍ'))).toBe(
    true,
  );
  expect(external).toEqual([]);
});

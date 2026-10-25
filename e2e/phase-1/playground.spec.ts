import { expect, test } from '@playwright/test';

// /dev/* only exists in preview-style builds (BK_SEED=1), as in the e2e workflow.
test.skip(process.env.BK_SEED !== '1', 'dev pages are only built with BK_SEED=1');

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/playground/');
});

test("Ge'ez: 950 → ፱፻፶ and 1990 → ፲፱፻፺", async ({ page }) => {
  const input = page.getByTestId('geez-number');
  await input.fill('950');
  await expect(page.getByTestId('geez-number-out')).toHaveText('፱፻፶');
  await input.fill('1990');
  await expect(page.getByTestId('geez-number-out')).toHaveText('፲፱፻፺');
  await page.getByTestId('geez-text').fill('፻፻');
  await expect(page.getByTestId('geez-text-out')).toContainText('Invalid');
});

test('Dates: −852 → "853 ዓ.ዓ." and AA 3388 → "ከፍጥረት 3388"', async ({ page }) => {
  await page.getByTestId('astro-year').fill('-852');
  await expect(page.getByTestId('scholarly-am')).toHaveText('853 ዓ.ዓ.');
  await expect(page.getByTestId('scholarly-en')).toHaveText('853 BC');
  await page.getByTestId('aa-year').fill('3388');
  await expect(page.getByTestId('traditional-am')).toHaveText('ከፍጥረት 3388');
  await page.getByTestId('certainty').selectOption('approximate');
  await expect(page.getByTestId('scholarly-en')).toHaveText('c. 853 BC');
});

test('Normalizer: ሐዋርያት → ሀዋርያት and ሠራ → ሰራ', async ({ page }) => {
  const input = page.getByTestId('normalize-in');
  await input.fill('ሐዋርያት');
  await expect(page.getByTestId('normalize-out')).toHaveText('ሀዋርያት');
  await input.fill('ሠራ');
  await expect(page.getByTestId('normalize-out')).toHaveText('ሰራ');
});

import { test, expect } from '@playwright/test';

/** Walks to the Race settings screen without starting the match. */
async function openRaceConfig(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Race' }).click();
  await page.getByRole('button', { name: 'Start Race' }).click();
  await page.getByRole('button', { name: 'Continue to settings' }).click();
}

test('Race rules default to Survival Race, listed first', async ({ page }) => {
  await openRaceConfig(page);
  const scoring = page.locator('select').filter({ has: page.locator('option[value="survival"]') });
  await expect(scoring).toHaveValue('survival');
  await expect(scoring.locator('option')).toHaveText(['Survival Race', 'Time Race', 'Click Race']);
});

test('the lives field selects on focus, so typing replaces the value', async ({ page }) => {
  await openRaceConfig(page);
  const lives = page.locator('#race-lives');
  await expect(lives).toHaveValue('3');

  // The reported bug: typing appended to the default, so 3 + "7" became 37.
  await lives.click();
  await page.keyboard.type('7');
  await expect(lives).toHaveValue('7');
});

test('lives accept up to 99 and clamp above it', async ({ page }) => {
  await openRaceConfig(page);
  const lives = page.locator('#race-lives');

  await lives.click();
  await page.keyboard.type('99');
  await expect(lives).toHaveValue('99');

  // Out of range drafts are clamped on blur rather than rejected mid-typing.
  await lives.click();
  await page.keyboard.type('150');
  await lives.blur();
  await expect(lives).toHaveValue('99');
});

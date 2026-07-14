import { test, expect } from '@playwright/test';
import { startMatch, gridCells } from './helpers';

test('completes a small co-op game (team wins or is eliminated deterministically)', async ({ page }) => {
  test.setTimeout(60_000);
  // A single mine on a small board almost always cascades most of the board
  // open in very few reveals, and turns rotate (with a ~550ms transition
  // lock) after every action, so wait that out between clicks.
  await startMatch(page, { mode: 'Co-op Survival', width: 6, height: 6, mines: 1 });

  await expect(page.getByText('Player 1')).toBeVisible();
  await expect(page.getByText('Player 2')).toBeVisible();

  for (let i = 0; i < 40; i++) {
    const onResults = await page.getByText(/Team victory|Team eliminated/).count();
    if (onResults > 0) break;
    const hidden = page.locator('[role="gridcell"][aria-label="hidden"]').first();
    if ((await hidden.count()) === 0) break;
    await hidden.click();
    await page.waitForTimeout(650);
  }

  await expect(page.getByText(/Team victory|Team eliminated/)).toBeVisible();
});

test('rotates the active player after every action', async ({ page }) => {
  // Denser mine field so a single reveal is very unlikely to cascade the
  // entire board open and end the game before we get to check rotation.
  await startMatch(page, { mode: 'Co-op Survival', width: 8, height: 8, mines: 14 });
  const cells = gridCells(page);

  const activeBefore = await page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent();
  await cells.nth(0).click();

  const gameEnded = (await page.getByText(/Team victory|Team eliminated/).count()) > 0;
  test.skip(gameEnded, 'board happened to complete on the very first reveal');

  const activeAfter = await page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent();
  expect(activeAfter).not.toEqual(activeBefore);
});

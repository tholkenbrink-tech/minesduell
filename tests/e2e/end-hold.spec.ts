import { test, expect } from '@playwright/test';
import { startMatch, gridCells, giveUpRun } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

// Ending a round used to cut straight to the handover/results screen, so the
// move that ended it was gone before you could look at it.
test('a finished race run is held on screen before the handover', async ({ page }) => {
  // One life: the first mine revealed ends the run, and that revealed mine is
  // exactly what the player needs a moment to look at.
  await startMatch(page, { mode: 'Race', width: 6, height: 6, mines: 4, raceLives: 1 });
  await page.getByRole('button', { name: 'Start my run' }).click();
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });
  const mine = page.locator('[role="gridcell"][aria-label="mine"]');
  const handover = page.getByText(/Hand the device to/);

  for (let i = 0; i < 36 && (await mine.count()) === 0; i++) {
    const cell = gridCells(page).nth(i);
    if ((await cell.getAttribute('aria-label')) !== 'hidden') continue;
    await cell.click();
  }
  expect(await mine.count()).toBeGreaterThan(0);

  // The run is over, but the board it ended on is still what's on screen.
  await expect(grid).toBeVisible();
  await expect(mine.first()).toBeVisible();
  await expect(handover).toHaveCount(0);

  // Still there a second later...
  await page.waitForTimeout(1000);
  await expect(grid).toBeVisible();

  // ...and the handover arrives on its own, without a tap.
  await expect(handover).toBeVisible({ timeout: 5000 });
});

test('giving up is deliberate, so it skips the hold', async ({ page }) => {
  await startMatch(page, { mode: 'Race', width: 8, height: 8, mines: 10 });
  await page.getByRole('button', { name: 'Start my run' }).click();

  await giveUpRun(page);
  // No mistake to study — the player chose to stop, so the handover is immediate.
  await expect(page.getByText(/Hand the device to/)).toBeVisible({ timeout: 1500 });
});

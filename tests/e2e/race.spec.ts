import { test, expect } from '@playwright/test';
import { startMatch, gridCells, clickCell } from './helpers';

test('two Race runs on the same seed reveal the identical board layout', async ({ page }) => {
  await startMatch(page, { mode: 'Race', width: 6, height: 6, mines: 3 });

  await expect(page.getByText(/Hand the device to/)).toBeVisible();
  await page.getByRole('button', { name: 'Start my run' }).click();

  await clickCell(page, 0);
  const labelsP1 = await gridCells(page).evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));

  // A single cascading reveal can occasionally clear the whole tiny board,
  // auto-finishing the run and skipping straight to the handover screen —
  // only click "Give up" if the run is still actually in progress.
  const giveUp = page.getByRole('button', { name: 'Give up run' });
  if (await giveUp.isVisible().catch(() => false)) {
    await giveUp.click();
  }
  await expect(page.getByText(/Hand the device to/)).toBeVisible();
  await page.getByRole('button', { name: 'Start my run' }).click();

  await clickCell(page, 0);
  const labelsP2 = await gridCells(page).evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));

  expect(labelsP2).toEqual(labelsP1);
});

test('race results stay hidden until every player has finished', async ({ page }) => {
  await startMatch(page, { mode: 'Race', width: 6, height: 6, mines: 3 });
  await page.getByRole('button', { name: 'Start my run' }).click();
  await page.getByRole('button', { name: 'Give up run' }).click();

  // Second (final) player's handover screen — results must not be visible yet.
  await expect(page.getByText('Race results')).toHaveCount(0);
  await expect(page.getByText(/Hand the device to/)).toBeVisible();

  await page.getByRole('button', { name: 'Start my run' }).click();
  await page.getByRole('button', { name: 'Give up run' }).click();

  await expect(page.getByText('Race results')).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { startMatch, clickCell, gridCells } from './helpers';

test('restores a suspended match after a page reload', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  await clickCell(page, 0);

  const labelsBefore = await gridCells(page).evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));
  expect(labelsBefore.some((l) => l !== 'hidden')).toBe(true);

  await page.reload();

  await expect(page.getByText('Player 1')).toBeVisible();
  const labelsAfter = await gridCells(page).evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));
  expect(labelsAfter).toEqual(labelsBefore);
});

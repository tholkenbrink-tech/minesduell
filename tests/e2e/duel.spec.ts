import { test, expect } from '@playwright/test';
import { startMatch, gridCells, clickCell } from './helpers';

test('starts a two-player duel and shows both players in the HUD', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  await expect(page.getByText('Player 1')).toBeVisible();
  await expect(page.getByText('Player 2')).toBeVisible();
  await expect(gridCells(page)).toHaveCount(64);
});

test('reveals a cell on click and switches Reveal/Flag action mode', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  await clickCell(page, 0);
  const revealedCount = await page.locator('[role="gridcell"]:not([aria-label="hidden"]):not([aria-label="flagged"])').count();
  expect(revealedCount).toBeGreaterThan(0);

  await page.getByRole('radio', { name: '🚩 Flag' }).click();
  await expect(page.getByRole('radio', { name: '🚩 Flag' })).toHaveAttribute('aria-checked', 'true');
});

test('streak mode (default): a correct reveal KEEPS the same player active', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const active = () => page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent();

  const before = await active();
  await clickCell(page, 0); // first reveal is always safe → a correct move
  const after = await active();
  // The reported bug: the turn passed after every move. It must not — a
  // correct move keeps the current player's turn in streak mode.
  expect(after).toEqual(before);
});

test('flag toggle is idempotent regardless of mine placement', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  await page.getByRole('radio', { name: '🚩 Flag' }).click();

  // Target the same physical cell (by grid position) both times, regardless
  // of whether flagging it happened to end the turn. An incorrect flag ends
  // the turn and locks input for the ~550ms turn-transition overlay by
  // design, so wait that out before the second click.
  const cell = gridCells(page).nth(0);
  await cell.click();
  await expect(cell).toHaveAttribute('aria-label', 'flagged');
  await page.waitForTimeout(700);

  await cell.click();
  await expect(cell).toHaveAttribute('aria-label', 'hidden');
});

test('a mistake ends the turn and rotates the active player', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1 });
  await page.getByRole('radio', { name: '🚩 Flag' }).click();

  // With only 1 mine in 36 cells, flagging several safe cells in a row is
  // near-certain to include at least one incorrect flag, which always ends
  // the turn regardless of which cell it lands on.
  const cells = gridCells(page);
  const initialActive = await page.locator('[data-focused]').count(); // sanity: page loaded
  void initialActive;

  let sawSwitch = false;
  for (let i = 0; i < 10 && !sawSwitch; i++) {
    const before = await page.locator('.ring-2, [class*="border-\\[var(--md-accent)\\]"]').first().textContent().catch(() => null);
    await cells.nth(i).click();
    const after = await page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent().catch(() => null);
    if (before !== after) sawSwitch = true;
  }
  expect(sawSwitch).toBe(true);
});

test('face-to-face arrangement rotates board content 180° for the second player', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1, arrangement: 'Face-to-face' });
  await page.getByRole('radio', { name: '🚩 Flag' }).click();

  const cells = gridCells(page);
  let rotated = false;
  for (let i = 0; i < 12 && !rotated; i++) {
    await cells.nth(i).click();
    const transform = await cells.first().locator('span').first().evaluate((el) => getComputedStyle(el).transform);
    // rotate(180deg) resolves to matrix(-1, 0, 0, -1, 0, 0); rotate(0) is 'none' or identity matrix.
    if (transform.includes('-1')) rotated = true;
  }
  expect(rotated).toBe(true);
});

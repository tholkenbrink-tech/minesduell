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

  await page.getByRole('button', { name: 'Select Flag' }).click();
  await expect(page.getByRole('radio')).toHaveAttribute('aria-checked', 'true');
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
  await page.getByRole('button', { name: 'Select Flag' }).click();

  // Target the same physical cell (by grid position) both times, regardless
  // of whether flagging it happened to end the turn. An incorrect flag ends
  // the turn and locks input for the TURN_TRANSITION_DURATION_MS overlay by
  // design, so wait that out before the second click. Ending the turn also
  // resets actionMode to 'reveal' for the next player (by design), so
  // re-select Flag before the second click too.
  const cell = gridCells(page).nth(0);
  await cell.click();
  await expect(cell).toHaveAttribute('aria-label', 'flagged');
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: 'Select Flag' }).click();
  await cell.click();
  await expect(cell).toHaveAttribute('aria-label', 'hidden');
});

test('a mistake ends the turn and rotates the active player', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1 });
  await page.getByRole('button', { name: 'Select Flag' }).click();

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

test('face-to-face keeps the shared board neutral and rotates the far player HUD 180°', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1, arrangement: 'Face-to-face' });

  // The board between the two seats is neutral ground — its tile content is
  // never rotated (rotate(180deg) would resolve to a matrix containing -1).
  const cells = gridCells(page);
  const tileTransform = await cells.first().locator('span').first().evaluate((el) => getComputedStyle(el).transform);
  expect(tileTransform.includes('-1')).toBe(false);

  // Instead, the far player's whole HUD row is rotated 180° so it reads upright
  // from across the table. Exactly the row's root element carries the rotation
  // (its children/ancestors are not themselves rotated).
  const farHudRotated = await page.evaluate(() =>
    [...document.querySelectorAll('div')].some((el) => {
      const t = getComputedStyle(el).transform;
      return t.includes('-1') && /Player 2/.test(el.textContent || '');
    }),
  );
  expect(farHudRotated).toBe(true);
});

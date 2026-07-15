import { test, expect, devices } from '@playwright/test';
import { startMatch, gridCells } from './helpers';

// Everything here runs at an iPhone viewport — the whole point is proving the
// selected arrangement is honored on a phone and is never silently replaced by
// Side-by-Side (the reported bug).
test.use({ ...devices['iPhone 13'] });

/** True if any <div> containing `label` is rotated (its transform matrix holds a -1). */
async function hasRotatedHudFor(page: import('@playwright/test').Page, label: string) {
  return page.evaluate((needle) => {
    return [...document.querySelectorAll('div')].some((el) => {
      const t = getComputedStyle(el).transform;
      return t.includes('-1') && new RegExp(needle).test(el.textContent || '');
    });
  }, label);
}

test('iPhone: selecting Face-to-Face renders the rotated seat, not Side-by-Side', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1, arrangement: 'Face-to-face' });

  // The far (top) player's HUD is rotated 180° — this only exists in the seated
  // Face-to-Face shell. Side-by-Side would show a flat, unrotated player rail.
  expect(await hasRotatedHudFor(page, 'Player 2')).toBe(true);

  // The shared board itself stays neutral at the start (bottom player is active).
  const tileTransform = await gridCells(page).first().locator('span').first().evaluate((el) => getComputedStyle(el).transform);
  expect(tileTransform.includes('-1')).toBe(false);
});

test('iPhone: selecting Table with two players uses Face-to-Face rendering (no Side-by-Side fallback)', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 6, height: 6, mines: 1, arrangement: 'Table' });

  // Table-with-2 collapses to Face-to-Face behavior — again the rotated far seat
  // proves a seated shell rendered on the phone rather than falling back flat.
  expect(await hasRotatedHudFor(page, 'Player 2')).toBe(true);
});

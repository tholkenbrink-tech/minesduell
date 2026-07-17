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

test('plain reveals never rotate the turn — only a mistake or marking 5 bombs does', async ({ page }) => {
  // Denser mine field so a single reveal is very unlikely to cascade the
  // entire board open and end the game before we get to check rotation.
  await startMatch(page, { mode: 'Co-op Survival', width: 12, height: 12, mines: 28 });
  const active = () => page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent();

  const first = await active();
  await gridCells(page).nth(0).click(); // action 1 (safe first reveal)

  if ((await page.getByText(/Team victory|Team eliminated/).count()) > 0) {
    test.skip(true, 'board happened to complete on the first reveal');
    return;
  }
  // After a single correct action the SAME player must still be active
  // (co-op no longer rotates on every action).
  expect(await active()).toEqual(first);

  // Several more plain reveals in a row: the round only used to cap at 5
  // actions of any kind, but now the cap is 5 *marked bombs* or a mistake —
  // so reveals alone must never rotate the turn, however many happen. With
  // ~19% mine density a blind reveal can still land on a mine — that's a
  // real mistake (expected to rotate), not a violation of this rule, so
  // stop there instead of asserting.
  for (let i = 0; i < 6; i++) {
    const hidden = page.locator('[role="gridcell"][aria-label="hidden"]').first();
    if ((await hidden.count()) === 0) break;
    const clicked = await hidden.elementHandle();
    await hidden.click();
    if ((await page.getByText(/Team victory|Team eliminated/).count()) > 0) return; // board solved — nothing left to prove
    if ((await clicked?.getAttribute('aria-label')) === 'mine') return; // hit a mine — a genuine mistake, rotation is correct
    expect(await active()).toEqual(first);
  }
});

test('an incorrect flag ends the round immediately', async ({ page }) => {
  // Enough mines that flagging a few hidden cells in a row is near-certain to
  // include at least one incorrect flag (a mistake), which must end the round
  // right away regardless of how many bombs were marked before it — but not
  // so sparse that the first reveal's cascade clears (and ends) the board
  // before there's anything left to flag.
  await startMatch(page, { mode: 'Co-op Survival', width: 10, height: 10, mines: 15 });
  const active = () => page.locator('[class*="border-\\[var(--md-accent)\\]"]').first().textContent();

  await gridCells(page).nth(0).click(); // generate the board with a safe first reveal
  await page.getByRole('button', { name: 'Select Flag' }).click();

  const first = await active();
  let rotated = false;
  for (let i = 1; i < 15 && !rotated; i++) {
    const cell = gridCells(page).nth(i);
    if ((await cell.getAttribute('aria-label')) !== 'hidden') continue;
    await cell.click();
    if ((await page.getByText(/Team victory|Team eliminated/).count()) > 0) return; // team won/lost outright — nothing left to prove
    if ((await active()) !== first) rotated = true;
  }
  expect(rotated).toBe(true);
});

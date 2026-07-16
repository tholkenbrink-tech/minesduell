import { test, expect } from '@playwright/test';
import { startMatch } from './helpers';

// iPhone-sized viewport: the movable control dock behaves the same across
// devices, but the field-tint + re-anchor UX matters most on phones.
test.use({ viewport: { width: 390, height: 844 } });

const readAnchors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('minesduell:v1:preferences') || '{}').controlAnchors);

test('board tint follows the active Reveal/Mark mode', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });

  await expect(grid).toHaveAttribute('data-action-mode', 'reveal');
  await page.getByRole('button', { name: 'Select Flag' }).click();
  await expect(grid).toHaveAttribute('data-action-mode', 'flag');
  await page.getByRole('button', { name: 'Select Reveal' }).click();
  await expect(grid).toHaveAttribute('data-action-mode', 'reveal');
});

test('dragging the control dock re-anchors it and persists per player slot', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });

  // Default: slot 0 has no explicit override (renders at the natural bottom).
  expect((await readAnchors(page))?.[0] ?? null).toBeNull();

  const grip = page.getByRole('button', { name: 'Move controls' });
  const gb = (await grip.boundingBox())!;
  const gridBox = (await grid.boundingBox())!;

  // Grab the grip and drag it to the top of the play field.
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + gridBox.width / 2, gridBox.y + 24, { steps: 10 });
  await page.mouse.up();

  // The new anchor is saved for slot 0 only — a per-slot, persistent choice.
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top');
  await expect.poll(async () => (await readAnchors(page))?.[1] ?? null).toBeNull();
});

test('dragging the control dock into a corner anchors it there', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });

  const grip = page.getByRole('button', { name: 'Move controls' });
  const gb = (await grip.boundingBox())!;
  const gridBox = (await grid.boundingBox())!;

  // Grab the grip and drag it to the top-left corner of the play field.
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + 24, gridBox.y + 24, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top-left');
});

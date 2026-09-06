import { test, expect } from '@playwright/test';
import { startMatch, modeRadio } from './helpers';

// iPhone-sized viewport: the movable control dock behaves the same across
// devices, but the field-tint + re-anchor UX matters most on phones.
test.use({ viewport: { width: 390, height: 844 } });

const readAnchors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('minesduell:v1:preferences') || '{}').controlAnchors);

test('board tint follows the active Reveal/Mark mode', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });

  await expect(grid).toHaveAttribute('data-action-mode', 'reveal');
  await modeRadio(page, 'Mark mine').click();
  await expect(grid).toHaveAttribute('data-action-mode', 'flag');
  await modeRadio(page, 'Reveal').click();
  await expect(grid).toHaveAttribute('data-action-mode', 'reveal');
});

test('dragging the control dock re-anchors it and persists per player slot', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });

  // Default: slot 0 has no explicit override (renders in the docked strip
  // below the board).
  expect((await readAnchors(page))?.[0] ?? null).toBeNull();

  const grip = page.getByRole('button', { name: 'Move controls' });
  const gb = (await grip.boundingBox())!;
  const gridBox = (await grid.boundingBox())!;

  // Grab the grip and drag it to the middle of the play field's left edge.
  // (Not the top middle — that cell means "back to the HUD bar", where it
  // already is.)
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + 24, gridBox.y + gridBox.height / 2, { steps: 10 });
  await page.mouse.up();

  // The new anchor is saved for slot 0 only — a per-slot, persistent choice.
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('left');
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

test('upright, the cluster starts under the board and leaves the header alone', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });
  const cluster = page.getByRole('radiogroup', { name: 'Board action mode' });

  // Held upright there is height to spare but the header row is narrow, so
  // the bar gets its own line under the board rather than squeezing the stats
  // into a scrolling strip.
  const gridBox = (await grid.boundingBox())!;
  const clusterBox = (await cluster.boundingBox())!;
  expect(clusterBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);

  // It sits in the home slot, not floating over the board.
  const homeBox = (await page.locator('[data-dock-home]').boundingBox())!;
  expect(clusterBox.y).toBeGreaterThanOrEqual(homeBox.y - 1);
  await expect(page.getByTitle('Controls dock here')).toHaveCount(0);
});

test.describe('held horizontally', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the cluster rides in the header bar, costing no board height', async ({ page }) => {
    await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
    const grid = page.getByRole('grid', { name: 'Minesweeper board' });
    const cluster = page.getByRole('radiogroup', { name: 'Board action mode' });

    // Height is the scarce axis here, so the bar shares the row the header
    // already draws and everything below it is board.
    const gridBox = (await grid.boundingBox())!;
    const clusterBox = (await cluster.boundingBox())!;
    expect(clusterBox.y + clusterBox.height).toBeLessThanOrEqual(gridBox.y + 1);
  });

  test('"back to the bar" flips to the TOP middle of the board', async ({ page }) => {
    await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
    const gridBox = (await page.getByRole('grid', { name: 'Minesweeper board' }).boundingBox())!;

    await dragGripTo(page, gridBox.x + 24, gridBox.y + gridBox.height / 2);
    await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('left');

    await dragGripTo(page, gridBox.x + gridBox.width / 2, gridBox.y + 24);
    await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('docked');
  });
});

test('moving the cluster onto the board leaves a marker in its home slot', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });
  const gridBox = (await grid.boundingBox())!;

  await dragGripTo(page, gridBox.x + 24, gridBox.y + 24);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top-left');
  await expect(page.getByTitle('Controls dock here')).toBeVisible();
});

test('"back to the bar" follows the slot: upright, it is the BOTTOM middle', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const grid = page.getByRole('grid', { name: 'Minesweeper board' });
  const gridBox = (await grid.boundingBox())!;

  await dragGripTo(page, gridBox.x + 24, gridBox.y + 24);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top-left');

  // The center cell on the slot's side of the board sends it home, so the
  // player never has to hit the slot itself.
  await dragGripTo(page, gridBox.x + gridBox.width / 2, gridBox.y + gridBox.height - 24);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('docked');
  await expect(page.getByTitle('Controls dock here')).toHaveCount(0);

  // ...and with the slot below, the TOP middle is an ordinary anchor.
  await dragGripTo(page, gridBox.x + gridBox.width / 2, gridBox.y + 24);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top');
});

test('dropping the cluster on the home slot itself docks it', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const gridBox = (await page.getByRole('grid', { name: 'Minesweeper board' }).boundingBox())!;

  await dragGripTo(page, gridBox.x + 24, gridBox.y + 24);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('top-left');

  const homeBox = (await page.locator('[data-dock-home]').boundingBox())!;
  await dragGripTo(page, homeBox.x + homeBox.width / 2, homeBox.y + homeBox.height / 2);
  await expect.poll(async () => (await readAnchors(page))?.[0]).toBe('docked');
});

/** Drags the dock's grip to a page coordinate and releases it there. */
async function dragGripTo(page: import('@playwright/test').Page, x: number, y: number) {
  const grip = page.getByRole('button', { name: 'Move controls' });
  // The cluster glides to a new anchor over ~160ms; hover() waits for it to
  // stop moving, so the grab below lands on the grip and not on where it was.
  await grip.hover();
  const gb = (await grip.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

test('the app shell keeps clear of the notch on every edge', async ({ page }) => {
  // Held horizontally the notch and home indicator sit on the LEFT and RIGHT,
  // and with viewport-fit=cover the board was drawn underneath them.
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  const shell = page.locator('#root > div').first();
  const style = (await shell.getAttribute('style')) ?? '';
  for (const side of ['top', 'bottom', 'left', 'right']) {
    expect(style).toContain(`env(safe-area-inset-${side})`);
  }
});

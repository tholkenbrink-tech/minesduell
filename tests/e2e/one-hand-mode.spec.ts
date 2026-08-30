import { test, expect } from '@playwright/test';
import { startMatch, modeRadio } from './helpers';

// One-hand mode: the board scrolls and zooms with a single finger so the game
// is playable without a second hand. Taps must never play a move while it is
// on — that's the whole point of a dedicated mode rather than a modifier.
test.use({ viewport: { width: 390, height: 844 } });

const board = (page: import('@playwright/test').Page) => ({
  scale: () =>
    page.evaluate(() => {
      const inner = document.querySelector('[role="grid"] > div') as HTMLElement;
      return parseFloat(/scale\(([^)]+)\)/.exec(inner.style.transform)?.[1] ?? '1');
    }),
  translate: () =>
    page.evaluate(() => {
      const inner = document.querySelector('[role="grid"] > div') as HTMLElement;
      const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(inner.style.transform);
      return { x: parseFloat(m?.[1] ?? '0'), y: parseFloat(m?.[2] ?? '0') };
    }),
  revealed: () => page.locator('[role="gridcell"]:not([aria-label="hidden"])').count(),
});

/** One single-finger drag across the board, from its center by (dx, dy). */
function dragOneFinger(page: import('@playwright/test').Page, dx: number, dy: number) {
  return page.evaluate(
    ([dx, dy]) => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      const rect = grid.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fire = (type: string, x: number, y: number) =>
        grid.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' }),
        );
      fire('pointerdown', cx, cy);
      for (let step = 1; step <= 6; step++) fire('pointermove', cx + (dx * step) / 6, cy + (dy * step) / 6);
      fire('pointerup', cx + dx, cy + dy);
    },
    [dx, dy],
  );
}

/** `count` quick taps on the board center, inside the multi-tap window. */
function tapBoard(page: import('@playwright/test').Page, count: number) {
  return page.evaluate((count) => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const rect = grid.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const id = 100 + i;
      for (const type of ['pointerdown', 'pointerup']) {
        grid.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: cx, clientY: cy, pointerId: id, pointerType: 'touch' }),
        );
      }
    }
  }, count);
}

test('one finger pans the board and never plays a move', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await modeRadio(page, 'One-hand scroll and zoom').click();
  await expect(page.getByRole('grid')).toHaveAttribute('data-action-mode', 'pan');

  const before = await b.translate();
  await dragOneFinger(page, -90, -60);
  const after = await b.translate();

  expect(after.x).toBeCloseTo(before.x - 90, 0);
  expect(after.y).toBeCloseTo(before.y - 60, 0);
  expect(await b.revealed()).toBe(0);
});

test('with one-hand mode off, one finger neither pans nor drags a move out', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);

  const before = await b.translate();
  await dragOneFinger(page, -90, -60);

  expect(await b.translate()).toEqual(before);
  expect(await b.revealed()).toBe(0);
});

test('double tap zooms in a step, triple tap zooms back out', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await modeRadio(page, 'One-hand scroll and zoom').click();

  // A single tap resolves to nothing at all — no move, no zoom.
  await tapBoard(page, 1);
  await page.waitForTimeout(400);
  expect(await b.scale()).toBeCloseTo(1, 2);
  expect(await b.revealed()).toBe(0);

  await tapBoard(page, 2);
  await page.waitForTimeout(400);
  const zoomedIn = await b.scale();
  expect(zoomedIn).toBeGreaterThan(1);

  await tapBoard(page, 3);
  await page.waitForTimeout(400);
  expect(await b.scale()).toBeLessThan(zoomedIn);
  expect(await b.revealed()).toBe(0);
});

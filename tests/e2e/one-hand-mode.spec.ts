import { test, expect } from '@playwright/test';
import { startMatch, modeRadio } from './helpers';

// One-hand mode is a switch layered on top of the action mode, not a third
// mode: with it on a drag scrolls the board while a tap still plays a move.
test.use({ viewport: { width: 390, height: 844 } });

const scrollToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'One-hand scrolling' });

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
  flagged: () => page.locator('[role="gridcell"][aria-label="flagged"]').count(),
});

/** One single-finger gesture from the board center: a drag when (dx, dy) is
 *  large, a plain tap when it is (0, 0). `holdMs` waits before releasing. */
async function oneFinger(
  page: import('@playwright/test').Page,
  { dx = 0, dy = 0, holdMs = 0 }: { dx?: number; dy?: number; holdMs?: number },
) {
  await page.evaluate(
    ([dx, dy]) => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      const rect = grid.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      (window as unknown as { __end: () => void }).__end = () => {
        grid.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: cx + dx,
            clientY: cy + dy,
            pointerId: 1,
            pointerType: 'touch',
          }),
        );
      };
      const fire = (type: string, x: number, y: number) =>
        grid.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' }),
        );
      fire('pointerdown', cx, cy);
      for (let step = 1; step <= 6; step++) fire('pointermove', cx + (dx * step) / 6, cy + (dy * step) / 6);
    },
    [dx, dy],
  );
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.evaluate(() => (window as unknown as { __end: () => void }).__end());
}

test('a drag scrolls the board while a tap still reveals', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await scrollToggle(page).click();
  await expect(scrollToggle(page)).toHaveAttribute('aria-pressed', 'true');

  const before = await b.translate();
  await oneFinger(page, { dx: -90, dy: -60 });
  const after = await b.translate();
  expect(after.x).toBeCloseTo(before.x - 90, 0);
  expect(after.y).toBeCloseTo(before.y - 60, 0);
  expect(await b.revealed()).toBe(0); // the drag itself plays nothing

  // ...but a tap that never leaves its tile still reveals, without switching off.
  await oneFinger(page, {});
  expect(await b.revealed()).toBeGreaterThan(0);
  await expect(scrollToggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('press-and-hold still marks a mine while scrolling is on', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await scrollToggle(page).click();

  await oneFinger(page, { holdMs: 600 });
  expect(await b.flagged()).toBe(1);
  // The hold must not also count as a tap on release.
  expect(await b.revealed()).toBe(1); // the flagged tile only
  // And the action mode is untouched — the hold is a shortcut, not a switch.
  await expect(modeRadio(page, 'Reveal')).toHaveAttribute('aria-checked', 'true');
});

test('with one-hand mode off, one finger drags nothing', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await expect(scrollToggle(page)).toHaveAttribute('aria-pressed', 'false');

  const before = await b.translate();
  await oneFinger(page, { dx: -90, dy: -60 });
  expect(await b.translate()).toEqual(before);
  expect(await b.revealed()).toBe(0);
});

test('the zoom buttons appear only with one-hand mode on, and step the board', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  const b = board(page);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);

  await scrollToggle(page).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomedIn = await b.scale();
  expect(zoomedIn).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(await b.scale()).toBeLessThan(zoomedIn);

  await scrollToggle(page).click();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
});

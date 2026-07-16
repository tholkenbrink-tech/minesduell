import { test, expect } from '@playwright/test';
import { startMatch } from './helpers';

test('pinch zooms the board in, clamped to 130%, and wheel zooms out, clamped to 70%', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });

  const getScale = () =>
    page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      const inner = grid.querySelector(':scope > div') as HTMLElement;
      const m = /scale\(([^)]+)\)/.exec(inner.style.transform);
      return m ? parseFloat(m[1]) : 1;
    });

  expect(await getScale()).toBeCloseTo(1, 5);

  // Pinch outward (increase finger spacing) — should zoom in, clamped at 1.3.
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const rect = grid.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type: string, id: number, x: number, y: number) =>
      grid.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch' }),
      );
    fire('pointerdown', 1, cx - 20, cy);
    fire('pointerdown', 2, cx + 20, cy);
    for (let step = 1; step <= 8; step++) {
      fire('pointermove', 1, cx - 20 - step * 15, cy);
      fire('pointermove', 2, cx + 20 + step * 15, cy);
    }
    fire('pointerup', 1, cx - 140, cy);
    fire('pointerup', 2, cx + 140, cy);
  });

  expect(await getScale()).toBeCloseTo(1.3, 2);

  // Wheel zoom out — should clamp at 0.7.
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const rect = grid.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      grid.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 300,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  });

  expect(await getScale()).toBeCloseTo(0.7, 2);
});

import { test, expect } from '@playwright/test';
import { startMatch } from './helpers';

test('two-finger panning a large board never reveals a tile', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });

  const revealedBefore = await page.locator('[role="gridcell"]:not([aria-label="hidden"])').count();
  expect(revealedBefore).toBe(0);

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
    for (let step = 1; step <= 5; step++) {
      fire('pointermove', 1, cx - 20 - step * 15, cy - step * 10);
      fire('pointermove', 2, cx + 20 - step * 15, cy - step * 10);
    }
    fire('pointerup', 1, cx - 20 - 75, cy - 50);
    fire('pointerup', 2, cx + 20 - 75, cy - 50);
  });

  const revealedAfter = await page.locator('[role="gridcell"]:not([aria-label="hidden"])').count();
  expect(revealedAfter).toBe(0);
});

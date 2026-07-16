import { test, expect, type Page } from '@playwright/test';
import { startMatch } from './helpers';

const cue = (page: Page, side: 'left' | 'right' | 'top' | 'bottom') =>
  page.locator(`[data-edge-cue="${side}"]`);

const activeStates = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll('[data-edge-cue]')).map((el) => [
        el.getAttribute('data-edge-cue'),
        el.getAttribute('data-active') === 'true',
      ]),
    ),
  );

/** Pans via a middle-mouse drag — the board's dedicated pure-pan path, with
 * none of the pinch handler's zoom math — so no tile is ever revealed and
 * the pan distance is exact. */
async function panBy(page: Page, dx: number, dy: number) {
  await page.evaluate(
    ([mx, my]) => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      const rect = grid.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fire = (type: string, x: number, y: number, button = -1) =>
        grid.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button }),
        );
      fire('pointerdown', cx, cy, 1); // middle button starts the pan drag
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        fire('pointermove', cx + ((mx as number) * s) / steps, cy + ((my as number) * s) / steps);
      }
      fire('pointerup', cx + (mx as number), cy + (my as number), 1);
    },
    [dx, dy] as const,
  );
}

/** Repeats a directional two-finger drag until the board stops moving —
 * i.e. the pan has hit the clamp at that corner of the play field. */
async function panToLimit(page: Page, dx: number, dy: number) {
  let prev = '';
  for (let i = 0; i < 30; i++) {
    await panBy(page, dx, dy);
    const t = await page.evaluate(
      () => (document.querySelector('[role="grid"] > div') as HTMLElement).style.transform,
    );
    if (t === prev) return;
    prev = t;
  }
}

test('small board fully in view shows no edge cues', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });
  expect(await activeStates(page)).toEqual({ left: false, right: false, top: false, bottom: false });
});

test('large board centered shows cues on the sides with hidden field', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });
  // 30x40 tiles at 42px far exceeds the viewport in both axes when centered.
  await expect(cue(page, 'left')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'right')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'top')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'bottom')).toHaveAttribute('data-active', 'true');
});

test('cues update live per edge while panning to a corner', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 30, height: 40, mines: 120 });

  // Drag the board content far down-right = view moves to the TOP-LEFT corner
  // of the field: the true left/top edges become visible, right/bottom remain.
  await panToLimit(page, 400, 400);

  await expect(cue(page, 'left')).not.toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'top')).not.toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'right')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'bottom')).toHaveAttribute('data-active', 'true');

  // And the opposite corner flips all four states.
  await panToLimit(page, -400, -400);

  await expect(cue(page, 'left')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'top')).toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'right')).not.toHaveAttribute('data-active', 'true');
  await expect(cue(page, 'bottom')).not.toHaveAttribute('data-active', 'true');
});

test('zooming in near a corner keeps only the inward cues active', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 12, height: 12, mines: 10 });

  // Zoom to max via wheel at the board's top-left visible corner, then pan
  // hard to the top-left corner of the field.
  await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]') as HTMLElement;
    const rect = grid.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      grid.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -300,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  });
  await panToLimit(page, 400, 400);

  const states = await activeStates(page);
  expect(states.left).toBe(false);
  expect(states.top).toBe(false);
});

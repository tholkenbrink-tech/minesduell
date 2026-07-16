import { test, expect, type Page } from '@playwright/test';
import { startMatch, gridCells } from './helpers';

// Mirrors LONG_PRESS_MS (350) in BoardView.tsx with headroom for CI jitter.
const HOLD_MS = 550;

async function cellCenter(page: Page, index: number) {
  const box = await gridCells(page).nth(index).boundingBox();
  if (!box) throw new Error(`cell ${index} has no bounding box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function firePointer(page: Page, type: string, x: number, y: number) {
  return page.evaluate(
    ([t, px, py]) => {
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      grid.dispatchEvent(
        new PointerEvent(t as string, {
          bubbles: true,
          clientX: px as number,
          clientY: py as number,
          pointerId: 1,
          pointerType: 'touch',
        }),
      );
    },
    [type, x, y] as const,
  );
}

const flagged = (page: Page) => page.locator('[role="gridcell"][aria-label="flagged"]');
const nonHidden = (page: Page) => page.locator('[role="gridcell"]:not([aria-label="hidden"])');

test('press-and-hold marks the tile without switching to Mark mode', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  const { x, y } = await cellCenter(page, 0);
  await firePointer(page, 'pointerdown', x, y);
  await page.waitForTimeout(HOLD_MS);
  await firePointer(page, 'pointerup', x, y);

  await expect(flagged(page)).toHaveCount(1);
  // The action-mode toggle itself must still be on Reveal.
  await expect(page.locator('[role="grid"]')).toHaveAttribute('data-action-mode', 'reveal');
});

test('a quick tap still reveals and never marks', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  const { x, y } = await cellCenter(page, 0);
  await firePointer(page, 'pointerdown', x, y);
  await page.waitForTimeout(80);
  await firePointer(page, 'pointerup', x, y);

  await expect(flagged(page)).toHaveCount(0);
  expect(await nonHidden(page).count()).toBeGreaterThan(0);
});

test('a drag during the hold cancels press-to-mark (no mark, no reveal)', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  const { x, y } = await cellCenter(page, 0);
  await firePointer(page, 'pointerdown', x, y);
  await page.waitForTimeout(100);
  await firePointer(page, 'pointermove', x + 30, y + 30); // > move tolerance
  await page.waitForTimeout(HOLD_MS);
  await firePointer(page, 'pointerup', x + 30, y + 30);

  await expect(flagged(page)).toHaveCount(0);
  await expect(nonHidden(page)).toHaveCount(0);
});

test('the long press never fires a second (tap) action on release', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  // In Mark mode a tap toggles the flag — if pointerup double-fired after the
  // hold, the mark would be removed again immediately.
  await page.getByRole('button', { name: 'Select Flag' }).click();
  const { x, y } = await cellCenter(page, 0);
  await firePointer(page, 'pointerdown', x, y);
  await page.waitForTimeout(HOLD_MS);
  await firePointer(page, 'pointerup', x, y);

  await expect(flagged(page)).toHaveCount(1);
});

test('the Pause toggle disables press-to-mark and persists', async ({ page }) => {
  await startMatch(page, { mode: 'Duel', width: 8, height: 8, mines: 5 });

  await page.keyboard.press('Escape');
  // The toggle's visual track (a styled span) covers the checkbox input, so
  // click the label text — the wrapping <label> forwards it to the input.
  const checkbox = page.getByRole('checkbox', { name: /Press & hold to mark/ });
  await expect(checkbox).toBeChecked();
  await page.getByText('Press & hold to mark', { exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: 'Resume' }).click();

  const { x, y } = await cellCenter(page, 0);
  await firePointer(page, 'pointerdown', x, y);
  await page.waitForTimeout(HOLD_MS);
  await firePointer(page, 'pointerup', x, y);

  // No mark; the long hold also exceeds the tap window, so nothing reveals.
  await expect(flagged(page)).toHaveCount(0);
  await expect(nonHidden(page)).toHaveCount(0);

  // Persisted: survives a reload.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('minesduell:v1:preferences') ?? '{}'));
  expect(saved.pressToMark).toBe(false);
});

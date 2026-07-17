import type { Page } from '@playwright/test';

export async function startMatch(
  page: Page,
  opts: {
    mode: 'Duel' | 'Race' | 'Co-Op';
    width?: number;
    height?: number;
    mines?: number;
    arrangement?: 'Side-by-side' | 'Face-to-face' | 'Table';
  },
) {
  await page.goto('/');
  await page.getByRole('tab', { name: opts.mode }).click();
  await page.getByRole('button', { name: `Start ${opts.mode}` }).click();
  await page.getByRole('button', { name: 'Continue to settings' }).click();

  if (opts.width) await page.locator('#board-width').fill(String(opts.width));
  if (opts.height) await page.locator('#board-height').fill(String(opts.height));
  if (opts.mines) await page.locator('#board-mines').fill(String(opts.mines));
  if (opts.arrangement) {
    await page.getByRole('radio', { name: opts.arrangement }).click();
  }
  // Duel's default "first to 10 mines" target can exceed a small custom mine
  // count, which disables Start game — clamp it down whenever we shrink the board.
  if (opts.mode === 'Duel' && opts.mines) {
    const target = page.locator('#duel-target-count');
    if (await target.count()) await target.fill(String(Math.max(1, Math.min(opts.mines, 3))));
  }

  await page.getByRole('button', { name: 'Start game' }).click();
}

export function gridCells(page: Page) {
  return page.locator('[role="gridcell"]');
}

export async function clickCell(page: Page, index: number) {
  await gridCells(page).nth(index).click();
}

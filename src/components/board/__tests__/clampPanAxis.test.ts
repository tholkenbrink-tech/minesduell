import { describe, expect, it } from 'vitest';
import { clampPanAxis } from '../BoardView';

// Half a tile of overscroll on every side, so scrolling to the end of the
// field shows a strip of background rather than stopping flush on the tiles.
const MARGIN = 21; // half a 42px "comfortable" tile at 100% zoom

describe('clampPanAxis (pan limits with the end-of-field margin)', () => {
  it('lets a large board be pulled half a tile past its own left/top edge', () => {
    expect(clampPanAxis(500, 400, 1000, MARGIN)).toBe(MARGIN);
    expect(clampPanAxis(MARGIN, 400, 1000, MARGIN)).toBe(MARGIN);
  });

  it('lets a large board be pulled half a tile past its own right/bottom edge', () => {
    // Flush would be 400 - 1000 = -600; the margin extends that to -621.
    expect(clampPanAxis(-5000, 400, 1000, MARGIN)).toBe(-600 - MARGIN);
  });

  it('leaves any pan well inside the field untouched', () => {
    expect(clampPanAxis(-300, 400, 1000, MARGIN)).toBe(-300);
  });

  it('applies the same margin at both ends for a board smaller than the viewport', () => {
    expect(clampPanAxis(-999, 400, 200, MARGIN)).toBe(-MARGIN);
    expect(clampPanAxis(999, 400, 200, MARGIN)).toBe(200 + MARGIN);
    // Centered stays centered.
    expect(clampPanAxis(100, 400, 200, MARGIN)).toBe(100);
  });

  it('collapses to the old flush-edge behavior at margin 0', () => {
    expect(clampPanAxis(500, 400, 1000, 0)).toBe(0);
    expect(clampPanAxis(-5000, 400, 1000, 0)).toBe(-600);
  });
});

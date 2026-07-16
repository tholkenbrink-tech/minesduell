import { describe, expect, it } from 'vitest';
import { computeEdgeOverflow } from '../BoardView';

const VIEW = { w: 400, h: 300 };

describe('computeEdgeOverflow (per-edge scroll cues)', () => {
  it('reports no overflow anywhere for a board smaller than the viewport', () => {
    // 200x150 board centered in a 400x300 view.
    const edges = computeEdgeOverflow({ x: 100, y: 75 }, VIEW, 200, 150);
    expect(edges).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it('reports overflow on all four sides for a large board panned to its middle', () => {
    // 1000x800 board with its center in view: hidden content on every side.
    const edges = computeEdgeOverflow({ x: -300, y: -250 }, VIEW, 1000, 800);
    expect(edges).toEqual({ left: true, right: true, top: true, bottom: true });
  });

  it('clears exactly the sides whose true board edge is visible (corner case)', () => {
    // Large board panned fully to its top-left corner: the real left/top
    // edges are flush with the viewport, so only right/bottom still hint.
    const edges = computeEdgeOverflow({ x: 0, y: 0 }, VIEW, 1000, 800);
    expect(edges).toEqual({ left: false, right: true, top: false, bottom: true });
  });

  it('clears right/bottom when panned fully to the bottom-right corner', () => {
    const edges = computeEdgeOverflow({ x: VIEW.w - 1000, y: VIEW.h - 800 }, VIEW, 1000, 800);
    expect(edges).toEqual({ left: true, right: false, top: true, bottom: false });
  });

  it('supports mixed states: one axis at the edge, the other overflowing', () => {
    // Flush left, vertically mid-board.
    const edges = computeEdgeOverflow({ x: 0, y: -200 }, VIEW, 1000, 800);
    expect(edges).toEqual({ left: false, right: true, top: true, bottom: true });
  });

  it('absorbs subpixel rounding near an edge via the epsilon', () => {
    const edges = computeEdgeOverflow({ x: -1.5, y: 0.5 }, VIEW, 1000, 800);
    expect(edges.left).toBe(false);
    expect(edges.top).toBe(false);
  });

  it('scaled (zoomed) board dimensions drive the result', () => {
    // A 300x200 board at 1.5x zoom is 450x300 on screen — wider than the view.
    const edges = computeEdgeOverflow({ x: 0, y: 0 }, VIEW, 300 * 1.5, 200 * 1.5);
    expect(edges).toEqual({ left: false, right: true, top: false, bottom: false });
  });

  it('shows nothing while the container is unmeasured (0x0)', () => {
    const edges = computeEdgeOverflow({ x: -50, y: -50 }, { w: 0, h: 0 }, 1000, 800);
    expect(edges).toEqual({ left: false, right: false, top: false, bottom: false });
  });
});

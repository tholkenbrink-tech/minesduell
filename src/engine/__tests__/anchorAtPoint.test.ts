import { describe, expect, it } from 'vitest';
import { anchorAtPoint } from '../arrangement';

// A 300x356 dock box at the origin: a 300x300 play field with the 56px
// reserved strip beneath it. Play-field thirds are 100px wide/tall.
const RECT = { left: 0, top: 0, width: 300, height: 356 };
const STRIP = 56;
const at = (x: number, y: number) => anchorAtPoint({ x, y }, RECT, STRIP);

describe('anchorAtPoint (where a dropped control cluster lands)', () => {
  it('maps the play field to a 3x3 of on-board anchors', () => {
    expect(at(50, 50)).toBe('top-left');
    expect(at(150, 50)).toBe('top');
    expect(at(250, 50)).toBe('top-right');
    expect(at(50, 150)).toBe('left');
    expect(at(150, 150)).toBe('center');
    expect(at(250, 150)).toBe('right');
    expect(at(50, 250)).toBe('bottom-left');
    expect(at(250, 250)).toBe('bottom-right');
  });

  it('sends the whole bottom middle home — the strip and the cell above it', () => {
    // The strip below the board...
    expect(at(150, 330)).toBe('docked');
    // ...and the bottom-center of the play field itself, since there is no
    // inside-the-board bottom anchor to confuse it with.
    expect(at(150, 250)).toBe('docked');
  });

  it('treats the full width of the strip as home, not just its middle', () => {
    expect(at(5, 320)).toBe('docked');
    expect(at(295, 350)).toBe('docked');
  });

  it('returns null outside the box, which snaps the cluster back', () => {
    expect(at(-1, 100)).toBeNull();
    expect(at(301, 100)).toBeNull();
    expect(at(150, -1)).toBeNull();
    expect(at(150, 357)).toBeNull();
  });

  it('clamps the edges instead of falling off the grid', () => {
    expect(at(0, 0)).toBe('top-left');
    expect(at(300, 0)).toBe('top-right');
    expect(at(299.9, 299.9)).toBe('bottom-right');
  });

  it('never divides by zero on a not-yet-laid-out box', () => {
    expect(anchorAtPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, STRIP)).toBeNull();
  });
});

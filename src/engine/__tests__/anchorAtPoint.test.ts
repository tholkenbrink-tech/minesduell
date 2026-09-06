import { describe, expect, it } from 'vitest';
import { anchorAtPoint, homeSideCell } from '../arrangement';

// A 300x300 play field at the origin, with the layout's home slot sitting in
// the HUD bar above it (a 60x24 pill centered at the top). Field thirds are
// 100px wide/tall.
const FIELD = { left: 0, top: 40, width: 300, height: 300 };
const HOME_ABOVE = { left: 120, top: 8, width: 60, height: 24 };
const HOME_BELOW = { left: 120, top: 348, width: 60, height: 24 };
const at = (x: number, y: number, home = HOME_ABOVE) => anchorAtPoint({ x, y }, FIELD, home);

describe('anchorAtPoint (where a dropped control cluster lands)', () => {
  it('maps the play field to a 3x3 of on-board anchors', () => {
    expect(at(50, 90)).toBe('top-left');
    expect(at(250, 90)).toBe('top-right');
    expect(at(50, 190)).toBe('left');
    expect(at(150, 190)).toBe('center');
    expect(at(250, 190)).toBe('right');
    expect(at(50, 290)).toBe('bottom-left');
    expect(at(150, 290)).toBe('bottom');
    expect(at(250, 290)).toBe('bottom-right');
  });

  it('sends a drop on the home slot itself back to the bar', () => {
    expect(at(150, 20)).toBe('docked');
  });

  it('also sends the center cell on the home side back to the bar', () => {
    // With the bar above, aiming at the top middle of the board means "home" —
    // the player never has to hit the thin slot outside the field.
    expect(at(150, 90)).toBe('docked');
  });

  it('mirrors that rule when the layout puts the bar below the field', () => {
    expect(at(150, 290, HOME_BELOW)).toBe('docked');
    // ...and the top middle is then an ordinary on-board anchor again.
    expect(at(150, 90, HOME_BELOW)).toBe('top');
    expect(at(150, 360, HOME_BELOW)).toBe('docked');
  });

  it('returns null outside the field, which snaps the cluster back', () => {
    expect(at(-1, 190)).toBeNull();
    expect(at(301, 190)).toBeNull();
    expect(at(150, 341)).toBeNull();
    // Above the field but not on the home slot either.
    expect(at(10, 20)).toBeNull();
  });

  it('clamps the field edges instead of falling off the grid', () => {
    expect(at(0, 40)).toBe('top-left');
    expect(at(300, 40)).toBe('top-right');
    expect(at(299.9, 339.9)).toBe('bottom-right');
  });

  it('treats a layout with no home slot as if the bar were above', () => {
    expect(anchorAtPoint({ x: 150, y: 90 }, FIELD, null)).toBe('docked');
    expect(homeSideCell(FIELD, null)).toBe('top');
  });

  it('never divides by zero on a not-yet-laid-out box', () => {
    expect(anchorAtPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { CONTROL_ANCHORS, dockIsVertical, type ControlAnchor } from '../arrangement';

const HORIZONTAL_ANCHORS: ControlAnchor[] = ['top', 'docked', 'center'];
const VERTICAL_ANCHORS = CONTROL_ANCHORS.filter((a) => !HORIZONTAL_ANCHORS.includes(a));

describe('dockIsVertical', () => {
  it('lays the cluster out vertically on the side edges AND in every corner', () => {
    // The corners are the whole point of this rule: on a phone held upright a
    // horizontal cluster in a corner still spans a big slice of the board.
    expect(VERTICAL_ANCHORS).toEqual([
      'top-left',
      'top-right',
      'left',
      'right',
      'bottom-left',
      'bottom-right',
    ]);
    for (const anchor of VERTICAL_ANCHORS) {
      expect(dockIsVertical(anchor, 0)).toBe(true);
    }
  });

  it('keeps the top/bottom edges and the center horizontal', () => {
    for (const anchor of HORIZONTAL_ANCHORS) {
      expect(dockIsVertical(anchor, 0)).toBe(false);
    }
  });

  it('is unaffected by a 180° seat, which does not swap the axes', () => {
    for (const anchor of CONTROL_ANCHORS) {
      expect(dockIsVertical(anchor, 180)).toBe(dockIsVertical(anchor, 0));
    }
  });

  it('inverts the pre-rotation layout for 90°/270° seats, whose rotation swaps the axes', () => {
    for (const rotation of [90, 270] as const) {
      for (const anchor of CONTROL_ANCHORS) {
        expect(dockIsVertical(anchor, rotation)).toBe(!dockIsVertical(anchor, 0));
      }
    }
  });
});

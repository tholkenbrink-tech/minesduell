import { describe, expect, it } from 'vitest';
import {
  SEAT_ROTATION,
  activeContentRotation,
  arrangementDisabledReason,
  defaultSeats,
  emptyTableSide,
  isArrangementCompatible,
  migrateArrangement,
  renderArrangement,
  resolveControlAnchor,
  seatForPlayer,
} from '../arrangement';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('arrangement — seat rotation map', () => {
  it('maps each side to its clockwise rotation', () => {
    // A clockwise rotation carries the content's bottom edge to the left, so
    // the left seat needs 90° (not 270°) to bring that edge to them, and the
    // right seat needs 270° — the reverse of the seat's own screen-side name.
    expect(SEAT_ROTATION).toEqual({ bottom: 0, right: 270, top: 180, left: 90 });
  });
});

describe('arrangement — migration', () => {
  it('migrates a legacy "auto" value to side-by-side', () => {
    expect(migrateArrangement('auto')).toBe('side-by-side');
  });
  it('migrates anything unrecognized to side-by-side', () => {
    expect(migrateArrangement(undefined)).toBe('side-by-side');
    expect(migrateArrangement('nonsense')).toBe('side-by-side');
  });
  it('passes supported values through unchanged', () => {
    expect(migrateArrangement('side-by-side')).toBe('side-by-side');
    expect(migrateArrangement('face-to-face')).toBe('face-to-face');
    expect(migrateArrangement('table')).toBe('table');
  });
});

describe('arrangement — compatibility', () => {
  it('allows Face-to-Face only for exactly two players', () => {
    expect(isArrangementCompatible('face-to-face', 2)).toBe(true);
    expect(isArrangementCompatible('face-to-face', 3)).toBe(false);
    expect(isArrangementCompatible('face-to-face', 4)).toBe(false);
  });
  it('allows Table and Side-by-Side for two to four players', () => {
    for (const n of [2, 3, 4]) {
      expect(isArrangementCompatible('table', n)).toBe(true);
      expect(isArrangementCompatible('side-by-side', n)).toBe(true);
    }
    expect(isArrangementCompatible('table', 5)).toBe(false);
  });
  it('explains why an incompatible option is disabled', () => {
    expect(arrangementDisabledReason('face-to-face', 3)).toMatch(/2 players/);
    expect(arrangementDisabledReason('face-to-face', 2)).toBeNull();
  });
});

describe('arrangement — render variant (device-independent)', () => {
  it('renders Table-with-two-players as Face-to-Face behavior', () => {
    expect(renderArrangement('table', 2)).toBe('face-to-face');
  });
  it('keeps three/four-player Table as Table', () => {
    expect(renderArrangement('table', 3)).toBe('table');
    expect(renderArrangement('table', 4)).toBe('table');
  });
  it('never replaces the selected arrangement otherwise', () => {
    expect(renderArrangement('side-by-side', 4)).toBe('side-by-side');
    expect(renderArrangement('face-to-face', 2)).toBe('face-to-face');
  });
});

describe('arrangement — default seats', () => {
  it('seats every side-by-side player at the bottom, upright', () => {
    const seats = defaultSeats('side-by-side', ids(4));
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'bottom', 'bottom', 'bottom']);
    expect(seats.every((s) => s.rotation === 0)).toBe(true);
    expect(seats.map((s) => s.turnOrder)).toEqual([0, 1, 2, 3]);
  });

  it('maps Face-to-Face players to bottom and top', () => {
    const seats = defaultSeats('face-to-face', ids(2));
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'top']);
    expect(seats.map((s) => s.rotation)).toEqual([0, 180]);
  });

  it('rotates a four-player Table bottom → left → top → right', () => {
    const seats = defaultSeats('table', ids(4));
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'left', 'top', 'right']);
    expect(seats.map((s) => s.rotation)).toEqual([0, 90, 180, 270]);
  });

  it('seats a three-player Table on three sides, leaving one empty', () => {
    const seats = defaultSeats('table', ids(3));
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'top', 'right']);
    expect(emptyTableSide(seats)).toBe('left');
  });

  it('lets a three-player Table choose which side stays empty', () => {
    const seats = defaultSeats('table', ids(3), { emptySide: 'right' });
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'left', 'top']);
    expect(emptyTableSide(seats)).toBe('right');
  });

  it('renders a two-player Table using Face-to-Face seating', () => {
    const seats = defaultSeats('table', ids(2));
    expect(seats.map((s) => s.position)).toEqual(['bottom', 'top']);
    expect(emptyTableSide(seats)).toBeNull();
  });
});

describe('arrangement — active content rotation', () => {
  it('alternates 0° and 180° across a Face-to-Face turn', () => {
    const seats = defaultSeats('face-to-face', ids(2));
    expect(activeContentRotation(seats, 'p0')).toBe(0);
    expect(activeContentRotation(seats, 'p1')).toBe(180);
  });

  it('uses 0/90/180/270 for the four Table seats (bottom/left/top/right)', () => {
    const seats = defaultSeats('table', ids(4));
    expect(['p0', 'p1', 'p2', 'p3'].map((id) => activeContentRotation(seats, id))).toEqual([0, 90, 180, 270]);
  });

  it('falls back to 0° for an unknown active player', () => {
    const seats = defaultSeats('table', ids(4));
    expect(activeContentRotation(seats, 'ghost')).toBe(0);
    expect(activeContentRotation(seats, undefined)).toBe(0);
  });
});

describe('arrangement — eliminated players keep their seat', () => {
  it('resolves a seat by playerId regardless of turn/elimination state', () => {
    // Seats are keyed by playerId, so an eliminated player (skipped by the
    // engine's turn rotation) keeps the exact same seat — no reseating.
    const seats = defaultSeats('table', ids(4));
    const before = seatForPlayer(seats, 'p2');
    // Nothing about elimination touches the seat list.
    const after = seatForPlayer(seats, 'p2');
    expect(after).toEqual(before);
    expect(after?.position).toBe('top');
  });
});

describe('arrangement — control anchor resolution', () => {
  it('defaults an unset anchor to the active seat side', () => {
    // Side-by-side seats everyone at the bottom → the natural anchor is bottom.
    expect(resolveControlAnchor(null, 'bottom')).toBe('bottom');
    // Table seat sides map to their own edge so controls dock beside the player.
    expect(resolveControlAnchor(null, 'right')).toBe('right');
    expect(resolveControlAnchor(null, 'top')).toBe('top');
    expect(resolveControlAnchor(null, 'left')).toBe('left');
  });

  it('falls back to bottom when there is no seat', () => {
    expect(resolveControlAnchor(null, undefined)).toBe('bottom');
    expect(resolveControlAnchor(undefined, undefined)).toBe('bottom');
  });

  it('lets an explicit user override win everywhere, over any seat side', () => {
    // The whole point of the movable dock: the saved choice beats the default,
    // regardless of which seat is active (Face-to-Face / Table included).
    expect(resolveControlAnchor('center', 'right')).toBe('center');
    expect(resolveControlAnchor('bottom', 'top')).toBe('bottom');
    expect(resolveControlAnchor('left', 'bottom')).toBe('left');
  });
});

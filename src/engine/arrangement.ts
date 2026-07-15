// Device-arrangement layer — pure, framework-agnostic seat/orientation logic.
//
// This module is deliberately separate from the game engine (duel/race/coop):
// the engine owns players, turn order, and board state; the arrangement layer
// owns *only* how player-facing content is seated and rotated around the fixed
// board. Nothing here reads or mutates game state, so it is trivially unit
// testable and can never alter mines, scores, turns, or the board grid.

import type { DeviceArrangement } from './types';

export type { DeviceArrangement };

export type SeatPosition = 'bottom' | 'right' | 'top' | 'left';
export type SeatRotation = 0 | 90 | 180 | 270;

/**
 * Where the active player's Reveal/Mark control cluster docks on screen. This is
 * a *position* only — the cluster's content is always rotated upright for the
 * active seat regardless of anchor. `null` (the default) means "use the natural
 * spot for the arrangement"; any explicit value is a user override.
 */
export type ControlAnchor = 'bottom' | 'top' | 'left' | 'right' | 'center';

/** The five anchors, ordered for a cross/plus-shaped picker overlay. */
export const CONTROL_ANCHORS: ControlAnchor[] = ['top', 'left', 'center', 'right', 'bottom'];

/** The screen edge a seat's controls naturally dock to when not overridden. */
const SEAT_ANCHOR: Record<SeatPosition, ControlAnchor> = {
  bottom: 'bottom',
  right: 'right',
  top: 'top',
  left: 'left',
};

/**
 * Resolves where the active player's control cluster sits. A per-slot user
 * override (persisted in prefs) wins everywhere; otherwise it falls back to the
 * active seat's natural edge — which is `bottom` for side-by-side (all seats sit
 * at the bottom) and the seat's own side for the Face-to-Face / Table shells.
 */
export function resolveControlAnchor(
  userAnchor: ControlAnchor | null | undefined,
  activeSeatPosition: SeatPosition | undefined,
): ControlAnchor {
  if (userAnchor) return userAnchor;
  return activeSeatPosition ? SEAT_ANCHOR[activeSeatPosition] : 'bottom';
}

/** Clockwise rotation (deg) applied to a seat's player-facing content so it
 *  reads upright from that physical side of the device. */
export const SEAT_ROTATION: Record<SeatPosition, SeatRotation> = {
  bottom: 0,
  right: 90,
  top: 180,
  left: 270,
};

export interface PlayerSeat {
  playerId: string;
  position: SeatPosition;
  rotation: SeatRotation;
  /** Engine turn index this seat plays on (clockwise around the table). */
  turnOrder: number;
}

export interface ArrangementState {
  arrangement: DeviceArrangement;
  seats: PlayerSeat[];
}

export const ARRANGEMENTS: DeviceArrangement[] = ['side-by-side', 'face-to-face', 'table'];

/**
 * Clockwise seat order per player count for the Table arrangement. Seats are
 * assigned in play order, so the engine's sequential turn rotation naturally
 * proceeds clockwise: bottom → right → top → left. Three players leave one side
 * empty (default: left); two players collapse to the Face-to-Face bottom/top.
 */
const TABLE_SEATS: Record<number, SeatPosition[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'right', 'top'],
  4: ['bottom', 'right', 'top', 'left'],
};

const FACE_TO_FACE_SEATS: SeatPosition[] = ['bottom', 'top'];

function seat(playerId: string, position: SeatPosition, turnOrder: number): PlayerSeat {
  return { playerId, position, rotation: SEAT_ROTATION[position], turnOrder };
}

/**
 * Coerces any persisted/legacy arrangement value to a supported one. The
 * removed `'auto'` value (and anything unrecognized) migrates to side-by-side —
 * the safe, always-compatible default. Called once when restoring saved data.
 */
export function migrateArrangement(value: unknown): DeviceArrangement {
  if (value === 'side-by-side' || value === 'face-to-face' || value === 'table') return value;
  return 'side-by-side';
}

/** Face-to-Face requires exactly two players; the others accept two to four. */
export function isArrangementCompatible(arrangement: DeviceArrangement, playerCount: number): boolean {
  if (arrangement === 'face-to-face') return playerCount === 2;
  return playerCount >= 2 && playerCount <= 4;
}

/** Human-readable reason an arrangement is unavailable, or null when it fits. */
export function arrangementDisabledReason(
  arrangement: DeviceArrangement,
  playerCount: number,
): string | null {
  if (isArrangementCompatible(arrangement, playerCount)) return null;
  if (arrangement === 'face-to-face') return 'Face-to-face is for exactly 2 players.';
  return `Table supports 2–4 players (currently ${playerCount}).`;
}

/**
 * The presentation shell to render for the *selected* arrangement. Device size
 * never enters here — only player count does, and only to collapse Table-with-2
 * onto the Face-to-Face behavior the spec mandates. The selected arrangement
 * remains the source of truth; this is a rendering variant, not a replacement.
 */
export function renderArrangement(
  arrangement: DeviceArrangement,
  playerCount: number,
): DeviceArrangement {
  if (arrangement === 'table' && playerCount === 2) return 'face-to-face';
  return arrangement;
}

/**
 * Default clockwise seat assignment for an arrangement. Seats are keyed by
 * playerId in play order, so a later eliminated player keeps their seat while
 * the engine simply skips them in the turn rotation — no reseating needed.
 *
 * For a three-player Table, `emptySide` lets setup choose which side stays open;
 * the three players fill the remaining sides in clockwise order from `bottom`.
 */
export function defaultSeats(
  arrangement: DeviceArrangement,
  playerIds: string[],
  opts?: { emptySide?: SeatPosition },
): PlayerSeat[] {
  const n = playerIds.length;

  if (arrangement === 'side-by-side') {
    // Everyone shares the bottom orientation; play is emphasized via HUD, not seating.
    return playerIds.map((id, i) => seat(id, 'bottom', i));
  }

  if (arrangement === 'face-to-face') {
    return playerIds.map((id, i) => seat(id, FACE_TO_FACE_SEATS[i] ?? 'bottom', i));
  }

  // table
  if (n === 2) return playerIds.map((id, i) => seat(id, FACE_TO_FACE_SEATS[i] ?? 'bottom', i));

  let positions = TABLE_SEATS[n] ?? TABLE_SEATS[4];
  if (n === 3 && opts?.emptySide) {
    // Keep the three occupied sides in clockwise order, dropping the chosen empty one.
    const clockwise: SeatPosition[] = ['bottom', 'right', 'top', 'left'];
    positions = clockwise.filter((p) => p !== opts.emptySide);
  }
  return playerIds.map((id, i) => seat(id, positions[i] ?? 'bottom', i));
}

export function seatForPlayer(seats: PlayerSeat[], playerId: string | undefined): PlayerSeat | undefined {
  if (!playerId) return undefined;
  return seats.find((s) => s.playerId === playerId);
}

/** Rotation to apply to the board's cell content for the currently active player. */
export function activeContentRotation(seats: PlayerSeat[], activePlayerId: string | undefined): SeatRotation {
  return seatForPlayer(seats, activePlayerId)?.rotation ?? 0;
}

/** The side that stays empty in a 3-player table, or null when not applicable. */
export function emptyTableSide(seats: PlayerSeat[]): SeatPosition | null {
  const occupied = new Set(seats.map((s) => s.position));
  const missing = (['bottom', 'right', 'top', 'left'] as SeatPosition[]).filter((p) => !occupied.has(p));
  return missing.length === 1 ? missing[0] : null;
}

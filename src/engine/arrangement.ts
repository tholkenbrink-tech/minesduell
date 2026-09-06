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
export type ControlAnchor =
  | 'docked'
  | 'top'
  | 'left'
  | 'right'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/**
 * The default home: a reserved strip directly BELOW the play field, outside
 * it. The cluster is handy but it is also opaque, so parking it off the board
 * by default costs nothing and maximizes visible mine field. There is
 * deliberately no inside-the-board bottom-center anchor — two nearly identical
 * bottom-center spots would only make the drag ambiguous, so dropping the
 * cluster at the bottom middle always means "back to the default".
 */
export const DEFAULT_CONTROL_ANCHOR: ControlAnchor = 'docked';

/** All nine anchors, ordered for a 3x3 picker overlay (corners + edges + the
 *  outside dock, which occupies the bottom-center slot). */
export const CONTROL_ANCHORS: ControlAnchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'docked',
  'bottom-right',
];

/**
 * Coerces a persisted anchor to a supported one. The removed `'bottom'`
 * (inside the board, bottom-center) migrates to the outside dock, which is
 * where a player who chose it was reaching for anyway; anything unrecognized
 * clears back to the arrangement default.
 */
export function migrateControlAnchor(value: unknown): ControlAnchor | null {
  if (value === 'bottom') return 'docked';
  return CONTROL_ANCHORS.includes(value as ControlAnchor) ? (value as ControlAnchor) : null;
}

/**
 * Anchors that lay the control cluster out as a vertical strip: the left/right
 * edges and all four corners. Hugging a vertical edge — or a corner, where the
 * strip runs down the side rather than across the board's width — leaves the
 * widest possible band of mine field visible on a phone held upright.
 */
const VERTICAL_ANCHORS = new Set<ControlAnchor>([
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

/**
 * Whether the control cluster's *pre-rotation* layout must be a vertical stack
 * to end up looking vertical on screen.
 *
 * The seat rotation is applied as a CSS transform AFTER the layout is chosen,
 * and a 90/270deg rotation swaps the visual width/height axes — so when that
 * swap is in play the pre-rotation layout must be the opposite of the desired
 * final shape, or the rotation silently cancels it back out (a vertical stack
 * rotated 90deg reads as a horizontal row again). Hence the XOR.
 */
export function dockIsVertical(anchor: ControlAnchor, rotation: SeatRotation): boolean {
  const wantsVerticalStrip = VERTICAL_ANCHORS.has(anchor);
  const rotationSwapsAxes = rotation === 90 || rotation === 270;
  return wantsVerticalStrip !== rotationSwapsAxes;
}

/**
 * Which anchor a drop at `point` lands on, given the dock's box and the height
 * of the reserved strip at its bottom. The play field above the strip is
 * divided into a 3x3 of drop targets (CONTROL_ANCHORS is already in that
 * reading order), and the whole bottom band — the strip plus the bottom-center
 * cell above it — means "back to the default home".
 *
 * Deliberately pure geometry rather than hit-testing the rendered drop-zone
 * elements: those only exist once React has committed the drag's first render,
 * so a fast drag-and-release could land on nothing and silently snap back.
 * Returns null for a release outside the box, which does snap back.
 */
export function anchorAtPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  stripHeight: number,
): ControlAnchor | null {
  const { x, y } = point;
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (x < rect.left || x > rect.left + rect.width) return null;
  if (y < rect.top || y > rect.top + rect.height) return null;
  if (y >= rect.top + rect.height - stripHeight) return DEFAULT_CONTROL_ANCHOR;

  const fieldHeight = Math.max(1, rect.height - stripHeight);
  const third = (value: number, size: number) => Math.max(0, Math.min(2, Math.floor((value / size) * 3)));
  const col = third(x - rect.left, rect.width);
  const row = third(y - rect.top, fieldHeight);
  return CONTROL_ANCHORS[row * 3 + col];
}

/** The screen edge a seat's controls naturally dock to when not overridden. */
const SEAT_ANCHOR: Record<SeatPosition, ControlAnchor> = {
  bottom: DEFAULT_CONTROL_ANCHOR,
  right: 'right',
  top: 'top',
  left: 'left',
};

/**
 * Resolves where the active player's control cluster sits. A per-slot user
 * override (persisted in prefs) wins everywhere; otherwise it falls back to the
 * active seat's natural spot — the outside dock for side-by-side (all seats sit
 * at the bottom) and the seat's own edge for the Face-to-Face / Table shells.
 */
export function resolveControlAnchor(
  userAnchor: ControlAnchor | null | undefined,
  activeSeatPosition: SeatPosition | undefined,
): ControlAnchor {
  const migrated = migrateControlAnchor(userAnchor);
  if (migrated) return migrated;
  return activeSeatPosition ? SEAT_ANCHOR[activeSeatPosition] : DEFAULT_CONTROL_ANCHOR;
}

/** Clockwise rotation (deg) applied to a seat's player-facing content so it
 *  reads upright from that physical side of the device. A clockwise rotation
 *  carries the content's bottom edge to the left, so the seat sitting at the
 *  device's left edge needs 90° (not 270°) to bring that edge to them, and the
 *  right-seated player needs 270° (not 90°) — the reverse of the seat's own
 *  screen-side name. */
export const SEAT_ROTATION: Record<SeatPosition, SeatRotation> = {
  bottom: 0,
  right: 270,
  top: 180,
  left: 90,
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
 * proceeds clockwise: bottom → left → top → right (visually, as on a clock
 * face: top-right-bottom-left is clockwise, so the neighbor clockwise of
 * bottom is left). Three players leave one side empty (default: left); two
 * players collapse to the Face-to-Face bottom/top.
 */
const TABLE_SEATS: Record<number, SeatPosition[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
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
    const clockwise: SeatPosition[] = ['bottom', 'left', 'top', 'right'];
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

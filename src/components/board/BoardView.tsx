import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Board, Player, Position } from '../../engine/types';
import { usePrefsStore } from '../../store/usePrefsStore';
import { vibrate } from '../../lib/haptics';
import { Cell } from './Cell';

const TILE_SIZE: Record<'compact' | 'comfortable' | 'large', number> = {
  compact: 34,
  comfortable: 42,
  large: 50,
};

const PAN_MOVE_THRESHOLD = 10; // px before a touch is treated as a pan, not a tap
const TAP_MAX_DURATION_MS = 500;
const POST_PAN_LOCK_MS = 220;

/* --- Press-to-mark tuning (adjust these while testing on-device) ---
 * A deliberate press-and-hold on a tile marks it as a bomb without switching
 * the Reveal/Mark toggle — the same feel as Haptic Touch on an app icon.
 * LONG_PRESS_MS is the hold duration before the mark fires: lower = snappier
 * but easier to trigger from a slow tap; higher = more deliberate. The finger
 * must stay within LONG_PRESS_MOVE_TOLERANCE px of where it landed (and on
 * the same tile) or the press is treated as a pan and never marks. */
const LONG_PRESS_MS = 350;
const LONG_PRESS_MOVE_TOLERANCE = 8;
/* Force/3D-Touch enhancement only: a pressure reading strictly between these
 * bounds means the device has a real analog force sensor (0, 0.5, and 1 are
 * the spec's synthetic defaults), so a firm press marks before the timer. */
const FORCE_PRESS_MIN = 0.75;
const FORCE_PRESS_MAX = 0.999;
/* Android synthesizes a contextmenu event after a native long-press; if our
 * timer already marked the tile, a second flag-toggle inside this window
 * would immediately un-mark it. */
const LONG_PRESS_CONTEXTMENU_SUPPRESS_MS = 700;

/** Board zoom is clamped to 70%-130% of the default (100%) size. */
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.3;
/** Exponential factor applied per wheel-delta pixel; tuned so one mouse-wheel
 *  notch (~deltaY 100) steps roughly 10-15%, and trackpad scrolling zooms smoothly. */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export interface BoardViewProps {
  board: Board;
  players: Player[];
  activePlayerId?: string;
  actionMode: 'reveal' | 'flag';
  disabled?: boolean;
  tileSizePref: 'compact' | 'comfortable' | 'large';
  /** Cell-content rotation toward the active seat (0/90/180/270). The grid,
   *  cell coordinates, and scroll position are never affected. */
  orientationDeg?: 0 | 90 | 180 | 270;
  peekPosition?: Position | null;
  peekSafe?: boolean;
  /** Tile of the latest mistake (mine hit / misflag) — gets a brief shake. */
  mistakePos?: Position | null;
  /** Absolutely-positioned overlay laid exactly over the play field (e.g. the
   *  movable Reveal/Mark control dock). Its own children opt back into pointer
   *  events; taps that miss them fall through to the board. */
  overlay?: ReactNode;
  onAction: (kind: 'reveal' | 'flag', pos: Position) => void;
  onFocusCursorChange?: (pos: Position) => void;
}

interface ActivePointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  /** Pending press-to-mark timer for this pointer (null once fired/cancelled). */
  longPressTimer: ReturnType<typeof setTimeout> | null;
  /** True once press-to-mark fired — the eventual pointerup must not also tap. */
  longPressFired: boolean;
}

/**
 * Which sides of the viewport still have play field beyond them, given the
 * current pan offset and the board's scaled pixel size. Pure so it can be
 * unit-tested; the couple-px epsilon absorbs subpixel pan/zoom rounding so a
 * board sitting flush at an edge reads as "at the edge", not "more content".
 */
export function computeEdgeOverflow(
  pan: { x: number; y: number },
  view: { w: number; h: number },
  scaledBoardW: number,
  scaledBoardH: number,
): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  const EPS = 2;
  if (view.w <= 0 || view.h <= 0) return { left: false, right: false, top: false, bottom: false };
  return {
    left: pan.x < -EPS,
    top: pan.y < -EPS,
    right: pan.x + scaledBoardW > view.w + EPS,
    bottom: pan.y + scaledBoardH > view.h + EPS,
  };
}

export function BoardView({
  board,
  players,
  activePlayerId,
  actionMode,
  disabled,
  tileSizePref,
  orientationDeg = 0,
  peekPosition,
  peekSafe,
  mistakePos,
  overlay,
  onAction,
  onFocusCursorChange,
}: BoardViewProps) {
  const tile = TILE_SIZE[tileSizePref];
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Gesture math (pinch/wheel) reads these instead of the `pan`/`zoom` state
  // closures: several fast events can be dispatched/batched before a
  // re-render commits, and reading state would make each one compute from
  // the same stale pre-batch value instead of compounding correctly.
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const pointers = useRef<Map<number, ActivePointer>>(new Map());
  /** Pinch/pan gesture state: the last committed (both-fingers-fresh) centroid
   *  + distance, and which of the two tracked pointer ids have reported a
   *  fresh position since that commit. Recomputing on every individual
   *  pointer event (instead of waiting for both fingers to report) mixes one
   *  fresh position with one stale one, which reads as a momentary pinch —
   *  and an unwanted zoom blip — even during a perfectly symmetric
   *  two-finger pan, since the two fingers' moves always arrive as separate
   *  events rather than atomically together. */
  const pinchRef = useRef<{ centroid: { x: number; y: number }; dist: number } | null>(null);
  const pinchDirty = useRef<Set<number>>(new Set());
  const panLockUntil = useRef(0);
  const spaceHeld = useRef(false);
  const middleDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [cursor, setCursor] = useState<Position>({ x: 0, y: 0 });
  const pressToMark = usePrefsStore((s) => s.pressToMark);
  const hapticsOn = usePrefsStore((s) => s.haptics);
  /** When press-to-mark last fired — used to swallow Android's synthetic contextmenu. */
  const lastLongPressAt = useRef(0);
  /** Live container size, tracked so the per-edge scroll cues update on resize. */
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });

  function updatePan(next: { x: number; y: number }) {
    panRef.current = next;
    setPan(next);
  }
  function updateZoom(next: number) {
    zoomRef.current = next;
    setZoom(next);
  }

  const boardPixelWidth = board.width * tile;
  const boardPixelHeight = board.height * tile;

  const clampPan = useCallback(
    (next: { x: number; y: number }, zoomOverride?: number) => {
      const el = containerRef.current;
      if (!el) return next;
      const z = zoomOverride ?? zoomRef.current;
      const scaledWidth = boardPixelWidth * z;
      const scaledHeight = boardPixelHeight * z;
      const clampAxis = (value: number, viewSize: number, boardSize: number) => {
        if (boardSize <= viewSize) {
          // Board is smaller than the viewport: it can sit anywhere from
          // flush-left/top (0) to flush-right/bottom, including centered.
          const max = viewSize - boardSize;
          return Math.max(0, Math.min(max, value));
        }
        // Board is larger than the viewport: standard negative-offset scrolling.
        const min = viewSize - boardSize;
        return Math.max(min, Math.min(0, value));
      };
      return {
        x: clampAxis(next.x, el.clientWidth, scaledWidth),
        y: clampAxis(next.y, el.clientHeight, scaledHeight),
      };
    },
    [boardPixelWidth, boardPixelHeight],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') spaceHeld.current = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') spaceHeld.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function cellFromClientPoint(clientX: number, clientY: number): Position | null {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left - panRef.current.x;
    const localY = clientY - rect.top - panRef.current.y;
    const x = Math.floor(localX / (tile * zoomRef.current));
    const y = Math.floor(localY / (tile * zoomRef.current));
    if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
    return { x, y };
  }

  function performAction(pos: Position) {
    if (disabled) return;
    onAction(actionMode, pos);
  }

  function cancelLongPress(p: ActivePointer) {
    if (p.longPressTimer !== null) {
      clearTimeout(p.longPressTimer);
      p.longPressTimer = null;
    }
  }

  /** Fires press-to-mark for a held pointer: marks the tile it landed on and
   *  gives instant haptic feedback (the flag rendering is the visual cue). */
  function fireLongPress(p: ActivePointer, startCell: Position) {
    cancelLongPress(p);
    if (disabled || p.longPressFired) return;
    if (pointers.current.size !== 1) return; // a second finger means pan/zoom
    if (Date.now() < panLockUntil.current) return;
    if (Math.hypot(p.x - p.startX, p.y - p.startY) > LONG_PRESS_MOVE_TOLERANCE) return;
    // The press must still be over the tile it started on.
    const cell = cellFromClientPoint(p.x, p.y);
    if (!cell || cell.x !== startCell.x || cell.y !== startCell.y) return;
    p.longPressFired = true;
    lastLongPressAt.current = Date.now();
    if (hapticsOn) vibrate('tap');
    onAction('flag', cell);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        middleDragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
        return;
      }
      if (e.button !== 0) return; // right click handled by contextmenu
      const pos = cellFromClientPoint(e.clientX, e.clientY);
      if (pos) performAction(pos);
      return;
    }
    // Best-effort: some browsers throw (e.g. NotFoundError) if the pointer
    // isn't recognized as active at capture time. Losing capture only means
    // the pointer could stop firing events if it strays off-element, which
    // is a minor UX nit — it must never stop this pointer from being tracked.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    const pointer: ActivePointer = {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      longPressTimer: null,
      longPressFired: false,
    };
    pointers.current.set(e.pointerId, pointer);

    if (pointers.current.size >= 2) {
      // A second finger means pan/zoom — no pending press may mark anymore.
      for (const p of pointers.current.values()) cancelLongPress(p);
      // (Re)establish the pinch reference from the two tracked pointers
      // whenever a finger joins — harmless to redo if a 3rd finger lands.
      const [idA, idB] = Array.from(pointers.current.keys());
      const a = pointers.current.get(idA)!;
      const b = pointers.current.get(idB)!;
      pinchRef.current = { centroid: averageOf([a, b]), dist: Math.hypot(a.x - b.x, a.y - b.y) };
      pinchDirty.current.clear();
      return;
    }

    // Press-to-mark: a deliberate hold on one tile marks it as a bomb.
    if (pressToMark && !disabled) {
      const startCell = cellFromClientPoint(e.clientX, e.clientY);
      if (startCell) {
        pointer.longPressTimer = setTimeout(() => fireLongPress(pointer, startCell), LONG_PRESS_MS);
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (middleDragStart.current) {
      const dx = e.clientX - middleDragStart.current.x;
      const dy = e.clientY - middleDragStart.current.y;
      updatePan(clampPan({ x: middleDragStart.current.panX + dx, y: middleDragStart.current.panY + dy }));
      return;
    }
    const p = pointers.current.get(e.pointerId);
    if (!p) return;

    if (pointers.current.size >= 2) {
      // Pinch-to-zoom + two-finger pan, combined: the board point under the
      // pinch centroid stays fixed under the fingers as both the centroid
      // moves (pan) and the finger spacing changes (zoom).
      const [idA, idB] = Array.from(pointers.current.keys());
      p.x = e.clientX;
      p.y = e.clientY;

      // Only recompute once BOTH tracked fingers have reported a fresh
      // position since the last commit (see pinchRef/pinchDirty comment
      // above) — a lone finger's update is queued, not acted on yet.
      if (e.pointerId === idA || e.pointerId === idB) pinchDirty.current.add(e.pointerId);
      if (pinchDirty.current.size < 2 || !pinchRef.current) return;
      pinchDirty.current.clear();

      const nextA = pointers.current.get(idA)!;
      const nextB = pointers.current.get(idB)!;
      const nextCentroid = averageOf([nextA, nextB]);
      const nextDist = Math.hypot(nextA.x - nextB.x, nextA.y - nextB.y);

      const { centroid: prevCentroid, dist: prevDist } = pinchRef.current;
      pinchRef.current = { centroid: nextCentroid, dist: nextDist };

      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      const curZoom = zoomRef.current;
      const scaleRatio = prevDist > 0 ? nextDist / prevDist : 1;
      const newZoom = clampZoom(curZoom * scaleRatio);
      const centroidMoved = prevCentroid.x !== nextCentroid.x || prevCentroid.y !== nextCentroid.y;

      if (rect && (centroidMoved || newZoom !== curZoom)) {
        const bx = (prevCentroid.x - rect.left - panRef.current.x) / curZoom;
        const by = (prevCentroid.y - rect.top - panRef.current.y) / curZoom;
        const nextPan = {
          x: nextCentroid.x - rect.left - bx * newZoom,
          y: nextCentroid.y - rect.top - by * newZoom,
        };
        updateZoom(newZoom);
        updatePan(clampPan(nextPan, newZoom));
        panLockUntil.current = Date.now() + POST_PAN_LOCK_MS;
      }
    } else {
      p.x = e.clientX;
      p.y = e.clientY;
      if (p.longPressTimer !== null) {
        if (Math.hypot(p.x - p.startX, p.y - p.startY) > LONG_PRESS_MOVE_TOLERANCE) {
          // Drifted too far — this is a drag/pan, never a deliberate press.
          cancelLongPress(p);
        } else if (
          e.pointerType === 'touch' &&
          e.pressure > FORCE_PRESS_MIN &&
          e.pressure < FORCE_PRESS_MAX
        ) {
          // Analog force sensor reporting a firm press — mark immediately
          // rather than waiting out the timer.
          const startCell = cellFromClientPoint(p.startX, p.startY);
          if (startCell) fireLongPress(p, startCell);
        }
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (middleDragStart.current) {
      middleDragStart.current = null;
      return;
    }
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!p) return;
    cancelLongPress(p);
    if (p.longPressFired) return; // the hold already marked — never also tap
    if (pointers.current.size > 0) return; // still mid multi-touch gesture

    const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    const duration = Date.now() - p.startTime;
    const withinPanLock = Date.now() < panLockUntil.current;
    if (!withinPanLock && moved < PAN_MOVE_THRESHOLD && duration < TAP_MAX_DURATION_MS) {
      const pos = cellFromClientPoint(e.clientX, e.clientY);
      if (pos) performAction(pos);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    // Always prevent default so neither a mouse wheel nor a trackpad's
    // synthesized ctrl+wheel pinch ever triggers the browser's own page zoom.
    e.preventDefault();
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const curZoom = zoomRef.current;
    const newZoom = clampZoom(curZoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY));
    if (newZoom === curZoom) return;
    const fx = e.clientX - rect.left;
    const fy = e.clientY - rect.top;
    const bx = (fx - panRef.current.x) / curZoom;
    const by = (fy - panRef.current.y) / curZoom;
    updateZoom(newZoom);
    updatePan(clampPan({ x: fx - bx * newZoom, y: fy - by * newZoom }, newZoom));
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Android fires a synthetic contextmenu after a native long-press; if our
    // press-to-mark just marked this tile, a second toggle would un-mark it.
    if (Date.now() - lastLongPressAt.current < LONG_PRESS_CONTEXTMENU_SUPPRESS_MS) return;
    const pos = cellFromClientPoint(e.clientX, e.clientY);
    if (pos && !disabled) onAction('flag', pos);
  }

  /** Recenters the board at 100% zoom — used on mount/resize/new-board only;
   *  there's no user-facing recenter control (pinch/wheel zoom-out plus pan
   *  cover that need). */
  function centerBoard() {
    const el = containerRef.current;
    if (!el) return;
    updatePan(
      clampPan(
        {
          x: (el.clientWidth - boardPixelWidth) / 2,
          y: (el.clientHeight - boardPixelHeight) / 2,
        },
        1,
      ),
    );
  }

  const centeredRef = useRef(false);

  useLayoutEffect(() => {
    // Try to center synchronously before the browser paints — reading
    // clientWidth/Height here forces a layout pass, so this succeeds in the
    // common case and the board never visibly "pops" into its centered spot.
    centeredRef.current = false;
    updateZoom(1);
    const el = containerRef.current;
    if (el && el.clientWidth > 0 && el.clientHeight > 0) {
      centerBoard();
      centeredRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.width, board.height, tile]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || centeredRef.current) return;
    // Fallback for the rare case the container still had no size above (e.g.
    // a slower surrounding layout pass) — watch for its first real size.
    const observer = new ResizeObserver((entries) => {
      if (centeredRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      centeredRef.current = true;
      centerBoard();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.width, board.height, tile]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Live container size for the per-edge scroll cues (independent of the
    // one-shot centering observer above, which disconnects after first size).
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    let next = cursor;
    if (e.key === 'ArrowUp') next = { x: cursor.x, y: Math.max(0, cursor.y - 1) };
    else if (e.key === 'ArrowDown') next = { x: cursor.x, y: Math.min(board.height - 1, cursor.y + 1) };
    else if (e.key === 'ArrowLeft') next = { x: Math.max(0, cursor.x - 1), y: cursor.y };
    else if (e.key === 'ArrowRight') next = { x: Math.min(board.width - 1, cursor.x + 1), y: cursor.y };
    else if (e.key === 'Enter' || e.key === ' ') {
      performAction(cursor);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
    onFocusCursorChange?.(next);
  }

  const rows = useMemo(() => board.cells, [board.cells]);

  // Field wash: a subtle full-board tint that shifts with the active mode so the
  // player can tell Reveal (cyan) from Mark (pink) at a glance / peripherally —
  // it colors the board frame + a faint inner glow without obscuring any tile.
  const tint =
    actionMode === 'flag'
      ? { ring: 'var(--md-neon-pink)', wash: 'rgba(255, 60, 172, 0.10)' }
      : { ring: 'var(--md-neon-cyan)', wash: 'rgba(0, 229, 255, 0.08)' };

  // Per-edge "more field beyond the viewport" cues. Recomputed on every pan/
  // zoom/resize render; a side whose true board edge is visible shows nothing,
  // so the real boundary reads as final rather than cut off.
  const edges = computeEdgeOverflow(pan, viewSize, boardPixelWidth * zoom, boardPixelHeight * zoom);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div
        ref={containerRef}
        role="grid"
        aria-label="Minesweeper board"
        data-action-mode={actionMode}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        className="focus-ring relative min-h-0 w-full flex-1 touch-none overflow-hidden rounded-[var(--md-radius-lg)] border"
        style={{
          touchAction: 'none',
          borderColor: `color-mix(in srgb, ${tint.ring} 55%, var(--md-border))`,
          boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${tint.ring} 28%, transparent), inset 0 0 70px ${tint.wash}`,
          background: `linear-gradient(0deg, ${tint.wash}, ${tint.wash}), var(--md-surface-2)`,
          transition: 'border-color 220ms ease, box-shadow 220ms ease, background 220ms ease',
        }}
      >
        <div
          className="relative"
          style={{
            width: boardPixelWidth,
            height: boardPixelHeight,
            transformOrigin: '0 0',
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          {rows.map((row, y) => (
            <div key={y} role="row" className="absolute left-0 flex" style={{ top: y * tile }}>
              {row.map((cell, x) => (
                <Cell
                  key={x}
                  cell={cell}
                  size={tile}
                  players={players}
                  activePlayerId={activePlayerId}
                  orientationDeg={orientationDeg}
                  focused={cursor.x === x && cursor.y === y}
                  isPeek={peekPosition?.x === x && peekPosition?.y === y}
                  peekSafe={peekSafe}
                  shake={mistakePos?.x === x && mistakePos?.y === y}
                  markMode={actionMode === 'flag'}
                />
              ))}
            </div>
          ))}
        </div>
        {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
          <div
            key={side}
            aria-hidden
            data-edge-cue={side}
            data-active={edges[side] || undefined}
            className={`md-edge-cue md-edge-cue-${side}`}
          >
            <span className="md-edge-cue-chevron">
              {side === 'left' ? '‹' : side === 'right' ? '›' : side === 'top' ? '‹' : '›'}
            </span>
          </div>
        ))}
        {overlay}
      </div>
    </div>
  );
}

function averageOf(pts: { x: number; y: number }[]) {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

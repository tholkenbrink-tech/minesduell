import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Player, Position } from '../../engine/types';
import { Cell } from './Cell';

const TILE_SIZE: Record<'compact' | 'comfortable' | 'large', number> = {
  compact: 34,
  comfortable: 42,
  large: 50,
};

const PAN_MOVE_THRESHOLD = 10; // px before a touch is treated as a pan, not a tap
const TAP_MAX_DURATION_MS = 500;
const POST_PAN_LOCK_MS = 220;

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
  onAction: (kind: 'reveal' | 'flag', pos: Position) => void;
  onFocusCursorChange?: (pos: Position) => void;
}

interface ActivePointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
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
  onAction,
  onFocusCursorChange,
}: BoardViewProps) {
  const tile = TILE_SIZE[tileSizePref];
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef<Map<number, ActivePointer>>(new Map());
  const panLockUntil = useRef(0);
  const spaceHeld = useRef(false);
  const middleDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [cursor, setCursor] = useState<Position>({ x: 0, y: 0 });

  const boardPixelWidth = board.width * tile;
  const boardPixelHeight = board.height * tile;

  const clampPan = useCallback(
    (next: { x: number; y: number }) => {
      const el = containerRef.current;
      if (!el) return next;
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
        x: clampAxis(next.x, el.clientWidth, boardPixelWidth),
        y: clampAxis(next.y, el.clientHeight, boardPixelHeight),
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
    const localX = clientX - rect.left - pan.x;
    const localY = clientY - rect.top - pan.y;
    const x = Math.floor(localX / tile);
    const y = Math.floor(localY / tile);
    if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
    return { x, y };
  }

  function performAction(pos: Position) {
    if (disabled) return;
    onAction(actionMode, pos);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        middleDragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        return;
      }
      if (e.button !== 0) return; // right click handled by contextmenu
      const pos = cellFromClientPoint(e.clientX, e.clientY);
      if (pos) performAction(pos);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (middleDragStart.current) {
      const dx = e.clientX - middleDragStart.current.x;
      const dy = e.clientY - middleDragStart.current.y;
      setPan(clampPan({ x: middleDragStart.current.panX + dx, y: middleDragStart.current.panY + dy }));
      return;
    }
    const p = pointers.current.get(e.pointerId);
    if (!p) return;

    if (pointers.current.size >= 2) {
      const ids = Array.from(pointers.current.keys());
      const prevCentroid = averageOf(ids.map((id) => pointers.current.get(id)!));
      p.x = e.clientX;
      p.y = e.clientY;
      const nextCentroid = averageOf(ids.map((id) => pointers.current.get(id)!));
      const dx = nextCentroid.x - prevCentroid.x;
      const dy = nextCentroid.y - prevCentroid.y;
      if (dx || dy) {
        setPan((prev) => clampPan({ x: prev.x + dx, y: prev.y + dy }));
        panLockUntil.current = Date.now() + POST_PAN_LOCK_MS;
      }
    } else {
      p.x = e.clientX;
      p.y = e.clientY;
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
    e.preventDefault();
    setPan((prev) => clampPan({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const pos = cellFromClientPoint(e.clientX, e.clientY);
    if (pos && !disabled) onAction('flag', pos);
  }

  function centerBoard() {
    const el = containerRef.current;
    if (!el) return;
    setPan(
      clampPan({
        x: (el.clientWidth - boardPixelWidth) / 2,
        y: (el.clientHeight - boardPixelHeight) / 2,
      }),
    );
  }

  const centeredRef = useRef(false);

  useLayoutEffect(() => {
    // Try to center synchronously before the browser paints — reading
    // clientWidth/Height here forces a layout pass, so this succeeds in the
    // common case and the board never visibly "pops" into its centered spot.
    centeredRef.current = false;
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

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        role="grid"
        aria-label="Minesweeper board"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        className="focus-ring h-full w-full touch-none overflow-hidden rounded-[var(--md-radius-lg)] border border-[var(--md-border)] bg-[var(--md-surface-2)]"
        style={{ touchAction: 'none' }}
      >
        <div
          className="relative"
          style={{
            width: boardPixelWidth,
            height: boardPixelHeight,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
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
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={centerBoard}
        className="focus-ring absolute bottom-3 right-3 rounded-full border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2 text-xs font-semibold shadow"
        aria-label="Center board"
      >
        ⊙ Center
      </button>
    </div>
  );
}

function averageOf(pts: { x: number; y: number }[]) {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

import { useRef, useState, type ReactNode } from 'react';
import type { ActionMode } from '../../engine/types';
import type { ControlAnchor, SeatRotation } from '../../engine/arrangement';
import { CONTROL_ANCHORS } from '../../engine/arrangement';
import { useRotatedSize } from '../../hooks/useRotatedSize';
import { Icon } from '../icons';
import { Button } from '../ui';

export interface ControlDockProps {
  /** Active player's slot (seat/turn index) — the override is saved per slot. */
  slotIndex: number;
  /** Where the cluster currently sits (already resolved from the saved override). */
  anchor: ControlAnchor;
  /** Content orientation for the active seat; the anchor never rotates the cluster
   *  away from reading upright for that player. */
  rotation: SeatRotation;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onPause: () => void;
  /** Persist a new anchor for this slot (null clears back to the default). */
  onAnchorChange: (slot: number, anchor: ControlAnchor | null) => void;
  /** Optional extras rendered beside the toggle (e.g. a timer or mines-left). */
  extra?: ReactNode;
}

/** Grid cell placement for each drop zone (a full 3x3: corners, edges, center). */
const ZONE_CELL: Record<ControlAnchor, { col: number; row: number }> = {
  'top-left': { col: 1, row: 1 },
  top: { col: 2, row: 1 },
  'top-right': { col: 3, row: 1 },
  left: { col: 1, row: 2 },
  center: { col: 2, row: 2 },
  right: { col: 3, row: 2 },
  'bottom-left': { col: 1, row: 3 },
  bottom: { col: 2, row: 3 },
  'bottom-right': { col: 3, row: 3 },
};

const ZONE_ICON: Record<ControlAnchor, string> = {
  'top-left': '↖',
  top: '↑',
  'top-right': '↗',
  left: '←',
  center: '＋',
  right: '→',
  'bottom-left': '↙',
  bottom: '↓',
  'bottom-right': '↘',
};

/** Absolute placement of the cluster within the board-region container per anchor. */
function anchorWrapperStyle(anchor: ControlAnchor): React.CSSProperties {
  const padY = 'max(8px, env(safe-area-inset-bottom))';
  const padYTop = 'max(8px, env(safe-area-inset-top))';
  const padX = 'max(6px, env(safe-area-inset-left))';
  const padXR = 'max(6px, env(safe-area-inset-right))';
  switch (anchor) {
    case 'top':
      return { left: 0, right: 0, top: padYTop, display: 'flex', justifyContent: 'center' };
    case 'bottom':
      return { left: 0, right: 0, bottom: padY, display: 'flex', justifyContent: 'center' };
    case 'left':
      return { top: 0, bottom: 0, left: padX, display: 'flex', alignItems: 'center' };
    case 'right':
      return { top: 0, bottom: 0, right: padXR, display: 'flex', alignItems: 'center' };
    case 'center':
      return { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    case 'top-left':
      return { left: padX, top: padYTop };
    case 'top-right':
      return { right: padXR, top: padYTop };
    case 'bottom-left':
      return { left: padX, bottom: padY };
    case 'bottom-right':
      return { right: padXR, bottom: padY };
  }
}

/**
 * The Reveal/Mark control cluster, floating over the board and re-anchorable by
 * the player. Press the ⠿ grip and drag: five drop zones light up across the
 * board and the cluster follows the finger; release over a zone to move it there
 * (saved for this player slot), or release anywhere else to snap back. The
 * cluster's contents always stay rotated upright for the active seat, so moving
 * it never flips the toggle for that player.
 */
export function ControlDock({
  slotIndex,
  anchor,
  rotation,
  actionMode,
  setActionMode,
  onPause,
  onAnchorChange,
  extra,
}: ControlDockProps) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<ControlAnchor | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const zoneRefs = useRef<Partial<Record<ControlAnchor, HTMLDivElement>>>({});
  const { contentRef, wrapperStyle, contentStyle } = useRotatedSize(rotation);

  function zoneAtPoint(x: number, y: number): ControlAnchor | null {
    for (const a of CONTROL_ANCHORS) {
      const el = zoneRefs.current[a];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return a;
    }
    return null;
  }

  function onGripDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setHover(null);
    setOffset({ x: 0, y: 0 });
  }

  function onGripMove(e: React.PointerEvent) {
    if (!start.current) return;
    setOffset({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
    setHover(zoneAtPoint(e.clientX, e.clientY));
  }

  function onGripUp(e: React.PointerEvent) {
    if (!start.current) return;
    const target = zoneAtPoint(e.clientX, e.clientY);
    start.current = null;
    setDragging(false);
    setOffset({ x: 0, y: 0 });
    setHover(null);
    // Commit only a real change; release off any zone snaps back (no-op).
    if (target && target !== anchor) onAnchorChange(slotIndex, target);
  }

  const vertical = anchor === 'left' || anchor === 'right';

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Drop zones — only interactive/visible while dragging. */}
      {dragging && (
        <div
          className="md-fade-in pointer-events-none absolute inset-0 grid gap-2 p-2"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}
        >
          {CONTROL_ANCHORS.map((a) => {
            const cell = ZONE_CELL[a];
            const on = hover === a;
            const current = anchor === a;
            return (
              <div
                key={a}
                ref={(el) => {
                  if (el) zoneRefs.current[a] = el;
                }}
                className="flex items-center justify-center rounded-[var(--md-radius-md)] text-2xl font-bold transition-colors"
                style={{
                  gridColumn: cell.col,
                  gridRow: cell.row,
                  border: `2px dashed ${on ? 'var(--md-accent)' : 'rgba(255,255,255,0.22)'}`,
                  background: on
                    ? 'color-mix(in srgb, var(--md-accent) 22%, transparent)'
                    : current
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(10,11,20,0.35)',
                  color: on ? 'var(--md-accent)' : 'var(--md-neon-text-muted)',
                }}
              >
                {ZONE_ICON[a]}
              </div>
            );
          })}
        </div>
      )}

      {/* The cluster itself, positioned by anchor and following the finger while dragged. */}
      <div className="absolute" style={anchorWrapperStyle(anchor)}>
        <div
          className="pointer-events-auto"
          // Keep control taps out of the board's pan/tap handler beneath us.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: dragging ? 'none' : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: dragging ? 30 : undefined,
          }}
        >
          <div style={wrapperStyle}>
            <div ref={contentRef} style={contentStyle}>
              <div
                className={`flex items-center gap-2 rounded-full p-1 ${vertical ? 'flex-col' : ''}`}
                style={{
                  background: 'rgba(10,11,20,0.82)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: dragging
                    ? '0 8px 28px rgba(0,0,0,0.55), 0 0 0 2px var(--md-accent)'
                    : 'var(--md-shadow-md)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <Button variant="ghost" onClick={onPause} aria-label="Pause" className="!min-h-[44px] !min-w-[44px]">
                  <Icon name="pause" size={17} />
                </Button>
                <ActionToggle actionMode={actionMode} setActionMode={setActionMode} vertical={vertical} />
                {extra && <div className={vertical ? 'py-0.5' : 'px-0.5'}>{extra}</div>}
                <button
                  type="button"
                  aria-label="Move controls"
                  onPointerDown={onGripDown}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                  className="focus-ring flex items-center justify-center rounded-full text-[var(--md-neon-text-muted)]"
                  style={{ minWidth: 40, minHeight: 44, touchAction: 'none', cursor: 'grab' }}
                >
                  ⠿
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single unified two-state Reveal/Mark toggle. Both icons are always visible;
 *  clicking anywhere on the toggle flips the mode, or click a specific icon
 *  to select that mode directly. */
function ActionToggle({
  actionMode,
  setActionMode,
  vertical,
}: {
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  vertical?: boolean;
}) {
  const toggleMode = () => setActionMode(actionMode === 'reveal' ? 'flag' : 'reveal');

  return (
    <button
      type="button"
      role="radio"
      aria-checked={actionMode === 'flag'}
      aria-label={actionMode === 'reveal' ? '🔍 Reveal' : '🚩 Flag'}
      onClick={toggleMode}
      className="focus-ring flex items-center justify-center gap-1 rounded-full transition-colors"
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: '4px 6px',
        background: 'linear-gradient(120deg, var(--md-neon-pink), #8b5cf6)',
        boxShadow: '0 0 12px color-mix(in srgb, var(--md-neon-pink) 45%, transparent)',
      }}
    >
      <div className={`flex gap-1 ${vertical ? 'flex-col' : ''}`}>
        {/* Reveal icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActionMode('reveal');
          }}
          aria-label="Select Reveal"
          className="flex items-center justify-center rounded transition-colors"
          style={{
            minHeight: 36,
            minWidth: 36,
            background:
              actionMode === 'reveal'
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(255,255,255,0.08)',
            color: '#fff',
          }}
        >
          <Icon name="reveal" size={17} />
        </button>
        {/* Mark/Flag icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActionMode('flag');
          }}
          aria-label="Select Flag"
          className="flex items-center justify-center rounded transition-colors"
          style={{
            minHeight: 36,
            minWidth: 36,
            background:
              actionMode === 'flag'
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(255,255,255,0.08)',
            color: '#fff',
          }}
        >
          <Icon name="flag" size={17} />
        </button>
      </div>
    </button>
  );
}

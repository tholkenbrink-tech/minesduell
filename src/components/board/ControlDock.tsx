import { useRef, useState, type ReactNode } from 'react';
import type { ActionMode } from '../../engine/types';
import type { ControlAnchor, SeatRotation } from '../../engine/arrangement';
import { CONTROL_ANCHORS, DEFAULT_CONTROL_ANCHOR, anchorAtPoint, dockIsVertical } from '../../engine/arrangement';
import { useRotatedSize } from '../../hooks/useRotatedSize';
import { Icon, type IconName } from '../icons';
import { DOCK_STRIP_HEIGHT, type BoardZoomApi } from './BoardView';

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
  /** One-hand mode on/off. Independent of the action mode on purpose: with it
   *  on, a drag scrolls while a tap still reveals and a hold still marks. */
  oneFingerScroll: boolean;
  setOneFingerScroll: (on: boolean) => void;
  /** Board zoom, driven by the buttons that appear while scrolling is on. */
  zoom: BoardZoomApi;
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
  docked: { col: 2, row: 3 },
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
  docked: '↓',
  'bottom-right': '↘',
};

/** Distance from the cluster to the edge of the play field, identical on every
 *  side. It used to add env(safe-area-inset-*) on the top/bottom anchors, but
 *  the app shell already pads for the notch and home indicator — adding it
 *  again here pushed the top/bottom docks a finger's width into the board and
 *  cost visible mine field for no reason. */
const DOCK_EDGE_GAP = 6;

/** Absolute placement of the cluster within the board-region container per anchor. */
function anchorWrapperStyle(anchor: ControlAnchor): React.CSSProperties {
  const gap = DOCK_EDGE_GAP;
  // On-board anchors sit inside the play field only, so their bottom edge is
  // the top of the reserved strip rather than the bottom of the dock's box.
  const floor = DOCK_STRIP_HEIGHT;
  switch (anchor) {
    case 'top':
      return { left: 0, right: 0, top: gap, display: 'flex', justifyContent: 'center' };
    case 'docked':
      // The reserved strip under the play field — see DOCK_STRIP_HEIGHT.
      return {
        left: 0,
        right: 0,
        bottom: 0,
        height: DOCK_STRIP_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };
    case 'left':
      return { top: 0, bottom: floor, left: gap, display: 'flex', alignItems: 'center' };
    case 'right':
      return { top: 0, bottom: floor, right: gap, display: 'flex', alignItems: 'center' };
    case 'center':
      return { top: 0, bottom: floor, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    case 'top-left':
      return { left: gap, top: gap };
    case 'top-right':
      return { right: gap, top: gap };
    case 'bottom-left':
      return { left: gap, bottom: floor + gap };
    case 'bottom-right':
      return { right: gap, bottom: floor + gap };
  }
}

/**
 * The action control cluster. Its home is the strip directly BELOW the play
 * field, off the board entirely, so the default costs no visible mine field.
 * Press the ⠿ grip and drag: drop zones light up across the board plus that
 * strip, and the cluster follows the finger; release over a zone to move it
 * there (saved for this player slot), or release anywhere else to snap back.
 * Dropping anywhere along the bottom middle returns it to the default home.
 * The cluster's contents always stay rotated upright for the active seat, so
 * moving it never flips the toggle for that player.
 */
export function ControlDock({
  slotIndex,
  anchor,
  rotation,
  actionMode,
  setActionMode,
  oneFingerScroll,
  setOneFingerScroll,
  zoom,
  onAnchorChange,
  extra,
}: ControlDockProps) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<ControlAnchor | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { contentRef, wrapperStyle, contentStyle } = useRotatedSize(rotation);

  /** Which drop target a screen point is over. Computed from the dock's own box
   *  (see anchorAtPoint) rather than by hit-testing the rendered zone elements,
   *  so a quick grab-and-fling lands correctly even before the zones paint. */
  function zoneAtPoint(x: number, y: number): ControlAnchor | null {
    const root = rootRef.current;
    if (!root) return null;
    return anchorAtPoint({ x, y }, root.getBoundingClientRect(), DOCK_STRIP_HEIGHT);
  }

  function onGripDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Best-effort, exactly as in BoardView: some browsers throw if the pointer
    // isn't recognized as active at capture time, and losing capture is a minor
    // nit — it must never stop the drag from starting.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
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

  const vertical = dockIsVertical(anchor, rotation);
  const isDocked = anchor === DEFAULT_CONTROL_ANCHOR;

  /** Shared look for a drop zone, whether it is an on-board cell or the strip. */
  const zoneStyle = (a: ControlAnchor): React.CSSProperties => {
    const on = hover === a;
    const current = anchor === a;
    return {
      border: `2px dashed ${on ? 'var(--md-accent)' : 'rgba(255,255,255,0.22)'}`,
      background: on
        ? 'color-mix(in srgb, var(--md-accent) 22%, transparent)'
        : current
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(10,11,20,0.35)',
      color: on ? 'var(--md-accent)' : 'var(--md-neon-text-muted)',
    };
  };
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20">
      {/* The default home, outside the board. While the cluster is elsewhere
          this shows a dashed outline of where it belongs — without it, a
          cluster parked in a corner leaves an unexplained empty strip and no
          hint that dropping it back down here is possible. */}
      {!isDocked && !dragging && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex items-center justify-center px-2 pb-1"
          style={{ height: DOCK_STRIP_HEIGHT }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full text-xs"
            style={{
              border: '2px dashed rgba(255,255,255,0.16)',
              color: 'var(--md-neon-text-muted)',
              opacity: 0.7,
            }}
          >
            Controls dock here
          </div>
        </div>
      )}

      {/* Drop zones — only interactive/visible while dragging. The on-board
          cells cover the play field; the strip below is the ninth zone, and
          the bottom-center cell targets it too, so aiming anywhere along the
          bottom middle returns the cluster to its default home. */}
      {dragging && (
        <>
          <div
            className="md-fade-in pointer-events-none absolute inset-x-0 top-0 grid gap-2 p-2"
            style={{
              bottom: DOCK_STRIP_HEIGHT,
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
            }}
          >
            {CONTROL_ANCHORS.map((a) => {
              const cell = ZONE_CELL[a];
              return (
                <div
                  key={a}
                  className="flex items-center justify-center rounded-[var(--md-radius-md)] text-2xl font-bold transition-colors"
                  style={{ gridColumn: cell.col, gridRow: cell.row, ...zoneStyle(a) }}
                >
                  {ZONE_ICON[a]}
                </div>
              );
            })}
          </div>
          <div
            className="md-fade-in pointer-events-none absolute inset-x-0 bottom-0 mx-2 mb-1 flex items-center justify-center rounded-full text-sm font-semibold transition-colors"
            style={{ height: DOCK_STRIP_HEIGHT - 4, ...zoneStyle(DEFAULT_CONTROL_ANCHOR) }}
          >
            Dock below the board
          </div>
        </>
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
                <ScrollToggle on={oneFingerScroll} setOn={setOneFingerScroll} />
                {oneFingerScroll && <ZoomButtons zoom={zoom} vertical={vertical} />}
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

/** Shared look for a round 36px control inside the cluster. */
function clusterButtonStyle(on: boolean, color: string, fg: string): React.CSSProperties {
  return {
    minHeight: 36,
    minWidth: 36,
    background: on ? color : 'transparent',
    boxShadow: on ? `0 0 10px color-mix(in srgb, ${color} 55%, transparent)` : 'none',
    color: on ? fg : 'var(--md-neon-text-muted)',
    opacity: on ? 1 : 0.7,
  };
}

/**
 * One-hand mode: an independent on/off switch, not a third action mode.
 *
 * It was a third radio option at first, which meant turning scrolling on took
 * tapping and marking away — exactly the thing you want while you are moving
 * around a board one-handed. As a toggle it composes instead: drag to scroll,
 * tap to reveal, press-and-hold to mark, all at once.
 */
function ScrollToggle({ on, setOn }: { on: boolean; setOn: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="One-hand scrolling"
      title="One-hand scrolling"
      onClick={() => setOn(!on)}
      className="focus-ring flex items-center justify-center rounded-full transition-colors"
      style={{
        ...clusterButtonStyle(on, 'var(--md-neon-amber)', 'var(--md-accent-contrast)'),
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <Icon name="pan" size={17} />
    </button>
  );
}

/** Zoom in/out, shown only while one-hand mode is on — a pinch needs a second
 *  hand, so without these there would be no one-handed way to zoom. */
function ZoomButtons({ zoom, vertical }: { zoom: BoardZoomApi; vertical?: boolean }) {
  const buttons = [
    { key: 'out', label: 'Zoom out', glyph: '\u2212', onClick: zoom.zoomOut, enabled: zoom.canZoomOut },
    { key: 'in', label: 'Zoom in', glyph: '+', onClick: zoom.zoomIn, enabled: zoom.canZoomIn },
  ];
  return (
    <div className={`flex items-center gap-1 ${vertical ? 'flex-col' : ''}`}>
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-label={b.label}
          title={b.label}
          disabled={!b.enabled}
          onClick={b.onClick}
          className="md-display focus-ring flex items-center justify-center rounded-full text-lg font-bold leading-none transition-colors disabled:opacity-30"
          style={{
            minHeight: 36,
            minWidth: 36,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--md-neon-text)',
          }}
        >
          {b.glyph}
        </button>
      ))}
    </div>
  );
}

/** The Reveal/Mark selector.
 *
 *  It used to be a single <button> wrapping two more <button>s, which is
 *  invalid HTML — nested interactive elements make the hit-testing and the
 *  reported accessibility state browser-dependent. This is a proper
 *  radiogroup of siblings: exactly one is checked and each is directly
 *  selectable. */
const MODE_OPTIONS: { mode: ActionMode; icon: IconName; label: string; color: string; fg: string }[] = [
  { mode: 'reveal', icon: 'reveal', label: 'Reveal', color: 'var(--md-neon-cyan)', fg: 'var(--md-accent-contrast)' },
  { mode: 'flag', icon: 'flag', label: 'Mark mine', color: 'var(--md-neon-pink)', fg: '#fff' },
];

function ActionToggle({
  actionMode,
  setActionMode,
  vertical,
}: {
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  vertical?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Board action mode"
      className={`flex items-center justify-center gap-1 rounded-full ${vertical ? 'flex-col' : ''}`}
      style={{
        padding: '4px 6px',
        // Neutral track — only the ACTIVE option gets an accent fill, so
        // exactly one is ever colored and the state reads at a glance.
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {MODE_OPTIONS.map((opt) => {
        const on = actionMode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => setActionMode(opt.mode)}
            className="focus-ring flex items-center justify-center rounded-full transition-colors"
            style={clusterButtonStyle(on, opt.color, opt.fg)}
          >
            <Icon name={opt.icon} size={17} />
          </button>
        );
      })}
    </div>
  );
}

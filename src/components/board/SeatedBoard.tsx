import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ActionMode, Board, Player, PlayerStats, Position } from '../../engine/types';
import type { PlayerSeat, SeatPosition, SeatRotation } from '../../engine/arrangement';
import { seatForPlayer } from '../../engine/arrangement';
import type { FeedEvent } from '../../store/useMatchStore';
import { BoardView } from './BoardView';
import { TurnTimer } from '../hud/TurnTimer';
import { SegmentedControl, Button } from '../ui';
import { useIsWide } from '../../hooks/useMediaQuery';

const THEME_VAR: Record<Player['theme'], string> = {
  coral: 'var(--md-player-coral)',
  teal: 'var(--md-player-teal)',
  violet: 'var(--md-player-violet)',
  amber: 'var(--md-player-amber)',
};

export interface SeatedTimerConfig {
  seconds: number;
  resetKey: string | number;
  paused: boolean;
  onExpire: () => void;
  /** Player index whose seat hosts the authoritative (onExpire-firing) countdown. */
  ownerIndex: number;
}

export interface SeatedBoardProps {
  /** Render variant chosen by the arrangement layer: 'face-to-face' | 'table'. */
  variant: 'face-to-face' | 'table';
  players: Player[];
  seats: PlayerSeat[];
  board: Board;
  stats: Record<string, PlayerStats>;
  activePlayerIndex: number;
  showLives: boolean;
  minesLeft: number;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onAction: (kind: 'reveal' | 'flag', pos: Position) => void;
  onPause: () => void;
  disabled: boolean;
  tileSizePref: 'compact' | 'comfortable' | 'large';
  feed: FeedEvent[];
  mistakePos: Position | null;
  timer: SeatedTimerConfig | null;
  /** Overlay slot rendered above the neutral board (e.g. turn transition). */
  children?: ReactNode;
}

/**
 * A shared-device board whose player-facing content (numbers, icons, HUD, and
 * the active Reveal/Flag control) is rotated and positioned toward the active
 * player's physical seat, while the board grid itself stays fixed and neutral.
 *
 * Face-to-Face (2 seats, bottom/top) and Table (3–4 seats around the device)
 * share this shell — they differ only in how many seats exist and where the
 * controls dock. The selected arrangement, not the device size, decides which
 * variant renders; the device size only picks compact vs. roomy presentation.
 */
export function SeatedBoard(props: SeatedBoardProps) {
  const activePlayer = props.players[props.activePlayerIndex];
  const activeSeat = seatForPlayer(props.seats, activePlayer?.id);
  const activeRotation: SeatRotation = activeSeat?.rotation ?? 0;

  const board = (
    <div className="relative h-full w-full">
      <BoardView
        board={props.board}
        players={props.players}
        activePlayerId={activePlayer?.id}
        actionMode={props.actionMode}
        disabled={props.disabled}
        tileSizePref={props.tileSizePref}
        orientationDeg={activeRotation}
        mistakePos={props.mistakePos}
        onAction={props.onAction}
      />
      <SeamFeedback feed={props.feed} players={props.players} rotation={activeRotation} />
      {props.children}
    </div>
  );

  if (props.variant === 'face-to-face') {
    return <FaceToFaceLayout {...props} boardEl={board} />;
  }
  return <TableLayout {...props} boardEl={board} activeSeat={activeSeat} />;
}

// ---------------------------------------------------------------------------
// Face-to-Face: two seats, bottom (0°) and top (180°). Each player's band reads
// upright from their side; the active player's band also hosts the controls.
// ---------------------------------------------------------------------------

function FaceToFaceLayout({
  players,
  seats,
  stats,
  activePlayerIndex,
  showLives,
  minesLeft,
  actionMode,
  setActionMode,
  onPause,
  feed,
  timer,
  boardEl,
}: Omit<SeatedBoardProps, 'board'> & { boardEl: ReactNode }) {
  const wide = useIsWide();
  const bottom = players[seats.find((s) => s.position === 'bottom')?.turnOrder ?? 0] ?? players[0];
  const top = players[seats.find((s) => s.position === 'top')?.turnOrder ?? 1] ?? players[1];
  const bottomActive = players[activePlayerIndex]?.id === bottom?.id;
  const topActive = players[activePlayerIndex]?.id === top?.id;

  const timerFor = (playerIndex: number) =>
    timer ? (
      <TurnTimer
        variant="neon"
        seconds={timer.seconds}
        resetKey={timer.resetKey}
        paused={timer.paused}
        onExpire={timer.onExpire}
        silent={playerIndex !== timer.ownerIndex}
      />
    ) : (
      <div className="h-[5px] w-full rounded-full opacity-40" style={{ background: 'rgba(255,255,255,0.08)' }} />
    );

  return (
    <div className="flex h-full flex-col">
      <NeonHudRow
        player={top}
        stats={stats[top.id]}
        active={topActive}
        showLives={showLives}
        minesLeft={minesLeft}
        wide={wide}
        flip
        timerSlot={timerFor(players.findIndex((p) => p.id === top.id))}
      />
      {/* Controls dock in whichever band is active; the inactive band reserves
          the same height so the board never shifts between turns. */}
      <ControlBand
        active={topActive}
        flip
        wide={wide}
        actionMode={actionMode}
        setActionMode={setActionMode}
        onPause={onPause}
      />
      {wide && <EventLog feed={feed} players={players} flip />}

      <div className="relative mx-2.5 min-h-0 flex-1">{boardEl}</div>

      {wide && <EventLog feed={feed} players={players} />}
      <ControlBand
        active={bottomActive}
        wide={wide}
        actionMode={actionMode}
        setActionMode={setActionMode}
        onPause={onPause}
      />
      <NeonHudRow
        player={bottom}
        stats={stats[bottom.id]}
        active={bottomActive}
        showLives={showLives}
        minesLeft={minesLeft}
        wide={wide}
        timerSlot={timerFor(players.findIndex((p) => p.id === bottom.id))}
      />
    </div>
  );
}

/**
 * Fixed-height control band. Renders the Reveal/Flag + Pause cluster when this
 * band's seat is active, otherwise an equal-height spacer so the board stays put
 * as the turn passes. `flip` rotates it 180° for the top player.
 */
function ControlBand({
  active,
  flip,
  wide,
  actionMode,
  setActionMode,
  onPause,
}: {
  active: boolean;
  flip?: boolean;
  wide: boolean;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onPause: () => void;
}) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: 50, transform: flip ? 'rotate(180deg)' : undefined }}
    >
      {active ? (
        <ActionCluster wide={wide} actionMode={actionMode} setActionMode={setActionMode} onPause={onPause} />
      ) : (
        <div aria-hidden className="h-0" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table: 3–4 seats around the device. Wide (iPad) uses a 3×3 grid with a
// dedicated region per side; compact (iPhone) uses corner indicators plus a
// single floating control cluster on the active player's side.
// ---------------------------------------------------------------------------

function TableLayout({
  players,
  seats,
  stats,
  activePlayerIndex,
  showLives,
  minesLeft,
  actionMode,
  setActionMode,
  onPause,
  timer,
  boardEl,
  activeSeat,
}: Omit<SeatedBoardProps, 'board'> & { boardEl: ReactNode; activeSeat: PlayerSeat | undefined }) {
  const wide = useIsWide();
  const activeId = players[activePlayerIndex]?.id;
  const seatOf = (pos: SeatPosition) => seats.find((s) => s.position === pos);
  const playerAt = (pos: SeatPosition) => {
    const s = seatOf(pos);
    return s ? players.find((p) => p.id === s.playerId) : undefined;
  };

  const timerSlot = (pos: SeatPosition) => {
    const s = seatOf(pos);
    if (!timer || !s) return null;
    return (
      <TurnTimer
        variant="neon"
        seconds={timer.seconds}
        resetKey={timer.resetKey}
        paused={timer.paused}
        onExpire={timer.onExpire}
        silent={s.turnOrder !== timer.ownerIndex}
      />
    );
  };

  const region = (pos: SeatPosition) => {
    const player = playerAt(pos);
    if (!player) return <div />;
    const active = player.id === activeId;
    const vertical = pos === 'left' || pos === 'right';
    return (
      <div className="flex items-center justify-center p-1.5">
        <div
          className="flex flex-col items-center gap-1.5"
          style={{ transform: `rotate(${SEAT_ROTATION_DEG[pos]}deg)` }}
        >
          <SeatChip player={player} stats={stats[player.id]} active={active} showLives={showLives} minesLeft={minesLeft} />
          {active && timerSlot(pos) && <div className="w-28">{timerSlot(pos)}</div>}
          {active && (
            <ActionCluster
              wide={wide}
              vertical={vertical && wide}
              actionMode={actionMode}
              setActionMode={setActionMode}
              onPause={onPause}
            />
          )}
        </div>
      </div>
    );
  };

  if (wide) {
    return (
      <div
        className="grid h-full w-full gap-1"
        style={{
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
        }}
      >
        <div />
        <div className="flex items-start justify-center">{region('top')}</div>
        <div />
        <div className="flex items-center justify-start">{region('left')}</div>
        <div className="relative min-h-0 min-w-0">{boardEl}</div>
        <div className="flex items-center justify-end">{region('right')}</div>
        <div />
        <div className="flex items-end justify-center">{region('bottom')}</div>
        <div />
      </div>
    );
  }

  // Compact (phone): corner indicators + a single floating active-control cluster.
  return (
    <div
      className="relative h-full w-full"
      style={{ paddingTop: 44, paddingBottom: 44 }}
    >
      <div className="relative h-full w-full px-2">{boardEl}</div>
      {seats.map((s) => {
        const player = players.find((p) => p.id === s.playerId);
        if (!player) return null;
        return (
          <CornerIndicator
            key={s.playerId}
            player={player}
            stats={stats[player.id]}
            active={player.id === activeId}
            showLives={showLives}
            corner={CORNER_FOR_SEAT[s.position]}
            rotation={SEAT_ROTATION_DEG[s.position]}
          />
        );
      })}
      {activeSeat && (
        <FloatingActiveControls
          seat={activeSeat.position}
          rotation={SEAT_ROTATION_DEG[activeSeat.position]}
          minesLeft={minesLeft}
          timerSlot={timerSlot(activeSeat.position)}
          actionMode={actionMode}
          setActionMode={setActionMode}
          onPause={onPause}
        />
      )}
    </div>
  );
}

const SEAT_ROTATION_DEG: Record<SeatPosition, number> = { bottom: 0, right: 90, top: 180, left: 270 };

/** Recommended phone corner mapping per seat (spec §3, Table on iPhone). */
const CORNER_FOR_SEAT: Record<SeatPosition, 'bl' | 'br' | 'tr' | 'tl'> = {
  bottom: 'bl',
  right: 'br',
  top: 'tr',
  left: 'tl',
};

const CORNER_STYLE: Record<'bl' | 'br' | 'tr' | 'tl', React.CSSProperties> = {
  bl: { left: 'max(6px, env(safe-area-inset-left))', bottom: 'max(6px, env(safe-area-inset-bottom))' },
  br: { right: 'max(6px, env(safe-area-inset-right))', bottom: 'max(6px, env(safe-area-inset-bottom))' },
  tr: { right: 'max(6px, env(safe-area-inset-right))', top: 'max(6px, env(safe-area-inset-top))' },
  tl: { left: 'max(6px, env(safe-area-inset-left))', top: 'max(6px, env(safe-area-inset-top))' },
};

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function NeonHudRow({
  player,
  stats,
  active,
  showLives,
  minesLeft,
  wide,
  flip,
  timerSlot,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  minesLeft: number;
  wide: boolean;
  flip?: boolean;
  timerSlot: ReactNode;
}) {
  const color = THEME_VAR[player.theme];
  const avatar = wide ? 32 : 24;
  return (
    <div
      className="flex flex-col gap-2"
      style={{
        transform: flip ? 'rotate(180deg)' : undefined,
        padding: flip ? '4px 12px 4px' : '4px 12px 4px',
        opacity: active ? 1 : 0.62,
        transition: 'opacity 180ms ease',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${color}`,
            boxShadow: active ? `0 0 14px ${color}88` : `0 0 8px ${color}44`,
          }}
        >
          <span
            aria-hidden
            className="rounded-full"
            style={{
              width: avatar,
              height: avatar,
              background: `radial-gradient(circle at 35% 30%, ${color}, ${color}55)`,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          <div className="leading-tight">
            <div className="md-display font-bold text-[var(--md-neon-text)]" style={{ fontSize: wide ? 14 : 11 }}>
              {player.name}
            </div>
            <div
              className="md-display flex gap-2 font-semibold text-[var(--md-neon-text-muted)]"
              style={{ fontSize: wide ? 11.5 : 9.5 }}
            >
              <span>💎 {stats.minesDetected}</span>
              {stats.eliminated ? (
                <span className="text-[var(--md-neon-red)]">out</span>
              ) : (
                showLives && <span>❤️ {Number.isFinite(stats.lives) ? stats.lives : '∞'}</span>
              )}
              {stats.currentStreak > 1 && <span>🔥 {stats.currentStreak}</span>}
            </div>
          </div>
        </div>
        <span className="md-display font-bold text-[var(--md-neon-text)]" style={{ fontSize: wide ? 14 : 11 }}>
          💣 {minesLeft}
          {wide ? ' left' : ''}
        </span>
      </div>
      {timerSlot}
    </div>
  );
}

/** Compact seat chip used in the Table grid regions (iPad). */
function SeatChip({
  player,
  stats,
  active,
  showLives,
  minesLeft,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  minesLeft: number;
}) {
  const color = THEME_VAR[player.theme];
  return (
    <div
      className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${color}`,
        boxShadow: active ? `0 0 14px ${color}88` : `0 0 8px ${color}44`,
        opacity: active ? 1 : 0.62,
        transition: 'opacity 180ms ease',
      }}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: 26, height: 26, background: `radial-gradient(circle at 35% 30%, ${color}, ${color}55)`, boxShadow: `0 0 8px ${color}` }}
      />
      <div className="leading-tight">
        <div className="md-display font-bold text-[var(--md-neon-text)]" style={{ fontSize: 12 }}>
          {player.name}
        </div>
        <div className="md-display flex gap-2 font-semibold text-[var(--md-neon-text-muted)]" style={{ fontSize: 10 }}>
          <span>💎 {stats.minesDetected}</span>
          {stats.eliminated ? (
            <span className="text-[var(--md-neon-red)]">out</span>
          ) : (
            showLives && <span>❤️ {Number.isFinite(stats.lives) ? stats.lives : '∞'}</span>
          )}
          {active && <span>💣 {minesLeft}</span>}
        </div>
      </div>
    </div>
  );
}

/** Small always-on player indicator pinned to a screen corner (phone Table). */
function CornerIndicator({
  player,
  stats,
  active,
  showLives,
  corner,
  rotation,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  corner: 'bl' | 'br' | 'tr' | 'tl';
  rotation: number;
}) {
  const color = THEME_VAR[player.theme];
  return (
    <div
      className="pointer-events-none absolute z-10 flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
      style={{
        ...CORNER_STYLE[corner],
        transform: `rotate(${rotation}deg)`,
        background: 'rgba(10,11,20,0.82)',
        border: `1px solid ${color}`,
        boxShadow: active ? `0 0 12px ${color}aa` : `0 0 6px ${color}55`,
        opacity: active ? 1 : 0.66,
      }}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: 18, height: 18, background: `radial-gradient(circle at 35% 30%, ${color}, ${color}55)` }}
      />
      <span className="md-display font-bold text-[var(--md-neon-text)]" style={{ fontSize: 10 }}>
        {player.name}
      </span>
      <span className="md-display font-semibold text-[var(--md-neon-text-muted)]" style={{ fontSize: 10 }}>
        💎{stats.minesDetected}
        {showLives && !stats.eliminated && Number.isFinite(stats.lives) ? ` ❤️${stats.lives}` : ''}
        {stats.eliminated ? ' · out' : ''}
      </span>
    </div>
  );
}

/**
 * Floating, rotated control cluster docked on the active seat's side (phone
 * Table). Left/right seats get a vertical stack; top/bottom a horizontal strip.
 * Respects safe-area insets so it never sits under the Home indicator/Dynamic
 * Island.
 */
function FloatingActiveControls({
  seat,
  rotation,
  minesLeft,
  timerSlot,
  actionMode,
  setActionMode,
  onPause,
}: {
  seat: SeatPosition;
  rotation: number;
  minesLeft: number;
  timerSlot: ReactNode;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onPause: () => void;
}) {
  const edgeStyle: React.CSSProperties =
    seat === 'bottom'
      ? { left: 0, right: 0, bottom: 'max(6px, env(safe-area-inset-bottom))', justifyContent: 'center' }
      : seat === 'top'
        ? { left: 0, right: 0, top: 'max(6px, env(safe-area-inset-top))', justifyContent: 'center' }
        : seat === 'left'
          ? { top: 0, bottom: 0, left: 'max(2px, env(safe-area-inset-left))', flexDirection: 'column', justifyContent: 'center' }
          : { top: 0, bottom: 0, right: 'max(2px, env(safe-area-inset-right))', flexDirection: 'column', justifyContent: 'center' };

  return (
    <div className="pointer-events-none absolute z-10 flex" style={edgeStyle}>
      <div className="pointer-events-auto flex items-center gap-2" style={{ transform: `rotate(${rotation}deg)` }}>
        {timerSlot && <div className="w-24">{timerSlot}</div>}
        <ActionCluster wide={false} actionMode={actionMode} setActionMode={setActionMode} onPause={onPause} />
        <span className="md-display font-bold text-[var(--md-neon-text)]" style={{ fontSize: 11 }}>
          💣 {minesLeft}
        </span>
      </div>
    </div>
  );
}

/**
 * The Reveal / Flag / Pause controls. Radios keep 44px+ touch targets. `wide`
 * uses the roomy segmented control; `vertical` stacks the buttons for a
 * left/right iPad seat instead of rotating a wide toolbar (avoids overflow).
 */
function ActionCluster({
  wide,
  vertical,
  actionMode,
  setActionMode,
  onPause,
}: {
  wide: boolean;
  vertical?: boolean;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onPause: () => void;
}) {
  if (wide && !vertical) {
    return (
      <div className="flex items-center justify-center gap-3">
        <SegmentedControl
          ariaLabel="Action mode"
          value={actionMode}
          onChange={setActionMode}
          options={[
            { value: 'reveal', label: '🔍 Reveal' },
            { value: 'flag', label: '🚩 Flag' },
          ]}
        />
        <Button variant="ghost" onClick={onPause} aria-label="Pause">
          ⏸
        </Button>
      </div>
    );
  }

  const actions: { value: ActionMode; icon: string; label: string }[] = [
    { value: 'reveal', icon: '🔍', label: 'Reveal' },
    { value: 'flag', icon: '🚩', label: 'Flag' },
  ];
  return (
    <div className={`flex items-center justify-center gap-2 ${vertical ? 'flex-col' : ''}`}>
      {actions.map((a) => {
        const on = actionMode === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${a.icon} ${a.label}`}
            onClick={() => setActionMode(a.value)}
            className="focus-ring flex items-center justify-center rounded-[10px] text-[17px]"
            style={{
              minWidth: 44,
              minHeight: 44,
              background: on ? 'linear-gradient(120deg, var(--md-neon-pink), #8b5cf6)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: on ? '0 0 10px color-mix(in srgb, var(--md-neon-pink) 47%, transparent)' : 'none',
            }}
          >
            {a.icon}
          </button>
        );
      })}
      <Button variant="ghost" onClick={onPause} aria-label="Pause">
        ⏸
      </Button>
    </div>
  );
}

// ---- Feed / event chips (shared board feedback) ---------------------------

interface FeedCopy {
  icon: '✓' | '✕';
  text: string;
  tone: 'correct' | 'wrong';
  dotColor: string;
}

function feedCopy(fe: FeedEvent, players: Player[]): FeedCopy {
  const player = players.find((p) => p.id === fe.playerId);
  const name = player?.name ?? 'Someone';
  const dotColor = player ? THEME_VAR[player.theme] : 'var(--md-neon-text-muted)';
  switch (fe.kind) {
    case 'flag-correct':
      return { icon: '✓', text: `${name} flagged correctly`, tone: 'correct', dotColor };
    case 'cascade':
      return { icon: '✓', text: `${name} cleared ${fe.tileCount ?? 0} tiles`, tone: 'correct', dotColor };
    case 'flag-wrong':
      return { icon: '✕', text: `${name} misflagged`, tone: 'wrong', dotColor };
    case 'mine-hit':
      return { icon: '✕', text: `${name} hit a mine`, tone: 'wrong', dotColor };
  }
}

function FeedChip({
  copy,
  size,
  rotation,
  animate,
}: {
  copy: FeedCopy;
  size: number;
  rotation?: number;
  animate?: boolean;
}) {
  return (
    <div
      className={`md-feed-chip ${copy.tone === 'correct' ? 'md-feed-correct' : 'md-feed-wrong'} ${animate ? 'md-chip-in' : ''}`}
      style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined, fontSize: size, fontWeight: 700 }}
    >
      <span className="md-feed-dot" style={{ background: copy.dotColor }} />
      {copy.icon} {copy.text}
    </div>
  );
}

/**
 * Transient mirrored callout of the latest event, centered on the shared board.
 * The primary chip is rotated to the active seat so the current player reads it
 * upright; a second unrotated chip keeps it legible from the bottom seat too.
 */
function SeamFeedback({ feed, players, rotation }: { feed: FeedEvent[]; players: Player[]; rotation: number }) {
  const wide = useIsWide();
  const latest = feed[0] ?? null;
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!latest) return;
    setVisibleId(latest.id);
    const t = setTimeout(() => setVisibleId(null), 2000);
    return () => clearTimeout(t);
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!latest || visibleId !== latest.id) return null;
  const copy = feedCopy(latest, players);
  const size = wide ? 13 : 11;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
      <FeedChip copy={copy} size={size} rotation={rotation} animate />
      {rotation !== 0 && <FeedChip copy={copy} size={size} animate />}
    </div>
  );
}

/** Persistent last-3 mirrored log (tablet, face-to-face). Rotated per band. */
function EventLog({ feed, players, flip }: { feed: FeedEvent[]; players: Player[]; flip?: boolean }) {
  if (feed.length === 0) {
    return <div className="h-6" aria-hidden />;
  }
  const opacities = [1, 0.72, 0.44];
  return (
    <div
      className="flex flex-col gap-1.5 px-6 pb-1"
      style={{ transform: flip ? 'rotate(180deg)' : undefined, alignItems: 'flex-start' }}
    >
      {feed.slice(0, 3).map((fe, i) => {
        const copy = feedCopy(fe, players);
        return (
          <div key={fe.id} style={{ opacity: opacities[i] ?? 0.44 }}>
            <FeedChip copy={copy} size={11.5} />
          </div>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';
import type { ActionMode, Board, Player, PlayerStats, Position } from '../../engine/types';
import type { PlayerSeat, SeatPosition, SeatRotation } from '../../engine/arrangement';
import { SEAT_ROTATION, emptyTableSide, seatForPlayer } from '../../engine/arrangement';
import { useMatchStore } from '../../store/useMatchStore';
import { BoardView } from './BoardView';
import { TurnTimer } from '../hud/TurnTimer';
import { PlayerBadge } from '../PlayerBadge';
import { RotatedGroup } from '../RotatedGroup';
import { Icon } from '../icons';
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
  onAction: (kind: 'reveal' | 'flag', pos: Position) => void;
  disabled: boolean;
  tileSizePref: 'compact' | 'comfortable' | 'large';
  mistakePos: Position | null;
  timer: SeatedTimerConfig | null;
  /** Flags needed to win (duel majority / first-to). Shown as scored/target in seat pills. */
  scoreTarget?: number | null;
  /** The movable Reveal/Mark control dock, laid over the play field. It already
   *  carries the active seat's rotation, so this shell only positions the board
   *  and HUD around it. */
  overlay?: ReactNode;
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
        overlay={props.overlay}
        onAction={props.onAction}
      />
      {props.children}
    </div>
  );

  if (props.variant === 'face-to-face') {
    return <FaceToFaceLayout {...props} boardEl={board} />;
  }
  return <TableLayout {...props} boardEl={board} />;
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
  timer,
  scoreTarget,
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
        hasTimer={Boolean(timer)}
        scoreTarget={scoreTarget}
      />

      {/* The Reveal/Mark controls live in the movable dock laid over the board
          (props.overlay), docked by default to the active player's side. */}
      <div className="relative mx-2.5 min-h-0 flex-1">{boardEl}</div>

      <NeonHudRow
        player={bottom}
        stats={stats[bottom.id]}
        active={bottomActive}
        showLives={showLives}
        minesLeft={minesLeft}
        wide={wide}
        timerSlot={timerFor(players.findIndex((p) => p.id === bottom.id))}
        hasTimer={Boolean(timer)}
        scoreTarget={scoreTarget}
      />
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
  timer,
  scoreTarget,
  boardEl,
}: Omit<SeatedBoardProps, 'board'> & { boardEl: ReactNode }) {
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
    const rotation = SEAT_ROTATION[pos];
    if (!player) {
      return (
        <div className="flex items-center justify-center p-1.5">
          <RotatedGroup rotation={rotation}>
            <EmptySeatBadge />
          </RotatedGroup>
        </div>
      );
    }
    const active = player.id === activeId;
    return (
      <div className="flex items-center justify-center p-1.5">
        <RotatedGroup rotation={rotation} className="flex flex-col items-center gap-1.5">
          <SeatChip player={player} stats={stats[player.id]} active={active} showLives={showLives} minesLeft={minesLeft} scoreTarget={scoreTarget} />
          {/* Reveal/Mark controls are provided by the movable dock over the board. */}
          {active && timerSlot(pos) && (
            <div className="flex w-28 items-center gap-1.5">
              <div className="min-w-0 flex-1">{timerSlot(pos)}</div>
              <TimerSecondsReadout wide={false} />
            </div>
          )}
        </RotatedGroup>
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

  // Compact (phone): per-seat corner indicators around the board; the active
  // player's Reveal/Mark controls live in the movable ControlDock (BoardScreen).
  // Reserve an edge gutter on each OCCUPIED side so the corner indicators —
  // including the vertical labels of left/right seats — sit clear of the board
  // tiles instead of on top of them. Unoccupied sides keep a hairline margin.
  const occupied = new Set(seats.map((s) => s.position));
  const emptySide = emptyTableSide(seats);
  return (
    <div
      className="relative h-full w-full"
      style={{
        paddingTop: occupied.has('top') ? 48 : 8,
        paddingBottom: occupied.has('bottom') ? 48 : 8,
        paddingLeft: occupied.has('left') ? 56 : 8,
        paddingRight: occupied.has('right') ? 56 : 8,
      }}
    >
      {/* Reveal/Mark + Pause come from the movable dock over the board; the
          active seat's corner carries its mines-left and (if any) turn timer. */}
      <div className="relative h-full w-full">{boardEl}</div>
      {seats.map((s) => {
        const player = players.find((p) => p.id === s.playerId);
        if (!player) return null;
        const active = player.id === activeId;
        return (
          <CornerIndicator
            key={s.playerId}
            player={player}
            stats={stats[player.id]}
            active={active}
            showLives={showLives}
            corner={CORNER_FOR_SEAT[s.position]}
            rotation={SEAT_ROTATION[s.position]}
            minesLeft={active ? minesLeft : undefined}
            timerNode={active ? timerSlot(s.position) : null}
            scoreTarget={scoreTarget}
          />
        );
      })}
      {emptySide && (
        <div className="pointer-events-none absolute z-10" style={CORNER_STYLE[CORNER_FOR_SEAT[emptySide]]}>
          <RotatedGroup rotation={SEAT_ROTATION[emptySide]}>
            <EmptySeatBadge compact />
          </RotatedGroup>
        </div>
      )}
    </div>
  );
}


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
  hasTimer,
  scoreTarget,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  minesLeft: number;
  wide: boolean;
  flip?: boolean;
  timerSlot: ReactNode;
  hasTimer?: boolean;
  scoreTarget?: number | null;
}) {
  const color = THEME_VAR[player.theme];
  const avatar = wide ? 32 : 24;
  const textColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text)';
  const mutedColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text-muted)';
  return (
    <div
      className="flex flex-col gap-2"
      style={{
        transform: flip ? 'rotate(180deg)' : undefined,
        padding: '4px 12px 4px',
        opacity: active ? 1 : 0.62,
        transition: 'opacity 180ms ease',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex w-fit shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 ${active ? 'md-pulse' : ''}`}
          style={{
            background: active ? color : 'rgba(255,255,255,0.06)',
            border: `1px solid ${color}`,
            boxShadow: active ? undefined : `0 0 8px ${color}44`,
            transition: 'background 200ms ease',
            ['--md-pulse-color' as string]: color,
          }}
        >
          <PlayerBadge player={player} size={avatar} active={active} />
          <div className="leading-tight">
            <div className="md-display whitespace-nowrap font-bold" style={{ fontSize: wide ? 14 : 11, color: textColor }}>
              {player.name}
            </div>
            <div
              className="md-display flex gap-2 whitespace-nowrap font-semibold"
              style={{ fontSize: wide ? 11.5 : 9.5, color: mutedColor }}
            >
              <span className="inline-flex items-center gap-0.5">
                <Icon name="diamond" size={wide ? 12 : 10} /> {stats.minesDetected}
                {scoreTarget != null && <span className="opacity-70">/{scoreTarget}</span>}
              </span>
              {stats.eliminated ? (
                <span className="text-[var(--md-neon-red)]">out</span>
              ) : (
                showLives && (
                  <span className="inline-flex items-center gap-0.5">
                    <Icon name="heart" size={wide ? 12 : 10} /> {Number.isFinite(stats.lives) ? stats.lives : '∞'}
                  </span>
                )
              )}
              {stats.currentStreak > 1 && <span>🔥 {stats.currentStreak}</span>}
            </div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2.5">
          <span
            className="md-display inline-flex items-center gap-1 font-bold text-[var(--md-neon-text)]"
            style={{ fontSize: wide ? 14 : 11 }}
          >
            <Icon name="bombMine" size={wide ? 14 : 12} /> {minesLeft}
            {wide ? ' left' : ''}
          </span>
          {hasTimer && <TimerSecondsReadout wide={wide} />}
        </span>
      </div>
      {timerSlot}
    </div>
  );
}

/** Remaining turn seconds, mirrored from the authoritative TurnTimer via the
 *  store so the readout never drifts from the countdown bar below it. */
function TimerSecondsReadout({ wide }: { wide: boolean }) {
  const remaining = useMatchStore((s) => s.timerState?.remaining);
  if (remaining == null) return null;
  const low = remaining <= 3;
  return (
    <span
      className="md-display inline-flex items-center gap-1 font-bold tabular-nums"
      style={{ fontSize: wide ? 14 : 11, color: low ? 'var(--md-neon-red)' : 'var(--md-neon-text)' }}
    >
      ⏱ {remaining}s
    </span>
  );
}

/** Compact seat chip used in the Table grid regions (iPad). */
function SeatChip({
  player,
  stats,
  active,
  showLives,
  minesLeft,
  scoreTarget,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  minesLeft: number;
  scoreTarget?: number | null;
}) {
  const color = THEME_VAR[player.theme];
  const textColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text)';
  const mutedColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text-muted)';
  return (
    <div
      className={`flex w-fit shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 ${active ? 'md-pulse' : ''}`}
      style={{
        background: active ? color : 'rgba(255,255,255,0.06)',
        border: `1px solid ${color}`,
        boxShadow: active ? undefined : `0 0 8px ${color}44`,
        opacity: active ? 1 : 0.62,
        transition: 'opacity 180ms ease, background 200ms ease',
        ['--md-pulse-color' as string]: color,
      }}
    >
      <PlayerBadge player={player} size={26} active={active} />
      <div className="leading-tight">
        <div className="md-display whitespace-nowrap font-bold" style={{ fontSize: 12, color: textColor }}>
          {player.name}
        </div>
        <div className="md-display flex gap-2 whitespace-nowrap font-semibold" style={{ fontSize: 10, color: mutedColor }}>
          <span className="inline-flex items-center gap-0.5">
            <Icon name="diamond" size={10} /> {stats.minesDetected}
            {scoreTarget != null && <span className="opacity-70">/{scoreTarget}</span>}
          </span>
          {stats.eliminated ? (
            <span className="text-[var(--md-neon-red)]">out</span>
          ) : (
            showLives && (
              <span className="inline-flex items-center gap-0.5">
                <Icon name="heart" size={10} /> {Number.isFinite(stats.lives) ? stats.lives : '∞'}
              </span>
            )
          )}
          {active && (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="bombMine" size={10} /> {minesLeft}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small always-on player indicator pinned to a screen corner (phone Table).
 *  The active player's corner also carries mines-left and (if enabled) the turn
 *  timer, so nothing collides with the movable control dock over the board. */
function CornerIndicator({
  player,
  stats,
  active,
  showLives,
  corner,
  rotation,
  minesLeft,
  timerNode,
  scoreTarget,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  showLives: boolean;
  corner: 'bl' | 'br' | 'tr' | 'tl';
  rotation: SeatRotation;
  minesLeft?: number;
  timerNode?: ReactNode;
  scoreTarget?: number | null;
}) {
  const color = THEME_VAR[player.theme];
  const textColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text)';
  const mutedColor = active ? 'var(--md-accent-contrast)' : 'var(--md-neon-text-muted)';
  return (
    <div className="pointer-events-none absolute z-10" style={CORNER_STYLE[corner]}>
      <RotatedGroup rotation={rotation} className="flex flex-col items-start gap-1">
        <div
          className={`flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 ${active ? 'md-pulse' : ''}`}
          style={{
            background: active ? color : 'rgba(10,11,20,0.82)',
            border: `1px solid ${color}`,
            boxShadow: active ? undefined : `0 0 6px ${color}55`,
            opacity: active ? 1 : 0.66,
            ['--md-pulse-color' as string]: color,
          }}
        >
          <PlayerBadge player={player} size={18} active={active} />
          <span className="md-display font-bold" style={{ fontSize: 10, color: textColor }}>
            {player.name}
          </span>
          <span className="md-display inline-flex items-center gap-1 font-semibold" style={{ fontSize: 10, color: mutedColor }}>
            <span className="inline-flex items-center gap-0.5">
              <Icon name="diamond" size={9} />
              {stats.minesDetected}
              {scoreTarget != null && <span className="opacity-70">/{scoreTarget}</span>}
            </span>
            {showLives && !stats.eliminated && Number.isFinite(stats.lives) && (
              <span className="inline-flex items-center gap-0.5">
                <Icon name="heart" size={9} />
                {stats.lives}
              </span>
            )}
            {stats.eliminated && <span>· out</span>}
            {minesLeft != null && (
              <span className="inline-flex items-center gap-0.5">
                <Icon name="bombMine" size={9} />
                {minesLeft}
              </span>
            )}
          </span>
        </div>
        {timerNode && (
          <div className="pointer-events-none flex w-24 items-center gap-1.5">
            <div className="min-w-0 flex-1">{timerNode}</div>
            <TimerSecondsReadout wide={false} />
          </div>
        )}
      </RotatedGroup>
    </div>
  );
}

/** Placeholder for an unoccupied Table seat, so an empty side reads as
 *  intentional rather than a rendering gap. `compact` drops the text label
 *  for the phone corner gutter, which is too narrow for a full pill. */
function EmptySeatBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        aria-hidden
        className="block rounded-full"
        style={{ width: 18, height: 18, border: '1.5px dashed rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)' }}
      />
    );
  }
  return (
    <div
      className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.26)' }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center rounded-full text-[var(--md-neon-text-muted)]"
        style={{ width: 26, height: 26, border: '1.5px dashed rgba(255,255,255,0.34)', fontSize: 13 }}
      >
        +
      </span>
      <span className="md-display font-semibold text-[var(--md-neon-text-muted)]" style={{ fontSize: 11 }}>
        Empty seat
      </span>
    </div>
  );
}

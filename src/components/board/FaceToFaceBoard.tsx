import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ActionMode, Board, Player, PlayerStats, Position } from '../../engine/types';
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

interface TimerConfig {
  seconds: number;
  resetKey: string | number;
  paused: boolean;
  onExpire: () => void;
  /** Player index whose row hosts the authoritative (onExpire-firing) countdown. */
  ownerIndex: number;
}

export interface FaceToFaceBoardProps {
  players: Player[]; // exactly 2
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
  timer: TimerConfig | null;
  /** Overlay slot rendered above the neutral board (e.g. turn transition). */
  children?: ReactNode;
}

/**
 * Face-to-face board for two players seated across a shared device. Each
 * player's HUD reads upright from their own side (the top row is rotated 180°),
 * the board between them stays neutral (never rotated), and every correct/
 * mistake event is mirrored so both players read it at once — a transient seam
 * chip on phones, a persistent event log on tablets.
 */
export function FaceToFaceBoard({
  players,
  board,
  stats,
  activePlayerIndex,
  showLives,
  minesLeft,
  actionMode,
  setActionMode,
  onAction,
  onPause,
  disabled,
  tileSizePref,
  feed,
  mistakePos,
  timer,
  children,
}: FaceToFaceBoardProps) {
  const wide = useIsWide();
  // Bottom seat = player 0 (upright); top seat = player 1 (rotated 180°).
  const bottom = players[0];
  const top = players[1];

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
        active={activePlayerIndex === 1}
        showLives={showLives}
        minesLeft={minesLeft}
        wide={wide}
        flip
        timerSlot={timerFor(1)}
      />
      {wide && <EventLog feed={feed} players={players} flip />}

      <div className="relative mx-2.5 min-h-0 flex-1">
        <BoardView
          board={board}
          players={players}
          activePlayerId={players[activePlayerIndex]?.id}
          actionMode={actionMode}
          disabled={disabled}
          tileSizePref={tileSizePref}
          orientationDeg={0}
          mistakePos={mistakePos}
          onAction={onAction}
        />
        <SeamFeedback feed={feed} players={players} />
        {children}
      </div>

      {wide && <EventLog feed={feed} players={players} />}
      <NeonHudRow
        player={bottom}
        stats={stats[bottom.id]}
        active={activePlayerIndex === 0}
        showLives={showLives}
        minesLeft={minesLeft}
        wide={wide}
        timerSlot={timerFor(0)}
      />

      <ActionControls wide={wide} actionMode={actionMode} setActionMode={setActionMode} onPause={onPause} />
    </div>
  );
}

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
        padding: flip ? '4px 12px 12px' : '12px 12px 4px',
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

/**
 * A single feed chip. `dot` colors the acting player; `tone` colors the chip
 * green (correct) or red (mistake). Rotated 180° when it faces the far player.
 */
function FeedChip({
  copy,
  size,
  flip,
  animate,
}: {
  copy: FeedCopy;
  size: number;
  flip?: boolean;
  animate?: boolean;
}) {
  return (
    <div
      className={`md-feed-chip ${copy.tone === 'correct' ? 'md-feed-correct' : 'md-feed-wrong'} ${animate ? 'md-chip-in' : ''}`}
      style={{ transform: flip ? 'rotate(180deg)' : undefined, fontSize: size, fontWeight: 700 }}
    >
      <span className="md-feed-dot" style={{ background: copy.dotColor }} />
      {copy.icon} {copy.text}
    </div>
  );
}

/**
 * Transient mirrored callout of the latest event, centered on the shared board
 * so both players read it upright at once. Auto-hides ~2s after each new event.
 */
function SeamFeedback({ feed, players }: { feed: FeedEvent[]; players: Player[] }) {
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
      <FeedChip copy={copy} size={size} flip animate />
      <div className="h-px w-8" style={{ background: 'rgba(255,255,255,0.15)' }} />
      <FeedChip copy={copy} size={size} animate />
    </div>
  );
}

/** Persistent last-3 mirrored log (tablet). Rotated to match its HUD row. */
function EventLog({ feed, players, flip }: { feed: FeedEvent[]; players: Player[]; flip?: boolean }) {
  if (feed.length === 0) {
    // Reserve a little space so the board doesn't jump when the first event lands.
    return <div className="h-6" aria-hidden />;
  }
  const opacities = [1, 0.72, 0.44];
  return (
    <div
      className="flex flex-col gap-1.5 px-6 pb-2"
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

/** Neutral action strip at the bottom (upright). Phone: icon buttons. Tablet: segmented control. */
function ActionControls({
  wide,
  actionMode,
  setActionMode,
  onPause,
}: {
  wide: boolean;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  onPause: () => void;
}) {
  if (wide) {
    return (
      <div className="flex items-center justify-center gap-3 px-3 pb-3.5 pt-2">
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
    <div className="flex items-center justify-center gap-2 px-3 pb-3.5 pt-2">
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
            className="focus-ring flex h-[34px] w-[42px] items-center justify-center rounded-[10px] text-[15px]"
            style={{
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

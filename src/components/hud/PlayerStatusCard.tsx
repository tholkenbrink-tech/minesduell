import type { Player, PlayerStats } from '../../engine/types';
import { PlayerBadge } from '../PlayerBadge';
import { Icon } from '../icons';

export function PlayerStatusCard({
  player,
  stats,
  active,
  orientationDeg = 0,
  showLives,
  compact,
}: {
  player: Player;
  stats: PlayerStats;
  active: boolean;
  orientationDeg?: 0 | 180;
  showLives: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[var(--md-radius-md)] border px-3 py-2 transition-colors ${
        active ? 'border-[var(--md-accent)] bg-[var(--md-surface)]' : 'border-[var(--md-border)] bg-[var(--md-surface-2)] opacity-80'
      }`}
      style={{ transform: `rotate(${orientationDeg}deg)` }}
    >
      <PlayerBadge player={player} size={compact ? 26 : 32} active={active} />
      <div className="min-w-0 text-left">
        <p className="truncate text-xs font-bold leading-tight">{player.name}</p>
        <p className="flex items-center gap-2 text-[11px] leading-tight text-[var(--md-text-muted)]">
          <span className="inline-flex items-center gap-0.5">
            <Icon name="diamond" size={11} /> {stats.minesDetected}
          </span>
          {stats.eliminated ? (
            <span className="text-[var(--md-danger)]">out</span>
          ) : (
            showLives && (
              <span className="inline-flex items-center gap-0.5">
                <Icon name="heart" size={11} /> {Number.isFinite(stats.lives) ? stats.lives : '∞'}
              </span>
            )
          )}
          {stats.currentStreak > 1 && <span>🔥{stats.currentStreak}</span>}
        </p>
      </div>
    </div>
  );
}

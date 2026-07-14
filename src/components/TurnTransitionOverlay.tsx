import type { Player } from '../engine/types';
import { PlayerBadge } from './PlayerBadge';

export function TurnTransitionOverlay({ player }: { player: Player | undefined }) {
  if (!player) return null;
  return (
    <div
      aria-hidden
      className="md-fade-in pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 rounded-full bg-[var(--md-surface)] px-6 py-3 shadow-lg">
        <PlayerBadge player={player} size={32} active />
        <span className="text-lg font-bold">{player.name}'s turn</span>
      </div>
    </div>
  );
}

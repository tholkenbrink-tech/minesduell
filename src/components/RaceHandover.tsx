import type { Player } from '../engine/types';
import { PlayerBadge } from './PlayerBadge';
import { Button, Card } from './ui';

export function RaceHandover({ player, onStart }: { player: Player; onStart: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Card className="flex max-w-sm flex-col items-center gap-4 p-8">
        <PlayerBadge player={player} size={64} active />
        <div>
          <h2 className="text-2xl font-bold">Hand the device to {player.name}</h2>
          <p className="mt-2 text-sm text-[var(--md-text-muted)]">
            Everyone else should look away — the board resets and your run is private until all players finish.
          </p>
        </div>
        <Button className="w-full" onClick={onStart}>
          Start my run
        </Button>
      </Card>
    </div>
  );
}

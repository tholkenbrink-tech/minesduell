import { useMatchStore, type MatchState } from '../store/useMatchStore';
import type { Player } from '../engine/types';
import type { DuelState } from '../engine/duel';
import { rankRaceResults, type RaceState } from '../engine/race';
import type { CoopState } from '../engine/coop';
import { PlayerBadge } from '../components/PlayerBadge';
import { Button, Card } from '../components/ui';

// Shared table treatment: cells never wrap or collide, and on screens too
// narrow for every column the table scrolls horizontally inside the card.
const TH = 'whitespace-nowrap px-2 py-1.5 font-semibold first:pl-0 last:pr-0';
const TD = 'whitespace-nowrap px-2 py-2 tabular-nums first:pl-0 last:pr-0';

function ScrollTable({ minWidth, children }: { minWidth?: number; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full text-left text-sm" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

function PlayerCell({ player }: { player: Player }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <PlayerBadge player={player} size={22} /> {player.name}
    </span>
  );
}

export function ResultsScreen() {
  const match = useMatchStore((s) => s.match) as MatchState | null;
  const mode = useMatchStore((s) => s.mode);
  const players = useMatchStore((s) => s.players);
  const rematchNewSeed = useMatchStore((s) => s.rematchNewSeed);
  const replaySameSeed = useMatchStore((s) => s.replaySameSeed);
  const goToConfig = useMatchStore((s) => s.goToConfig);
  const goToModeSelect = useMatchStore((s) => s.goToModeSelect);

  if (!match) return null;

  // Clear action hierarchy: one primary follow-up, two secondary variations,
  // and a quiet way out — instead of a same-weight 2x2 grid.
  const actions = (
    <div className="mt-6 flex flex-col gap-2">
      <Button onClick={rematchNewSeed}>Rematch — new board</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={replaySameSeed}>
          Replay same board
        </Button>
        <Button variant="secondary" onClick={goToConfig}>
          Change settings
        </Button>
      </div>
      <Button variant="ghost" onClick={goToModeSelect}>
        Return home
      </Button>
    </div>
  );

  if (mode === 'duel') {
    const duel = match as DuelState;
    const winner = players.find((p) => p.id === duel.winnerId);
    return (
      <Shell title={winner ? `${winner.name} wins!` : "It's a draw"}>
        <ScrollTable minWidth={320}>
          <thead>
            <tr className="text-[var(--md-text-muted)]">
              <th className={TH}>Player</th>
              <th className={TH}>Mines</th>
              <th className={TH}>Wrong flags</th>
              <th className={TH}>Mines hit</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const s = duel.stats[p.id];
              return (
                <tr key={p.id} className="border-t border-[var(--md-border)]">
                  <td className={TD}>
                    <PlayerCell player={p} />
                  </td>
                  <td className={TD}>{s.minesDetected}</td>
                  <td className={TD}>{s.incorrectFlags}</td>
                  <td className={TD}>{s.minesTriggered}</td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
        {actions}
      </Shell>
    );
  }

  if (mode === 'race') {
    const race = match as RaceState;
    const ranking = rankRaceResults(race);
    const winner = ranking.length > 0 ? players.find((p) => p.id === ranking[0].playerId) : undefined;
    return (
      <Shell title="Race results">
        {winner && <p className="text-lg font-bold">{winner.name} wins the race!</p>}
        {players.length > 2 && <p className="text-sm text-[var(--md-text-muted)]">Final standings:</p>}
        <ScrollTable minWidth={430}>
          <thead>
            <tr className="text-[var(--md-text-muted)]">
              <th className={TH}>#</th>
              <th className={TH}>Player</th>
              <th className={TH}>Time</th>
              <th className={TH}>Reveals</th>
              <th className={TH}>Flags</th>
              <th className={TH}>Lives</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const p = players.find((pp) => pp.id === r.playerId)!;
              return (
                <tr key={r.playerId} className="border-t border-[var(--md-border)]">
                  <td className={`${TD} font-bold`}>{r.rank}</td>
                  <td className={TD}>
                    <PlayerCell player={p} />
                    {!r.completed && <span className="ml-1.5 text-xs text-[var(--md-text-muted)]">DNF</span>}
                  </td>
                  <td className={TD}>{r.timeMs != null ? `${(r.timeMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className={TD}>{r.revealActions}</td>
                  <td className={TD}>{r.minesDetected}</td>
                  <td className={TD}>{r.livesRemaining}</td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
        {actions}
      </Shell>
    );
  }

  const coop = match as CoopState;
  return (
    <Shell title={coop.status === 'won' ? 'Team victory!' : 'Team eliminated'}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Team score" value={coop.teamScore} />
        <Stat label="Mines detected" value={Object.values(coop.stats).reduce((a, s) => a + s.minesDetected, 0)} />
        <Stat label="Safe cells revealed" value={Object.values(coop.stats).reduce((a, s) => a + s.safeCellsRevealed, 0)} />
        <Stat label="Longest streak" value={coop.longestStreak} />
        <Stat label="Rewards earned" value={coop.rewards.length} />
        <Stat label="Survivors" value={players.filter((p) => !coop.stats[p.id].eliminated).length} />
      </div>
      <div className="mt-4">
        <ScrollTable minWidth={320}>
          <thead>
            <tr className="text-[var(--md-text-muted)]">
              <th className={TH}>Player</th>
              <th className={TH}>Mines</th>
              <th className={TH}>Safe cells</th>
              <th className={TH}>Lives</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const s = coop.stats[p.id];
              return (
                <tr key={p.id} className="border-t border-[var(--md-border)]">
                  <td className={TD}>
                    <PlayerCell player={p} />
                  </td>
                  <td className={TD}>{s.minesDetected}</td>
                  <td className={TD}>{s.safeCellsRevealed}</td>
                  <td className={TD}>{s.eliminated ? 'Out' : s.lives}</td>
                </tr>
              );
            })}
          </tbody>
        </ScrollTable>
      </div>
      {actions}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <Card className="p-5">{children}</Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-2)] p-3">
      <p className="text-xs text-[var(--md-text-muted)]">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

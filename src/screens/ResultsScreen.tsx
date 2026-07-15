import { useMatchStore, type MatchState } from '../store/useMatchStore';
import type { DuelState } from '../engine/duel';
import { rankRaceResults, type RaceState } from '../engine/race';
import type { CoopState } from '../engine/coop';
import { PlayerBadge } from '../components/PlayerBadge';
import { Button, Card } from '../components/ui';

export function ResultsScreen() {
  const match = useMatchStore((s) => s.match) as MatchState | null;
  const mode = useMatchStore((s) => s.mode);
  const players = useMatchStore((s) => s.players);
  const rematchNewSeed = useMatchStore((s) => s.rematchNewSeed);
  const replaySameSeed = useMatchStore((s) => s.replaySameSeed);
  const goToConfig = useMatchStore((s) => s.goToConfig);
  const goToModeSelect = useMatchStore((s) => s.goToModeSelect);

  if (!match) return null;

  const actions = (
    <div className="mt-6 grid grid-cols-2 gap-2">
      <Button onClick={rematchNewSeed}>Rematch (new board)</Button>
      <Button variant="secondary" onClick={replaySameSeed}>
        Replay same board
      </Button>
      <Button variant="secondary" onClick={goToConfig}>
        Change settings
      </Button>
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
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--md-text-muted)]">
              <th className="py-1">Player</th>
              <th>Mines</th>
              <th>Wrong flags</th>
              <th>Mines hit</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const s = duel.stats[p.id];
              return (
                <tr key={p.id} className="border-t border-[var(--md-border)]">
                  <td className="flex items-center gap-2 py-2">
                    <PlayerBadge player={p} size={22} /> {p.name}
                  </td>
                  <td>{s.minesDetected}</td>
                  <td>{s.incorrectFlags}</td>
                  <td>{s.minesTriggered}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {actions}
      </Shell>
    );
  }

  if (mode === 'race') {
    const race = match as RaceState;
    const ranking = rankRaceResults(race);
    return (
      <Shell title="Race results">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--md-text-muted)]">
              <th className="py-1">#</th>
              <th>Player</th>
              <th>Status</th>
              <th>Time</th>
              <th>Reveals</th>
              <th>Flags</th>
              <th>Lives left</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const p = players.find((pp) => pp.id === r.playerId)!;
              return (
                <tr key={r.playerId} className="border-t border-[var(--md-border)]">
                  <td className="py-2 font-bold">{r.rank}</td>
                  <td className="flex items-center gap-2">
                    <PlayerBadge player={p} size={22} /> {p.name}
                  </td>
                  <td>{r.completed ? 'Finished' : 'Incomplete'}</td>
                  <td>{r.timeMs != null ? `${(r.timeMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td>{r.revealActions}</td>
                  <td>{r.minesDetected}</td>
                  <td>{r.livesRemaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-[var(--md-text-muted)]">
            <th className="py-1">Player</th>
            <th>Mines</th>
            <th>Safe cells</th>
            <th>Lives</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = coop.stats[p.id];
            return (
              <tr key={p.id} className="border-t border-[var(--md-border)]">
                <td className="flex items-center gap-2 py-2">
                  <PlayerBadge player={p} size={22} /> {p.name}
                </td>
                <td>{s.minesDetected}</td>
                <td>{s.safeCellsRevealed}</td>
                <td>{s.eliminated ? 'Eliminated' : s.lives}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

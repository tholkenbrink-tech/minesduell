import { useState } from 'react';
import { PLAYER_SHAPES, PLAYER_THEMES, type Player } from '../engine/types';
import { useMatchStore } from '../store/useMatchStore';
import { usePrefsStore } from '../store/usePrefsStore';
import { Button, Card, Toggle } from '../components/ui';
import { PlayerBadge } from '../components/PlayerBadge';
import { shuffled, mulberry32 } from '../engine/rng';
import { modeDisplayName } from '../engine/defaults';

function makePlayer(index: number, name: string): Player {
  return {
    id: `player-${index}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name,
    theme: PLAYER_THEMES[index % PLAYER_THEMES.length],
    shape: PLAYER_SHAPES[index % PLAYER_SHAPES.length],
  };
}

export function PlayerSetupScreen() {
  const mode = useMatchStore((s) => s.mode);
  const setPlayersInStore = useMatchStore((s) => s.setPlayers);
  const goToConfig = useMatchStore((s) => s.goToConfig);
  const goToModeSelect = useMatchStore((s) => s.goToModeSelect);
  const recentNames = usePrefsStore((s) => s.recentPlayerNames);
  const addRecentPlayerName = usePrefsStore((s) => s.addRecentPlayerName);

  const [players, setPlayers] = useState<Player[]>(() => [
    makePlayer(0, 'Player 1'),
    makePlayer(1, 'Player 2'),
  ]);
  const [randomStart, setRandomStart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateName(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function addPlayer() {
    if (players.length >= 4) return;
    setPlayers((prev) => [...prev, makePlayer(prev.length, `Player ${prev.length + 1}`)]);
  }

  function removePlayer(id: string) {
    if (players.length <= 2) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    setPlayers((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleContinue() {
    const trimmed = players.map((p) => ({ ...p, name: p.name.trim() || p.name }));
    const names = trimmed.map((p) => p.name.toLowerCase());
    const hasDuplicate = new Set(names).size !== names.length;
    if (hasDuplicate) {
      setError('Give each player a unique name so scores stay easy to tell apart.');
      return;
    }
    for (const p of trimmed) addRecentPlayerName(p.name);
    const finalOrder = randomStart ? shuffled(trimmed, mulberry32(Date.now() % 2147483647)) : trimmed;
    setPlayersInStore(finalOrder);
    goToConfig();
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <button className="focus-ring text-sm text-[var(--md-text-muted)]" onClick={goToModeSelect}>
          ← Change mode
        </button>
        <h1 className="mt-2 text-3xl font-extrabold">Who's playing?</h1>
        <p className="text-sm font-semibold text-[var(--md-accent)]">{modeDisplayName(mode)}</p>
        <p className="text-sm text-[var(--md-text-muted)]">2 to 4 players, one device.</p>
      </div>

      <datalist id="recent-names">
        {recentNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <ul className="flex flex-col gap-3">
        {players.map((p, i) => (
          <Card key={p.id} className="flex items-center gap-3 p-3">
            <PlayerBadge player={p} />
            <input
              aria-label={`Name for player ${i + 1}`}
              list="recent-names"
              value={p.name}
              onChange={(e) => updateName(p.id, e.target.value)}
              maxLength={16}
              className="focus-ring min-w-0 flex-1 rounded-[var(--md-radius-sm)] border border-[var(--md-border)] bg-[var(--md-surface)] px-3 py-2 text-sm"
            />
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(p.id, -1)}
                className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] px-2 py-1 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === players.length - 1}
                onClick={() => move(p.id, 1)}
                className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] px-2 py-1 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove player ${i + 1}`}
                disabled={players.length <= 2}
                onClick={() => removePlayer(p.id)}
                className="focus-ring rounded-[var(--md-radius-sm)] border border-[var(--md-border)] px-2 py-1 text-xs text-[var(--md-danger)] disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          </Card>
        ))}
      </ul>

      <Button variant="secondary" onClick={addPlayer} disabled={players.length >= 4}>
        + Add player
      </Button>

      <Card className="p-4">
        <Toggle
          checked={randomStart}
          onChange={setRandomStart}
          label="Random starting player"
          description="Shuffle seating order once before the match begins."
        />
      </Card>

      {error && <p className="text-sm text-[var(--md-danger)]">{error}</p>}

      <Button className="w-full" onClick={handleContinue}>
        Continue to settings
      </Button>
    </div>
  );
}

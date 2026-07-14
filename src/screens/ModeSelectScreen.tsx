import { useState } from 'react';
import type { GameMode } from '../engine/types';
import { useMatchStore } from '../store/useMatchStore';
import { Card, Button } from '../components/ui';
import { RulesModal } from '../components/RulesModal';

interface ModeInfo {
  mode: GameMode;
  title: string;
  tagline: string;
  objective: string;
  turns: string;
  ending: string;
  length: string;
  accent: string;
}

const MODES: ModeInfo[] = [
  {
    mode: 'duel',
    title: 'Duell',
    tagline: 'Head-to-head mine hunting',
    objective: 'Players compete on one shared board and try to correctly identify mines.',
    turns: 'You keep your turn on every correct move — you only hand over when you hit a mine or misflag a safe tile.',
    ending: 'First to the mine target, or the most mines detected when the board is solved.',
    length: '5–10 minutes',
    accent: 'var(--md-player-coral)',
  },
  {
    mode: 'race',
    title: 'Race',
    tagline: 'Same board, solo runs',
    objective: 'Everyone solves the identical seeded board, one after another, in private.',
    turns: 'Each player gets one uninterrupted run — no turn-passing mid-run.',
    ending: 'Fastest clear, fewest clicks, or best survival — results reveal once everyone has played.',
    length: '2–4 minutes per player',
    accent: 'var(--md-player-teal)',
  },
  {
    mode: 'coop',
    title: 'Co-op Survival',
    tagline: 'Team up, share the risk',
    objective: 'Two to four players solve one board together while protecting shared lives.',
    turns: 'The active player rotates after every single action, right or wrong.',
    ending: 'Team wins by clearing the board or hitting the score target; loses if everyone is eliminated.',
    length: '6–12 minutes',
    accent: 'var(--md-player-violet)',
  },
];

export function ModeSelectScreen() {
  const selectMode = useMatchStore((s) => s.selectMode);
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 px-4 py-10 sm:py-16">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">MinesDuell</h1>
        <p className="mt-2 text-[var(--md-text-muted)]">Local multiplayer Minesweeper for 2–4 players, one device.</p>
      </div>

      <div className="grid w-full gap-5 sm:grid-cols-3">
        {MODES.map((m) => (
          <Card key={m.mode} className="flex flex-col gap-3 p-5 text-left">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: m.accent }} aria-hidden />
              <h2 className="text-xl font-bold">{m.title}</h2>
            </div>
            <p className="text-sm font-medium text-[var(--md-text-muted)]">{m.tagline}</p>
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="font-semibold">Objective</dt>
                <dd className="text-[var(--md-text-muted)]">{m.objective}</dd>
              </div>
              <div>
                <dt className="font-semibold">Turns</dt>
                <dd className="text-[var(--md-text-muted)]">{m.turns}</dd>
              </div>
              <div>
                <dt className="font-semibold">Game ends</dt>
                <dd className="text-[var(--md-text-muted)]">{m.ending}</dd>
              </div>
              <div>
                <dt className="font-semibold">Length</dt>
                <dd className="text-[var(--md-text-muted)]">{m.length}</dd>
              </div>
            </dl>
            <Button className="mt-auto w-full" onClick={() => selectMode(m.mode)}>
              Play {m.title}
            </Button>
          </Card>
        ))}
      </div>

      <Button variant="ghost" onClick={() => setShowRules(true)}>
        How to play
      </Button>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

import { useState } from 'react';
import type { GameMode } from '../engine/types';
import { useMatchStore } from '../store/useMatchStore';
import { Card, Button } from '../components/ui';
import { RulesModal } from '../components/RulesModal';
import { Icon, type IconName } from '../components/icons';

interface ModeInfo {
  mode: GameMode;
  title: string;
  tagline: string;
  icon: IconName;
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
    icon: 'modeDuel',
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
    icon: 'modeRace',
    objective: 'Everyone solves the identical seeded board, one after another, in private.',
    turns: 'Each player gets one uninterrupted run — no turn-passing mid-run.',
    ending: 'Fastest clear, fewest clicks, or best survival — results reveal once everyone has played.',
    length: '2–4 minutes per player',
    accent: 'var(--md-player-teal)',
  },
  {
    mode: 'coop',
    title: 'Co-Op',
    tagline: 'Team up, share the risk',
    icon: 'modeCoop',
    objective: 'Two to four players solve one board together while protecting shared lives.',
    turns: 'Each player keeps going until they mark 5 bombs, then hands the device over — or immediately if they make a mistake.',
    ending: 'Team wins by clearing the board or hitting the score target; loses if everyone is eliminated.',
    length: '6–12 minutes',
    accent: 'var(--md-player-violet)',
  },
];

export function ModeSelectScreen() {
  const selectMode = useMatchStore((s) => s.selectMode);
  const [showRules, setShowRules] = useState(false);
  const [activeMode, setActiveMode] = useState<GameMode>('duel');
  const active = MODES.find((m) => m.mode === activeMode)!;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center gap-6 px-4 py-10 sm:py-16">
      <div className="text-center">
        <h1 className="md-gradient-text text-5xl font-black tracking-tight sm:text-6xl">MinesDuell</h1>
        <p className="mt-3 text-[var(--md-text-muted)]">Local multiplayer Minesweeper for 2–4 players, one device.</p>
      </div>

      {/* One tap selects a mode and opens its detail card below; the small ▶
          selecting a mode reveals its details and Start button below. */}
      <div role="tablist" aria-label="Game mode" className="flex w-full gap-2">
        {MODES.map((m) => {
          const isActive = m.mode === activeMode;
          return (
            <button
              key={m.mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveMode(m.mode)}
              className="focus-ring flex min-w-0 flex-1 basis-0 items-center justify-center gap-2 rounded-[var(--md-radius-md)] border border-[var(--md-border)] px-2 py-2.5 text-xs font-bold transition-colors sm:text-sm"
              style={{
                background: isActive ? m.accent : 'var(--md-surface-2)',
                color: isActive ? 'var(--md-accent-contrast)' : 'var(--md-text)',
              }}
            >
              <Icon name={m.icon} size={18} />
              <span className="truncate">{m.title}</span>
            </button>
          );
        })}
      </div>

      <Card key={active.mode} className="md-pop-in flex w-full flex-col gap-4 p-5 text-left">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: active.accent }} aria-hidden />
              <h2 className="text-xl font-bold">{active.title}</h2>
            </div>
            <p className="text-sm font-medium text-[var(--md-text-muted)]">{active.tagline}</p>
          </div>
          <Button className="shrink-0" onClick={() => selectMode(active.mode)}>
            Start {active.title}
          </Button>
        </div>
        <dl className="grid grid-cols-1 gap-3 border-t border-[var(--md-border)] pt-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Objective</dt>
            <dd className="text-[var(--md-text-muted)]">{active.objective}</dd>
          </div>
          <div>
            <dt className="font-semibold">Turns</dt>
            <dd className="text-[var(--md-text-muted)]">{active.turns}</dd>
          </div>
          <div>
            <dt className="font-semibold">Game ends</dt>
            <dd className="text-[var(--md-text-muted)]">{active.ending}</dd>
          </div>
          <div>
            <dt className="font-semibold">Length</dt>
            <dd className="text-[var(--md-text-muted)]">{active.length}</dd>
          </div>
        </dl>
      </Card>

      <Button variant="ghost" onClick={() => setShowRules(true)}>
        How to play
      </Button>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

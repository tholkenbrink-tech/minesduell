import { beforeEach, describe, expect, it } from 'vitest';
import { useMatchStore } from '../useMatchStore';
import { generateBoard } from '../../engine/board';
import type { Board, GameMode, Player } from '../../engine/types';
import { PLAYER_SHAPES, PLAYER_THEMES } from '../../engine/types';
import type { DuelState } from '../../engine/duel';
import type { RaceState } from '../../engine/race';
import type { CoopState } from '../../engine/coop';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    theme: PLAYER_THEMES[i % PLAYER_THEMES.length],
    shape: PLAYER_SHAPES[i % PLAYER_SHAPES.length],
  }));
}

function start(mode: GameMode) {
  const s = useMatchStore.getState();
  s.selectMode(mode);
  s.setPlayers(makePlayers(2));
  s.updateSettings({ board: { width: 12, height: 12, mines: 20, preset: 'custom' } });
  s.startGame();
}

/** The board the active player would be playing on, per mode. */
function activeBoard(): Board {
  const state = useMatchStore.getState();
  const match = state.match!;
  if (match.mode === 'race') {
    const race = match as RaceState;
    return race.runs[race.order[race.currentIndex]].board;
  }
  return (match as DuelState | CoopState).board;
}

/**
 * Mines are placed lazily on the first reveal, so an ungenerated board carries
 * no layout to compare. Generating from the SAME first click isolates the seed
 * as the only difference between two matches.
 */
function mineLayout(board: Board): string {
  const generated = generateBoard(board, { x: 0, y: 0 });
  return generated.cells.map((row) => row.map((c) => (c.mine ? '*' : '.')).join('')).join('/');
}

const seed = () => useMatchStore.getState().seedBase;

beforeEach(() => {
  localStorage.clear();
});

describe('a new game is actually a new board', () => {
  for (const mode of ['duel', 'race', 'coop'] as const) {
    it(`${mode}: starting a second game reseeds and relays the mines`, () => {
      start(mode);
      const firstSeed = seed();
      const firstLayout = mineLayout(activeBoard());

      start(mode);
      expect(seed()).not.toBe(firstSeed);
      expect(mineLayout(activeBoard())).not.toBe(firstLayout);
    });

    it(`${mode}: "rematch — new board" reseeds and relays the mines`, () => {
      start(mode);
      const firstSeed = seed();
      const firstLayout = mineLayout(activeBoard());

      useMatchStore.getState().rematchNewSeed();
      expect(seed()).not.toBe(firstSeed);
      expect(mineLayout(activeBoard())).not.toBe(firstLayout);
    });
  }

  it('race: every player in one race shares the identical board — that is the mode', () => {
    start('race');
    const race = useMatchStore.getState().match as RaceState;
    const layouts = race.order.map((id) => mineLayout(race.runs[id].board));
    expect(new Set(layouts).size).toBe(1);
  });

  it('"replay same board" is the only path that keeps the layout', () => {
    start('duel');
    const firstSeed = seed();
    const firstLayout = mineLayout(activeBoard());

    useMatchStore.getState().replaySameSeed();
    expect(seed()).toBe(firstSeed);
    expect(mineLayout(activeBoard())).toBe(firstLayout);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMatchStore, END_HOLD_MS } from '../useMatchStore';
import { generateBoard } from '../../engine/board';
import { PLAYER_SHAPES, PLAYER_THEMES, type GameMode, type Player, type Position } from '../../engine/types';
import type { RaceState } from '../../engine/race';
import type { DuelState } from '../../engine/duel';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    theme: PLAYER_THEMES[i % PLAYER_THEMES.length],
    shape: PLAYER_SHAPES[i % PLAYER_SHAPES.length],
  }));
}

function start(mode: GameMode, mines = 10) {
  const s = useMatchStore.getState();
  s.selectMode(mode);
  s.setPlayers(makePlayers(2));
  s.updateSettings({ board: { width: 8, height: 8, mines, preset: 'custom' }, raceLives: 1 });
  s.startGame();
}

const state = () => useMatchStore.getState();

/** Reveals a safe cell to generate the board, then returns a known mine. */
function openBoardAndFindMine(board: Parameters<typeof generateBoard>[0]): Position {
  const generated = generateBoard(board, { x: 0, y: 0 });
  for (let y = 0; y < generated.height; y++) {
    for (let x = 0; x < generated.width; x++) {
      if (generated.cells[y][x].mine) return { x, y };
    }
  }
  throw new Error('no mine on the board');
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('end-of-round hold', () => {
  it('race: keeps the finished board on screen before handing over', () => {
    start('race');
    state().startRaceRun();
    const race = () => state().match as RaceState;
    const mine = openBoardAndFindMine(race().runs.p0.board);

    state().reveal({ x: 0, y: 0 }); // safe first reveal generates the board
    state().reveal(mine); // one life, so this ends the run

    // The engine has moved on, but the screen has not: the board the player
    // just lost on is still what's rendered.
    expect(race().phase).toBe('handover');
    expect(state().screen).toBe('board');
    expect(state().endHold).toEqual({ screen: 'board', raceRunIndex: 0 });

    vi.advanceTimersByTime(END_HOLD_MS);
    expect(state().endHold).toBeNull();
  });

  it('duel: delays the results screen by the hold, then shows it', () => {
    start('duel', 1);
    const duel = () => state().match as DuelState;
    const mine = openBoardAndFindMine(duel().board);

    // One mine on an 8x8: the safe first reveal cascades over everything else,
    // and flagging that mine (if the cascade hasn't already ended it) finishes
    // the match either way.
    state().reveal({ x: 0, y: 0 });
    if (duel().status === 'playing') state().flag(mine);
    expect(duel().status).not.toBe('playing');

    expect(state().screen).toBe('board');
    expect(state().endHold?.screen).toBe('results');

    vi.advanceTimersByTime(END_HOLD_MS - 1);
    expect(state().screen).toBe('board');

    vi.advanceTimersByTime(1);
    expect(state().screen).toBe('results');
    expect(state().endHold).toBeNull();
  });

  it('a restart during the hold cancels it instead of yanking the new board away', () => {
    start('race');
    state().startRaceRun();
    const race = () => state().match as RaceState;
    const mine = openBoardAndFindMine(race().runs.p0.board);
    state().reveal({ x: 0, y: 0 });
    state().reveal(mine);
    expect(state().endHold).not.toBeNull();

    state().restartRound();
    expect(state().endHold).toBeNull();
    expect(state().screen).toBe('board');

    // The stale timer must not fire into the fresh round.
    vi.advanceTimersByTime(END_HOLD_MS * 2);
    expect(state().screen).toBe('board');
    expect(state().endHold).toBeNull();
  });

  it('giving up ignores a run that has already finished', () => {
    start('race');
    state().startRaceRun();
    const race = () => state().match as RaceState;
    const mine = openBoardAndFindMine(race().runs.p0.board);
    state().reveal({ x: 0, y: 0 });
    state().reveal(mine);

    const indexBefore = race().currentIndex;
    state().giveUpRace(); // tapped during the hold
    expect(race().currentIndex).toBe(indexBefore);
  });
});

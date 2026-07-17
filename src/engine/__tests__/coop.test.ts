import { describe, expect, it } from 'vitest';
import { defaultCoopSettings } from '../defaults';
import { createCoopMatch, applyCoopFlag, applyCoopReveal } from '../coop';
import type { Player } from '../types';

function makePlayers(n: number): Player[] {
  const themes = ['coral', 'teal', 'violet', 'amber'] as const;
  const shapes = ['circle', 'triangle', 'square', 'diamond'] as const;
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, theme: themes[i], shape: shapes[i] }));
}

function firstMinePosition(board: ReturnType<typeof createCoopMatch>['board']) {
  for (let y = 0; y < board.height; y++)
    for (let x = 0; x < board.width; x++) if (board.cells[y][x].mine) return { x, y };
  throw new Error('no mine');
}

describe('coop survival mode', () => {
  it('reveals never rotate the turn by themselves — only mistakes or marking 5 bombs do', () => {
    const settings = defaultCoopSettings();
    let state = createCoopMatch(settings, makePlayers(3), 20);
    const first = state.activePlayerIndex;
    state = applyCoopReveal(state, { x: 0, y: 0 }).state; // generates the board
    expect(state.activePlayerIndex).toBe(first);

    // Reveal several more safe cells — no amount of plain reveals should rotate the turn.
    const safe: { x: number; y: number }[] = [];
    for (let y = 0; y < state.board.height && safe.length < 6; y++) {
      for (let x = 0; x < state.board.width && safe.length < 6; x++) {
        if (!state.board.cells[y][x].mine && !state.board.cells[y][x].revealed) safe.push({ x, y });
      }
    }
    for (const pos of safe) {
      if (state.board.cells[pos.y][pos.x].revealed) continue;
      state = applyCoopReveal(state, pos).state;
      expect(state.activePlayerIndex).toBe(first);
    }
  });

  it('keeps the active player for up to 5 correctly-marked bombs, then rotates', () => {
    const settings = defaultCoopSettings();
    let state = createCoopMatch(settings, makePlayers(3), 20);
    const first = state.activePlayerIndex;
    state = applyCoopReveal(state, { x: 0, y: 0 }).state; // generates the board

    const mines: { x: number; y: number }[] = [];
    for (let y = 0; y < state.board.height && mines.length < 5; y++) {
      for (let x = 0; x < state.board.width && mines.length < 5; x++) {
        if (state.board.cells[y][x].mine) mines.push({ x, y });
      }
    }
    expect(mines.length).toBe(5);

    // Marking bombs 1–4 keeps the same player.
    for (let i = 0; i < 4; i++) {
      state = applyCoopFlag(state, mines[i]).state;
      expect(state.activePlayerIndex).toBe(first);
    }
    // Marking the 5th bomb ends the round and rotates to the next player.
    state = applyCoopFlag(state, mines[4]).state;
    expect(state.activePlayerIndex).not.toBe(first);
  });

  it('rotates immediately when a player makes a mistake (before 5 actions)', () => {
    const settings = defaultCoopSettings();
    let state = createCoopMatch(settings, makePlayers(2), 30);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state; // action 1, safe
    const before = state.activePlayerIndex;
    // Find and reveal a mine on action 2 → mistake → immediate rotation.
    let mine: { x: number; y: number } | null = null;
    for (let y = 0; y < state.board.height && !mine; y++)
      for (let x = 0; x < state.board.width && !mine; x++) if (state.board.cells[y][x].mine) mine = { x, y };
    state = applyCoopReveal(state, mine!).state;
    expect(state.activePlayerIndex).not.toBe(before);
  });

  it('awards a reward after three consecutive correct mine flags', () => {
    const settings = { ...defaultCoopSettings(), coopRewards: { extraLife: true, peek: false, randomDrop: false } };
    let state = createCoopMatch(settings, makePlayers(2), 30);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state;
    let flagged = 0;
    for (let y = 0; y < state.board.height && flagged < 3; y++) {
      for (let x = 0; x < state.board.width && flagged < 3; x++) {
        if (state.board.cells[y][x].mine && !state.board.cells[y][x].flagged) {
          const result = applyCoopFlag(state, { x, y });
          flagged++;
          if (flagged === 3) {
            expect(result.events.some((e) => e.type === 'REWARD_EARNED')).toBe(true);
          }
        }
      }
    }
    expect(state.rewards.length).toBeGreaterThan(0);
  });

  it('an incorrect flag resets the streak counter', () => {
    const settings = defaultCoopSettings();
    let state = createCoopMatch(settings, makePlayers(2), 30);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state.board);
    applyCoopFlag(state, minePos);
    expect(state.streakCount).toBe(1);
    // find a safe unflagged cell to incorrectly flag
    outer: for (let y = 0; y < state.board.height; y++) {
      for (let x = 0; x < state.board.width; x++) {
        const c = state.board.cells[y][x];
        if (!c.mine && !c.flagged && !c.revealed) {
          applyCoopFlag(state, { x, y });
          break outer;
        }
      }
    }
    expect(state.streakCount).toBe(0);
  });

  it('eliminates a player at zero lives and ends the team game when all are eliminated', () => {
    const settings = { ...defaultCoopSettings(), coopLives: 1 };
    let state = createCoopMatch(settings, makePlayers(1), 30);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state.board);
    applyCoopReveal(state, minePos);
    expect(state.stats.p0.eliminated).toBe(true);
    expect(state.status).toBe('lost');
  });

  it('wins the team game when the board is fully revealed (complete-board target)', () => {
    const settings = { ...defaultCoopSettings(), board: { width: 4, height: 4, mines: 1, preset: 'custom' as const } };
    let state = createCoopMatch(settings, makePlayers(2), 42);
    // Reveal every cell; mines get skipped by revealCell (no-op reveal risk), so
    // instead flag mines and reveal everything else until the board is solved.
    let guard = 0;
    while (state.status === 'playing' && guard < 200) {
      let acted = false;
      outer: for (let y = 0; y < state.board.height; y++) {
        for (let x = 0; x < state.board.width; x++) {
          const c = state.board.cells[y][x];
          if (c.mine && !c.flagged) {
            state = applyCoopFlag(state, { x, y }).state;
            acted = true;
            break outer;
          }
          if (!c.mine && !c.revealed) {
            state = applyCoopReveal(state, { x, y }).state;
            acted = true;
            break outer;
          }
        }
      }
      guard++;
      if (!acted) break;
    }
    expect(state.status).toBe('won');
  });

  it('a Peek reward inspects a hidden cell without revealing its number', () => {
    const settings = { ...defaultCoopSettings(), coopRewards: { extraLife: false, peek: true, randomDrop: false } };
    let state = createCoopMatch(settings, makePlayers(2), 30);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state;
    let flagged = 0;
    for (let y = 0; y < state.board.height && flagged < 3; y++) {
      for (let x = 0; x < state.board.width && flagged < 3; x++) {
        if (state.board.cells[y][x].mine && !state.board.cells[y][x].flagged) {
          state = applyCoopFlag(state, { x, y }).state;
          flagged++;
        }
      }
    }
    expect(state.pendingPeek).not.toBeNull();
  });
});

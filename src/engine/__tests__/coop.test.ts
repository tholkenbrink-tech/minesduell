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
  it('rotates the active player after every action, correct or not', () => {
    const settings = defaultCoopSettings();
    let state = createCoopMatch(settings, makePlayers(3), 20);
    state = applyCoopReveal(state, { x: 0, y: 0 }).state;
    const first = state.activePlayerIndex;
    state = applyCoopReveal(state, { x: state.board.width - 1, y: state.board.height - 1 }).state;
    expect(state.activePlayerIndex).not.toBe(first);
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

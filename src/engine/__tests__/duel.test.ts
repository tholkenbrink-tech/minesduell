import { describe, expect, it } from 'vitest';
import { defaultDuelSettings } from '../defaults';
import { createDuelMatch, applyDuelFlag, applyDuelReveal, handleDuelTimerExpired } from '../duel';
import type { Player } from '../types';

function makePlayers(n: number): Player[] {
  const themes = ['coral', 'teal', 'violet', 'amber'] as const;
  const shapes = ['circle', 'triangle', 'square', 'diamond'] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    theme: themes[i],
    shape: shapes[i],
  }));
}

function firstMinePosition(state: ReturnType<typeof createDuelMatch>) {
  for (let y = 0; y < state.board.height; y++) {
    for (let x = 0; x < state.board.width; x++) {
      if (state.board.cells[y][x].mine) return { x, y };
    }
  }
  throw new Error('no mine found');
}

function firstSafeNumberedPosition(state: ReturnType<typeof createDuelMatch>, exclude: { x: number; y: number }) {
  for (let y = 0; y < state.board.height; y++) {
    for (let x = 0; x < state.board.width; x++) {
      const cell = state.board.cells[y][x];
      if (!cell.mine && !cell.revealed && cell.adjacent > 0 && !(x === exclude.x && y === exclude.y)) return { x, y };
    }
  }
  throw new Error('no numbered safe cell found');
}

describe('duel mode', () => {
  it('correctly flagging a mine retains the turn and scores a point', () => {
    const settings = { ...defaultDuelSettings(), duelVariant: 'streak' as const };
    let state = createDuelMatch(settings, makePlayers(2), 11);
    // Force-generate the board via an initial reveal far from mines, then locate a mine.
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);
    const activeBefore = state.activePlayerIndex;
    const result = applyDuelFlag(state, minePos);
    expect(state.stats[state.players[activeBefore].id].minesDetected).toBe(1);
    expect(state.activePlayerIndex).toBe(activeBefore); // turn retained
    expect(result.events.some((e) => e.type === 'MINE_CORRECTLY_FLAGGED')).toBe(true);
  });

  it('incorrectly flagging a safe cell ends the turn', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const activeBefore = state.activePlayerIndex;
    // find a safe, unrevealed, unflagged cell
    let safe = { x: 0, y: 0 };
    outer: for (let y = 0; y < state.board.height; y++) {
      for (let x = 0; x < state.board.width; x++) {
        const c = state.board.cells[y][x];
        if (!c.mine && !c.revealed && !c.flagged) {
          safe = { x, y };
          break outer;
        }
      }
    }
    applyDuelFlag(state, safe);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('revealing a mine ends the turn (and never re-scores as flagged)', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);
    const activeBefore = state.activePlayerIndex;
    const result = applyDuelReveal(state, minePos);
    expect(result.events.some((e) => e.type === 'MINE_REVEALED')).toBe(true);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('revealing a plain numbered safe cell (no cascade) ends the turn', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const numbered = firstSafeNumberedPosition(state, { x: 0, y: 0 });
    const activeBefore = state.activePlayerIndex;
    applyDuelReveal(state, numbered);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('classic variant always passes the turn, even on a correct flag', () => {
    const settings = { ...defaultDuelSettings(), duelVariant: 'classic' as const };
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);
    const activeBefore = state.activePlayerIndex;
    applyDuelFlag(state, minePos);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('re-toggling the same mine flag does not grant a second point (anti-exploit)', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);
    applyDuelFlag(state, minePos); // flag (correct, +1, retains turn)
    applyDuelFlag(state, minePos); // unflag
    applyDuelFlag(state, minePos); // re-flag
    const activeId = state.players[state.activePlayerIndex].id;
    expect(state.stats[activeId].minesDetected).toBe(1);
  });

  it('first to N mines ends the game immediately with that player as winner', () => {
    const settings = { ...defaultDuelSettings(), duelTarget: { type: 'first-to' as const, count: 2 } };
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const activeId = state.players[state.activePlayerIndex].id;
    let flagged = 0;
    for (let y = 0; y < state.board.height && flagged < 2; y++) {
      for (let x = 0; x < state.board.width && flagged < 2; x++) {
        if (state.board.cells[y][x].mine) {
          applyDuelFlag(state, { x, y });
          flagged++;
        }
      }
    }
    expect(state.status).toBe('completed');
    expect(state.winnerId).toBe(activeId);
  });

  it('survival duel eliminates a player at zero lives and eventually ends the game', () => {
    const settings = { ...defaultDuelSettings(), duelVariant: 'survival' as const };
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    // Repeatedly make incorrect flags (each is a mistake -> life lost -> turn passes)
    // until someone is eliminated or the match concludes.
    for (let i = 0; i < 20 && state.status === 'playing'; i++) {
      let safe: { x: number; y: number } | null = null;
      outer: for (let y = 0; y < state.board.height; y++) {
        for (let x = 0; x < state.board.width; x++) {
          const c = state.board.cells[y][x];
          if (!c.mine && !c.revealed && !c.flagged) {
            safe = { x, y };
            break outer;
          }
        }
      }
      if (!safe) break;
      applyDuelFlag(state, safe);
    }
    const anyEliminated = Object.values(state.stats).some((s) => s.eliminated);
    expect(anyEliminated || state.status === 'completed').toBe(true);
  });

  it('timer expiration in pass-turn mode rotates to the next player', () => {
    const settings = defaultDuelSettings();
    const state = createDuelMatch(settings, makePlayers(2), 11);
    const activeBefore = state.activePlayerIndex;
    handleDuelTimerExpired(state);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('sudden-death timer expiration ends the game for the opponent', () => {
    const settings = { ...defaultDuelSettings(), duelTimer: { enabled: true, seconds: 5, behavior: 'sudden-death' as const } };
    const state = createDuelMatch(settings, makePlayers(2), 11);
    const activeId = state.players[state.activePlayerIndex].id;
    handleDuelTimerExpired(state);
    expect(state.status).toBe('completed');
    expect(state.winnerId).not.toBe(activeId);
  });
});

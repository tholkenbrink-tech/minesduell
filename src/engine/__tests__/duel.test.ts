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

  it('streak variant (default): a correct numbered reveal RETAINS the turn', () => {
    const settings = defaultDuelSettings(); // default variant is 'streak'
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const numbered = firstSafeNumberedPosition(state, { x: 0, y: 0 });
    const activeBefore = state.activePlayerIndex;
    applyDuelReveal(state, numbered);
    // A correct move must not pass the turn in streak mode — the player
    // continues until they make a mistake.
    expect(state.activePlayerIndex).toBe(activeBefore);
  });

  it('classic variant: a plain numbered reveal ends the turn', () => {
    const settings = { ...defaultDuelSettings(), duelVariant: 'classic' as const };
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const numbered = firstSafeNumberedPosition(state, { x: 0, y: 0 });
    const activeBefore = state.activePlayerIndex;
    applyDuelReveal(state, numbered);
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('streak variant only passes the turn on a mistake (mine reveal / bad flag)', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const activeBefore = state.activePlayerIndex;
    // Several correct numbered reveals in a row — turn must stay put.
    for (let i = 0; i < 3; i++) {
      const numbered = firstSafeNumberedPosition(state, { x: 0, y: 0 });
      if (state.board.cells[numbered.y][numbered.x].revealed) break;
      applyDuelReveal(state, numbered);
      expect(state.activePlayerIndex).toBe(activeBefore);
    }
    // Now a mistake (reveal a mine) must pass the turn.
    applyDuelReveal(state, firstMinePosition(state));
    expect(state.activePlayerIndex).not.toBe(activeBefore);
  });

  it('turnActionsCount increments per action and resets on turn change (drives timer reset)', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state; // first action of the turn
    expect(state.turnActionsCount).toBe(1);

    // Each correct action within the streak bumps the counter — the UI keys the
    // turn timer off this, so every action resets the countdown.
    const before = state.activePlayerIndex;
    let expected = 1;
    for (let i = 0; i < 2; i++) {
      const numbered = firstSafeNumberedPosition(state, { x: 0, y: 0 });
      applyDuelReveal(state, numbered);
      expected += 1;
      expect(state.turnActionsCount).toBe(expected);
      expect(state.activePlayerIndex).toBe(before); // still same player's turn
    }

    // A mistake ends the turn; the next player starts fresh at 0.
    applyDuelReveal(state, firstMinePosition(state));
    expect(state.activePlayerIndex).not.toBe(before);
    expect(state.turnActionsCount).toBe(0);
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

  it('a revealed mine is committed and cannot be reverted after the turn changes', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 3);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);

    // Player 1 detonates the mine — turn passes to player 2.
    const p1 = state.players[state.activePlayerIndex].id;
    applyDuelReveal(state, minePos);
    expect(state.players[state.activePlayerIndex].id).not.toBe(p1);

    // Player 2 tries to flag and re-reveal the detonated tile — both no-ops.
    applyDuelFlag(state, minePos);
    applyDuelReveal(state, minePos);
    const cell = state.board.cells[minePos.y][minePos.x];
    expect(cell.revealed).toBe(true);
    expect(cell.flagged).toBe(false);
    expect(cell.committed).toBe(true);
    expect(cell.revealedBy).toBe(p1); // attribution never transfers
  });

  it('double-click on a committed (scored) flag is a no-op — no un-flag, no steal', () => {
    const settings = defaultDuelSettings();
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);

    // Player 1 marks the mine correctly — the flag scores and commits.
    const p1 = state.players[state.activePlayerIndex].id;
    applyDuelFlag(state, minePos);
    expect(state.board.cells[minePos.y][minePos.x].committed).toBe(true);

    // Pass the turn to player 2, then double-click the committed tile (the
    // old remove-then-re-mark exploit).
    handleDuelTimerExpired(state);
    const p2 = state.players[state.activePlayerIndex].id;
    expect(p2).not.toBe(p1);
    applyDuelFlag(state, minePos); // "remove"
    applyDuelFlag(state, minePos); // "re-mark"

    const cell = state.board.cells[minePos.y][minePos.x];
    expect(cell.flagged).toBe(true);
    expect(cell.flaggedBy).toBe(p1); // ownership never transfers
    expect(state.stats[p1].minesDetected).toBe(1);
    expect(state.stats[p2].minesDetected).toBe(0);
  });

  it('no-op taps on committed tiles leave turn and action state untouched (classic variant)', () => {
    // Classic normally passes the turn on EVERY action — a no-op on a
    // committed tile must not count as an action or rotate the turn.
    const settings = { ...defaultDuelSettings(), duelVariant: 'classic' as const };
    let state = createDuelMatch(settings, makePlayers(2), 11);
    state = applyDuelReveal(state, { x: 0, y: 0 }).state;
    const minePos = firstMinePosition(state);

    // Player 2 (after classic turn pass) flags the mine — scores and commits,
    // and classic passes the turn back to player 1.
    applyDuelFlag(state, minePos);

    const activeBefore = state.activePlayerIndex;
    const actionsBefore = state.turnActionsCount;
    const statsBefore = structuredClone(state.stats);

    applyDuelFlag(state, minePos); // no-op: committed
    applyDuelReveal(state, minePos); // no-op: flagged + committed

    expect(state.activePlayerIndex).toBe(activeBefore);
    expect(state.turnActionsCount).toBe(actionsBefore);
    expect(state.stats).toEqual(statsBefore);
    expect(state.status).toBe('playing');
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

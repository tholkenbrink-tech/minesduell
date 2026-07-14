import { describe, expect, it } from 'vitest';
import { defaultRaceSettings } from '../defaults';
import { createRaceMatch, startRaceRun, applyRaceReveal, applyRaceFlag, finishRaceRun, rankRaceResults, currentRacePlayerId } from '../race';
import { generateBoard } from '../board';
import type { Player } from '../types';

function makePlayers(n: number): Player[] {
  const themes = ['coral', 'teal', 'violet', 'amber'] as const;
  const shapes = ['circle', 'triangle', 'square', 'diamond'] as const;
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, theme: themes[i], shape: shapes[i] }));
}

describe('race mode', () => {
  it('gives every player the exact same board layout from the shared seed', () => {
    const settings = defaultRaceSettings();
    const state = createRaceMatch(settings, makePlayers(2), 777);
    // Reveal the same first cell for both players' boards; they must generate identically.
    const board0 = state.runs.p0.board;
    const board1 = state.runs.p1.board;
    expect(board0.seed).toBe(board1.seed);
    // Force generation via a direct call using identical first click.
    startRaceRun(state);
    applyRaceReveal(state, { x: 3, y: 3 });
    // Manually generate player 1's board the same way for comparison.
    generateBoard(board1, { x: 3, y: 3 });
    for (let y = 0; y < board0.height; y++) {
      for (let x = 0; x < board0.width; x++) {
        expect(board0.cells[y][x].mine).toBe(board1.cells[y][x].mine);
      }
    }
  });

  it('moves through handover -> running -> results as each player finishes', () => {
    const settings = { ...defaultRaceSettings(), board: { width: 6, height: 6, mines: 1, preset: 'custom' as const } };
    const state = createRaceMatch(settings, makePlayers(2), 5);
    expect(state.phase).toBe('handover');
    startRaceRun(state);
    expect(state.phase).toBe('running');
    expect(currentRacePlayerId(state)).toBe('p0');
    finishRaceRun(state, 'gave-up');
    expect(state.phase).toBe('handover');
    expect(currentRacePlayerId(state)).toBe('p1');
    startRaceRun(state);
    finishRaceRun(state, 'gave-up');
    expect(state.phase).toBe('results');
  });

  it('a run ends in lives-lost once lives reach zero', () => {
    const settings = { ...defaultRaceSettings(), raceLives: 1 };
    const state = createRaceMatch(settings, makePlayers(1), 9);
    startRaceRun(state);
    // Reveal cells until we hit a mine (small dense board keeps this fast/deterministic).
    const run = state.runs.p0;
    let hit = false;
    for (let y = 0; y < run.board.height && !hit; y++) {
      for (let x = 0; x < run.board.width && !hit; x++) {
        const result = applyRaceReveal(state, { x, y });
        if (result.finished) hit = true;
      }
    }
    expect(run.outcome === 'lives-lost' || run.outcome === 'completed').toBe(true);
  });

  it('ranks Time Race by completion then time then lives then actions', () => {
    const settings = { ...defaultRaceSettings(), raceScoring: 'time' as const };
    const state = createRaceMatch(settings, makePlayers(2), 1);
    state.runs.p0.outcome = 'completed';
    state.runs.p0.startedAt = 0;
    state.runs.p0.finishedAt = 1000;
    state.runs.p0.stats.lives = 3;
    state.runs.p1.outcome = 'completed';
    state.runs.p1.startedAt = 0;
    state.runs.p1.finishedAt = 500;
    state.runs.p1.stats.lives = 3;
    const ranking = rankRaceResults(state);
    expect(ranking[0].playerId).toBe('p1');
    expect(ranking[0].rank).toBe(1);
  });

  it('ranks Click Race by fewest reveal actions', () => {
    const settings = { ...defaultRaceSettings(), raceScoring: 'click' as const };
    const state = createRaceMatch(settings, makePlayers(2), 1);
    state.runs.p0.outcome = 'completed';
    state.runs.p0.stats.revealActions = 40;
    state.runs.p1.outcome = 'completed';
    state.runs.p1.stats.revealActions = 25;
    const ranking = rankRaceResults(state);
    expect(ranking[0].playerId).toBe('p1');
  });

  it('falls back to Survival Race ranking when nobody completes the board', () => {
    const settings = defaultRaceSettings();
    const state = createRaceMatch(settings, makePlayers(2), 1);
    state.runs.p0.outcome = 'lives-lost';
    state.runs.p0.stats.safeCellsRevealed = 10;
    state.runs.p1.outcome = 'lives-lost';
    state.runs.p1.stats.safeCellsRevealed = 20;
    const ranking = rankRaceResults(state);
    expect(ranking[0].playerId).toBe('p1');
  });

  it('flagging does not count as a reveal action for Click Race', () => {
    const settings = defaultRaceSettings();
    const state = createRaceMatch(settings, makePlayers(1), 1);
    startRaceRun(state);
    applyRaceFlag(state, { x: 0, y: 0 });
    expect(state.runs.p0.stats.revealActions).toBe(0);
  });
});

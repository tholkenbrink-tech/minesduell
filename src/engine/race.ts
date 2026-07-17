import type { Board, GameEvent, GameSettings, Player, PlayerStats, Position } from './types';
import { createPlayerStats } from './types';
import { createEmptyBoard, areAllMinesResolved, isBoardFullyRevealed, isBoardCleared } from './board';
import { revealCell, toggleFlag } from './reveal';

export type RaceRunOutcome = 'completed' | 'lives-lost' | 'timeout' | 'gave-up' | null;

export interface RaceRun {
  board: Board;
  stats: PlayerStats;
  startedAt: number | null;
  finishedAt: number | null;
  outcome: RaceRunOutcome;
}

export type RacePhase = 'handover' | 'running' | 'results';

export interface RaceState {
  mode: 'race';
  settings: GameSettings;
  players: Player[];
  seed: number;
  runs: Record<string, RaceRun>;
  order: string[];
  currentIndex: number;
  phase: RacePhase;
  log: GameEvent[];
}

export function createRaceMatch(settings: GameSettings, players: Player[], seed: number): RaceState {
  const runs: Record<string, RaceRun> = {};
  for (const p of players) {
    runs[p.id] = {
      board: createEmptyBoard(settings.board.width, settings.board.height, settings.board.mines, seed),
      stats: createPlayerStats(p.id, settings.raceLives),
      startedAt: null,
      finishedAt: null,
      outcome: null,
    };
  }
  return {
    mode: 'race',
    settings,
    players,
    seed,
    runs,
    order: players.map((p) => p.id),
    currentIndex: 0,
    phase: 'handover',
    log: [],
  };
}

export function currentRacePlayerId(state: RaceState): string {
  return state.order[state.currentIndex];
}

export function startRaceRun(state: RaceState): RaceState {
  const playerId = currentRacePlayerId(state);
  const run = state.runs[playerId];
  run.startedAt = Date.now();
  state.phase = 'running';
  return state;
}

function checkRaceCompletion(board: Board, rule: GameSettings['raceCompletionRule']): boolean {
  // A fully-uncovered board (nothing left plain-hidden) always ends the run,
  // regardless of rule — this is what "the board is uncovered" means and it
  // rescues the game if a safe tile was flagged by mistake.
  if (isBoardCleared(board)) return true;
  return rule === 'flag-all-mines' ? areAllMinesResolved(board) : isBoardFullyRevealed(board);
}

export function finishRaceRun(state: RaceState, outcome: Exclude<RaceRunOutcome, null>): RaceState {
  const playerId = currentRacePlayerId(state);
  const run = state.runs[playerId];
  run.finishedAt = Date.now();
  run.outcome = outcome;
  state.log.push({ type: 'GAME_COMPLETED', playerId, data: { outcome } });

  if (state.currentIndex >= state.order.length - 1) {
    state.phase = 'results';
  } else {
    state.currentIndex += 1;
    state.phase = 'handover';
  }
  return state;
}

export interface RaceActionResult {
  state: RaceState;
  events: GameEvent[];
  finished: boolean;
}

export function applyRaceReveal(state: RaceState, pos: Position): RaceActionResult {
  const events: GameEvent[] = [];
  if (state.phase !== 'running') return { state, events, finished: false };
  const playerId = currentRacePlayerId(state);
  const run = state.runs[playerId];

  const result = revealCell(run.board, pos, playerId);
  events.push(...result.events);
  run.stats.revealActions += 1;

  if (result.hitMine) {
    run.stats.minesTriggered += 1;
    run.stats.lives -= 1;
    events.push({ type: 'LIFE_LOST', playerId, data: { livesRemaining: run.stats.lives } });
    if (run.stats.lives <= 0) {
      run.stats.eliminated = true;
      events.push({ type: 'PLAYER_ELIMINATED', playerId });
      state.log.push(...events);
      finishRaceRun(state, 'lives-lost');
      return { state, events, finished: true };
    }
  } else {
    run.stats.safeCellsRevealed += result.newlyRevealedSafe.length;
  }

  if (checkRaceCompletion(run.board, state.settings.raceCompletionRule)) {
    state.log.push(...events);
    finishRaceRun(state, 'completed');
    return { state, events, finished: true };
  }

  state.log.push(...events);
  return { state, events, finished: false };
}

export function applyRaceFlag(state: RaceState, pos: Position): RaceActionResult {
  const events: GameEvent[] = [];
  if (state.phase !== 'running') return { state, events, finished: false };
  const playerId = currentRacePlayerId(state);
  const run = state.runs[playerId];

  const result = toggleFlag(run.board, pos, playerId);
  events.push(...result.events);

  if (result.correct === true) {
    run.stats.minesDetected += 1;
  } else if (result.correct === false) {
    // A wrongly-flagged safe tile is a mistake — it costs a life, same as an
    // incorrect reveal.
    run.stats.incorrectFlags += 1;
    run.stats.lives -= 1;
    events.push({ type: 'LIFE_LOST', playerId, data: { livesRemaining: run.stats.lives } });
    if (run.stats.lives <= 0) {
      run.stats.eliminated = true;
      events.push({ type: 'PLAYER_ELIMINATED', playerId });
      state.log.push(...events);
      finishRaceRun(state, 'lives-lost');
      return { state, events, finished: true };
    }
  }

  if (checkRaceCompletion(run.board, state.settings.raceCompletionRule)) {
    state.log.push(...events);
    finishRaceRun(state, 'completed');
    return { state, events, finished: true };
  }

  state.log.push(...events);
  return { state, events, finished: false };
}

export interface RaceRanking {
  playerId: string;
  rank: number;
  completed: boolean;
  timeMs: number | null;
  revealActions: number;
  minesDetected: number;
  livesRemaining: number;
  safeCellsRevealed: number;
}

/** Ranks all finished race runs according to the configured scoring variant. */
export function rankRaceResults(state: RaceState): RaceRanking[] {
  const anyCompleted = state.players.some((p) => state.runs[p.id].outcome === 'completed');

  const entries = state.players.map((p) => {
    const run = state.runs[p.id];
    const timeMs = run.startedAt != null && run.finishedAt != null ? run.finishedAt - run.startedAt : null;
    return {
      playerId: p.id,
      completed: run.outcome === 'completed',
      timeMs,
      revealActions: run.stats.revealActions,
      minesDetected: run.stats.minesDetected,
      livesRemaining: Math.max(run.stats.lives, 0),
      safeCellsRevealed: run.stats.safeCellsRevealed,
    };
  });

  const comparator = (a: (typeof entries)[number], b: (typeof entries)[number]) => {
    if (!anyCompleted) {
      // Survival Race fallback ranking.
      if (b.safeCellsRevealed !== a.safeCellsRevealed) return b.safeCellsRevealed - a.safeCellsRevealed;
      if (b.minesDetected !== a.minesDetected) return b.minesDetected - a.minesDetected;
      if (b.livesRemaining !== a.livesRemaining) return b.livesRemaining - a.livesRemaining;
      return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity);
    }
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    if (state.settings.raceScoring === 'click') {
      if (a.revealActions !== b.revealActions) return a.revealActions - b.revealActions;
      if (b.livesRemaining !== a.livesRemaining) return b.livesRemaining - a.livesRemaining;
      return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity);
    }
    // Time Race (default)
    if ((a.timeMs ?? Infinity) !== (b.timeMs ?? Infinity)) return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity);
    if (b.livesRemaining !== a.livesRemaining) return b.livesRemaining - a.livesRemaining;
    return a.revealActions - b.revealActions;
  };

  const sorted = [...entries].sort(comparator);
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

export { checkRaceCompletion };

import type { Board, GameEvent, GameSettings, Player, PlayerStats, Position } from './types';
import { createPlayerStats } from './types';
import { createEmptyBoard, isBoardFullyRevealed, isBoardCleared } from './board';
import { revealCell, toggleFlag } from './reveal';

/** The board is done when all safe cells are revealed, or nothing is left hidden. */
function boardComplete(board: Board): boolean {
  return isBoardFullyRevealed(board) || isBoardCleared(board);
}

export interface DuelState {
  mode: 'duel';
  settings: GameSettings;
  board: Board;
  players: Player[];
  stats: Record<string, PlayerStats>;
  activePlayerIndex: number;
  turnActionsCount: number;
  turnStartedAt: number;
  scoredMinePositions: Set<string>;
  eliminationOrder: string[];
  status: 'playing' | 'completed';
  winnerId: string | null;
  log: GameEvent[];
}

/**
 * Whether a mistake (mine reveal / incorrect flag) has any effect on the turn
 * or life count at all. True for streak always; for turn only when the
 * "change turn on mistake" toggle is on. When false (turn mode, toggle off),
 * mistakes are inert — the player always gets their full click allowance and
 * this mode has no lives.
 */
export function duelMistakesMatter(settings: GameSettings): boolean {
  return settings.duelVariant === 'streak' || (settings.duelVariant === 'turn' && settings.duelTurnChangeOnMistake);
}

/** Whether this match tracks a finite life/mistake budget (vs. unlimited mistakes). */
export function duelHasLives(settings: GameSettings): boolean {
  return duelMistakesMatter(settings) && settings.duelMistakeLimit.mode === 'limited';
}

export function createDuelMatch(settings: GameSettings, players: Player[], seed: number): DuelState {
  const board = createEmptyBoard(settings.board.width, settings.board.height, settings.board.mines, seed);
  const lives = duelHasLives(settings) ? settings.duelMistakeLimit.count : Infinity;
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = createPlayerStats(p.id, lives);
  return {
    mode: 'duel',
    settings,
    board,
    players,
    stats,
    activePlayerIndex: 0,
    turnActionsCount: 0,
    turnStartedAt: Date.now(),
    scoredMinePositions: new Set(),
    eliminationOrder: [],
    status: 'playing',
    winnerId: null,
    log: [],
  };
}

export function duelTargetCount(state: DuelState): number {
  const { duelTarget, board } = state.settings;
  if (duelTarget.type === 'first-to') return duelTarget.count ?? 10;
  if (duelTarget.type === 'majority') return Math.floor(board.mines / 2) + 1;
  return board.mines; // complete-board: informational only
}

function activePlayer(state: DuelState): Player {
  return state.players[state.activePlayerIndex];
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

/** Clean clicks: tiles a player clicked to reveal, excluding mistaken (mine) reveals. */
function cleanClicks(stats: PlayerStats): number {
  return stats.revealActions - stats.minesTriggered;
}

/**
 * Ranks players for both normal and tied outcomes with a single ordered
 * comparator: defused bombs, then lives, then clean (mistake-free) clicks.
 */
export function compareDuelPlayers(state: DuelState, a: Player, b: Player): number {
  const sa = state.stats[a.id];
  const sb = state.stats[b.id];
  if (sb.minesDetected !== sa.minesDetected) return sb.minesDetected - sa.minesDetected;
  if (sb.lives !== sa.lives) return sb.lives - sa.lives;
  return cleanClicks(sb) - cleanClicks(sa);
}

/** Determines the winner among remaining (non-eliminated) players by score tie-break. */
function rankPlayers(state: DuelState): Player[] {
  return [...state.players].sort((a, b) => compareDuelPlayers(state, a, b));
}

function finishGame(state: DuelState, events: GameEvent[]): void {
  const ranked = rankPlayers(state);
  state.status = 'completed';
  state.winnerId = ranked[0]?.id ?? null;
  events.push({ type: 'GAME_COMPLETED', playerId: state.winnerId ?? undefined });
}

function nextAlivePlayerIndex(state: DuelState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.stats[state.players[idx].id].eliminated) return idx;
  }
  return from;
}

function endTurn(state: DuelState, events: GameEvent[]): void {
  const player = activePlayer(state);
  state.stats[player.id].turnDurationsMs.push(Date.now() - state.turnStartedAt);
  const alive = state.players.filter((p) => !state.stats[p.id].eliminated);
  // Only a finite mistake limit ever eliminates a player, so this only fires
  // when that's in play — the sole survivor wins outright, no tie-break needed.
  if (alive.length <= 1) {
    state.status = 'completed';
    state.winnerId = alive[0]?.id ?? null;
    events.push({ type: 'GAME_COMPLETED', playerId: state.winnerId ?? undefined });
    return;
  }
  state.activePlayerIndex = nextAlivePlayerIndex(state, state.activePlayerIndex);
  state.turnActionsCount = 0;
  state.turnStartedAt = Date.now();
  events.push({ type: 'TURN_ENDED', playerId: player.id });
}

/** Decrements a life when this match has a finite budget; no-op otherwise (unlimited mistakes). */
function decrementLife(state: DuelState, playerId: string, events: GameEvent[]): void {
  const s = state.stats[playerId];
  if (s.lives === Infinity) return;
  s.lives -= 1;
  events.push({ type: 'LIFE_LOST', playerId, data: { livesRemaining: s.lives } });
  if (s.lives <= 0 && !s.eliminated) {
    s.eliminated = true;
    state.eliminationOrder.push(playerId);
    events.push({ type: 'PLAYER_ELIMINATED', playerId });
  }
}

export interface DuelActionResult {
  state: DuelState;
  events: GameEvent[];
}

export function applyDuelReveal(state: DuelState, pos: Position): DuelActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  const player = activePlayer(state);
  const stats = state.stats[player.id];

  const result = revealCell(state.board, pos, player.id);
  // A tap that changed nothing (already-revealed, flagged, or committed tile)
  // must be a complete no-op: no action consumed, no turn/streak effects.
  if (result.events.length === 0) return { state, events };
  events.push(...result.events);
  state.turnActionsCount += 1;
  stats.revealActions += 1;

  let turnEnds = false;
  const mistakesMatter = duelMistakesMatter(state.settings);

  if (result.hitMine) {
    // A detonated mine is final — commit the tile so it can never be
    // un-revealed or re-marked by a later player.
    state.board.cells[pos.y][pos.x].committed = true;
    stats.minesTriggered += 1;
    stats.currentStreak = 0;
    // Hitting a mine is a mistake. In streak, and in turn mode with "change
    // turn on mistake" on, it always ends the turn (and costs a life when a
    // mistake limit is configured). Otherwise it's inert — see duelMistakesMatter.
    if (mistakesMatter) {
      turnEnds = true;
      decrementLife(state, player.id, events);
    }
  } else if (result.newlyRevealedSafe.length > 0) {
    // A correct reveal. The active player keeps their turn on every correct
    // move and only loses it on a mistake. The turn is NOT passed here.
    stats.safeCellsRevealed += result.newlyRevealedSafe.length;
  }

  if (
    state.settings.duelMaxActionsPerTurn > 0 &&
    state.turnActionsCount >= state.settings.duelMaxActionsPerTurn
  ) {
    turnEnds = true;
  }

  if (boardComplete(state.board)) {
    finishGame(state, events);
    state.log.push(...events);
    return { state, events };
  }

  if (turnEnds && state.status === 'playing') endTurn(state, events);

  state.log.push(...events);
  return { state, events };
}

export function applyDuelFlag(state: DuelState, pos: Position): DuelActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  const player = activePlayer(state);
  const stats = state.stats[player.id];
  const key = posKey(pos);

  const result = toggleFlag(state.board, pos, player.id);
  // A tap that changed nothing (revealed or committed tile) must be a complete
  // no-op: no action consumed, no turn/streak effects.
  if (result.events.length === 0) return { state, events };
  events.push(...result.events);
  state.turnActionsCount += 1;

  let turnEnds = false;
  const mistakesMatter = duelMistakesMatter(state.settings);

  if (result.correct === true) {
    // A correct flag is final the moment it scores — commit the tile so no
    // player (including a later opponent) can un-flag or re-mark it.
    state.board.cells[pos.y][pos.x].committed = true;
    if (!state.scoredMinePositions.has(key)) {
      stats.minesDetected += 1;
      stats.currentStreak += 1;
      stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
      state.scoredMinePositions.add(key);
    }
    // Correct flag retains the turn, and cannot be farmed by re-toggling:
    // only counted once via scoredMinePositions above.
  } else if (result.correct === false) {
    // Flagging a safe tile is a mistake — breaks the streak, and (when
    // mistakes matter for this variant/config) ends the turn and costs a life.
    stats.incorrectFlags += 1;
    stats.currentStreak = 0;
    if (mistakesMatter) {
      turnEnds = true;
      decrementLife(state, player.id, events);
    }
  }
  // result.correct === null means a flag was removed; no scoring change, turn continues.

  if (
    state.settings.duelMaxActionsPerTurn > 0 &&
    state.turnActionsCount >= state.settings.duelMaxActionsPerTurn
  ) {
    turnEnds = true;
  }

  const targetCount = duelTargetCount(state);
  if (state.settings.duelTarget.type !== 'complete-board' && stats.minesDetected >= targetCount) {
    state.status = 'completed';
    state.winnerId = player.id;
    events.push({ type: 'GAME_COMPLETED', playerId: player.id });
    state.log.push(...events);
    return { state, events };
  }

  if (boardComplete(state.board)) {
    finishGame(state, events);
    state.log.push(...events);
    return { state, events };
  }

  if (turnEnds && state.status === 'playing') endTurn(state, events);

  state.log.push(...events);
  return { state, events };
}

export function handleDuelTimerExpired(state: DuelState): DuelActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  const player = activePlayer(state);
  events.push({ type: 'TIMER_EXPIRED', playerId: player.id });

  const behavior = state.settings.duelTimer.behavior;
  if (behavior === 'sudden-death') {
    const others = state.players.filter((p) => p.id !== player.id);
    state.status = 'completed';
    state.winnerId = others[0]?.id ?? null;
    events.push({ type: 'GAME_COMPLETED', playerId: state.winnerId ?? undefined });
  } else if (behavior === 'elimination') {
    decrementLife(state, player.id, events);
    if (state.status === 'playing') endTurn(state, events);
  } else {
    endTurn(state, events);
  }

  state.log.push(...events);
  return { state, events };
}

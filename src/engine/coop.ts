import type { Board, GameEvent, GameSettings, Player, PlayerStats, Position } from './types';
import { createPlayerStats } from './types';
import { createEmptyBoard, isBoardFullyRevealed, isBoardCleared } from './board';
import { revealCell, toggleFlag } from './reveal';
import { hashSeed, mulberry32, type Rng } from './rng';

export type CoopRewardType = 'extra-life' | 'peek';

export interface CoopReward {
  type: CoopRewardType;
  playerId: string;
  earnedAt: number; // team score at time of earning
}

export interface CoopEndlessStats {
  boardsCleared: number;
  totalMinesDetected: number;
  totalSafeRevealed: number;
  longestStreak: number;
  milestoneReached: boolean;
}

export interface CoopState {
  mode: 'coop';
  settings: GameSettings;
  board: Board;
  players: Player[];
  stats: Record<string, PlayerStats>;
  activePlayerIndex: number;
  turnActionsCount: number;
  /** Correctly-flagged mines by the active player this turn; the round ends after 5. */
  turnMarkedBombs: number;
  teamScore: number;
  streakCount: number;
  longestStreak: number;
  rewards: CoopReward[];
  pendingPeek: { playerId: string; position: Position; safe: boolean } | null;
  status: 'playing' | 'won' | 'lost';
  endless: CoopEndlessStats;
  boardSeed: number;
  rng: Rng;
  log: GameEvent[];
}

const SAFE_REVEAL_POINTS = 1;
const MINE_DETECT_POINTS = 10;
const STREAK_REWARD_THRESHOLD = 3;
const RANDOM_DROP_CHANCE = 0.04;
/** A co-op player's round ends after marking this many bombs (or on a mistake, whichever comes first). */
const COOP_MARKED_BOMBS_PER_TURN = 5;

export function createCoopMatch(settings: GameSettings, players: Player[], seed: number): CoopState {
  const board = createEmptyBoard(settings.board.width, settings.board.height, settings.board.mines, seed);
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = createPlayerStats(p.id, settings.coopLives);
  return {
    mode: 'coop',
    settings,
    board,
    players,
    stats,
    activePlayerIndex: 0,
    turnActionsCount: 0,
    turnMarkedBombs: 0,
    teamScore: 0,
    streakCount: 0,
    longestStreak: 0,
    rewards: [],
    pendingPeek: null,
    status: 'playing',
    endless: { boardsCleared: 0, totalMinesDetected: 0, totalSafeRevealed: 0, longestStreak: 0, milestoneReached: false },
    boardSeed: seed,
    rng: mulberry32(seed ^ hashSeed('coop-rewards')),
    log: [],
  };
}

function alivePlayers(state: CoopState): Player[] {
  return state.players.filter((p) => !state.stats[p.id].eliminated);
}

function nextAlivePlayerIndex(state: CoopState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.stats[state.players[idx].id].eliminated) return idx;
  }
  return from;
}

function activePlayer(state: CoopState): Player {
  return state.players[state.activePlayerIndex];
}

function checkTeamTarget(state: CoopState): boolean {
  const target = state.settings.coopTarget;
  if (target.type === 'mine-count') {
    const detected = Object.values(state.stats).reduce((sum, s) => sum + s.minesDetected, 0);
    return detected >= (target.count ?? state.board.mineCount);
  }
  if (target.type === 'score') {
    return state.teamScore >= (target.count ?? 1000);
  }
  // complete-board: all safe cells revealed, or the board fully uncovered
  // (nothing plain-hidden left — rescues a mis-flagged safe tile).
  return isBoardFullyRevealed(state.board) || isBoardCleared(state.board);
}

function awardReward(state: CoopState, events: GameEvent[]): void {
  const player = activePlayer(state);
  const { extraLife, peek, randomDrop } = state.settings.coopRewards;
  const available: CoopRewardType[] = [];
  if (extraLife) available.push('extra-life');
  if (peek) available.push('peek');
  if (available.length === 0) return;

  const chosen = available[state.rewards.length % available.length];
  grantReward(state, chosen, player.id, events);
  void randomDrop;
}

function grantReward(state: CoopState, type: CoopRewardType, playerId: string, events: GameEvent[]): void {
  state.rewards.push({ type, playerId, earnedAt: state.teamScore });
  events.push({ type: 'REWARD_EARNED', playerId, data: { rewardType: type } });

  if (type === 'extra-life') {
    const candidates = alivePlayers(state).sort((a, b) => state.stats[a.id].lives - state.stats[b.id].lives);
    const target = state.stats[playerId].lives < state.settings.coopLifeCap ? playerId : candidates[0]?.id;
    if (target && state.stats[target].lives < state.settings.coopLifeCap) {
      state.stats[target].lives += 1;
      events.push({ type: 'LIFE_LOST', playerId: target, data: { livesRemaining: state.stats[target].lives, gained: true } });
    }
  } else if (type === 'peek') {
    state.pendingPeek = { playerId, position: { x: -1, y: -1 }, safe: false };
  }
}

/** Resolves a pending Peek reward by inspecting (not revealing) a hidden cell. */
export function resolvePeek(state: CoopState, pos: Position): CoopState {
  if (!state.pendingPeek) return state;
  const cell = state.board.cells[pos.y]?.[pos.x];
  if (!cell || cell.revealed || cell.flagged) return state;
  state.pendingPeek = { ...state.pendingPeek, position: pos, safe: !cell.mine };
  return state;
}

export function clearPeek(state: CoopState): CoopState {
  state.pendingPeek = null;
  return state;
}

function loseLife(state: CoopState, playerId: string, events: GameEvent[]): void {
  const s = state.stats[playerId];
  s.lives -= 1;
  events.push({ type: 'LIFE_LOST', playerId, data: { livesRemaining: s.lives } });
  if (s.lives <= 0 && !s.eliminated) {
    s.eliminated = true;
    events.push({ type: 'PLAYER_ELIMINATED', playerId });
  }
}

function endTurn(state: CoopState, events: GameEvent[]): void {
  if (alivePlayers(state).length === 0) {
    state.status = 'lost';
    events.push({ type: 'GAME_COMPLETED', data: { outcome: 'team-eliminated' } });
    return;
  }
  state.activePlayerIndex = nextAlivePlayerIndex(state, state.activePlayerIndex);
  state.turnActionsCount = 0;
  state.turnMarkedBombs = 0;
}

function maybeGenerateNextEndlessBoard(state: CoopState, events: GameEvent[]): void {
  if (!state.settings.coopEndless) return;
  const milestone = state.settings.coopEndlessMilestone;
  if (state.endless.totalMinesDetected >= milestone) {
    state.endless.milestoneReached = true;
    if (!state.settings.coopEndlessContinueAfterMilestone) {
      state.status = 'won';
      events.push({ type: 'GAME_COMPLETED', data: { outcome: 'endless-milestone' } });
      return;
    }
  }
  // Advance to the next, slightly harder board.
  state.endless.boardsCleared += 1;
  const nextSeed = state.boardSeed + state.endless.boardsCleared;
  const growth = Math.min(state.endless.boardsCleared, 10);
  const width = Math.min(50, state.settings.board.width + Math.floor(growth / 2));
  const height = Math.min(50, state.settings.board.height + Math.floor(growth / 2));
  const density = Math.min(0.24, state.settings.board.mines / (state.settings.board.width * state.settings.board.height) + growth * 0.004);
  const mines = Math.max(state.settings.board.mines, Math.floor(width * height * density));
  state.boardSeed = nextSeed;
  state.board = createEmptyBoard(width, height, mines, nextSeed);
}

export interface CoopActionResult {
  state: CoopState;
  events: GameEvent[];
}

function finalizeAction(state: CoopState, events: GameEvent[], mistake: boolean, correctMineFlag: boolean): void {
  state.turnActionsCount += 1;
  if (correctMineFlag) state.turnMarkedBombs += 1;

  if (correctMineFlag) {
    state.streakCount += 1;
    state.longestStreak = Math.max(state.longestStreak, state.streakCount);
    state.endless.longestStreak = Math.max(state.endless.longestStreak, state.streakCount);
    if (state.streakCount > 0 && state.streakCount % STREAK_REWARD_THRESHOLD === 0) {
      awardReward(state, events);
    }
  } else {
    state.streakCount = 0;
  }

  if (!mistake && state.settings.coopRewards.randomDrop && state.rng() < RANDOM_DROP_CHANCE) {
    awardReward(state, events);
  }

  if (checkTeamTarget(state)) {
    if (isBoardFullyRevealed(state.board) && state.settings.coopEndless) {
      maybeGenerateNextEndlessBoard(state, events);
      if (state.status !== 'playing') {
        state.log.push(...events);
        return;
      }
    } else {
      state.status = 'won';
      events.push({ type: 'GAME_COMPLETED', data: { outcome: 'team-won' } });
      state.log.push(...events);
      return;
    }
  }

  // The round ends on a mistake, or once the current player has marked their
  // full allowance of bombs — not on a raw action count.
  if (state.status === 'playing') {
    const rotate = mistake || state.turnMarkedBombs >= COOP_MARKED_BOMBS_PER_TURN;
    if (rotate) endTurn(state, events);
  }
  state.log.push(...events);
}

export function applyCoopReveal(state: CoopState, pos: Position): CoopActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  const player = activePlayer(state);
  const stats = state.stats[player.id];

  const result = revealCell(state.board, pos, player.id);
  events.push(...result.events);

  let mistake = false;
  if (result.hitMine) {
    stats.minesTriggered += 1;
    mistake = true;
    loseLife(state, player.id, events);
  } else {
    stats.safeCellsRevealed += result.newlyRevealedSafe.length;
    state.teamScore += result.newlyRevealedSafe.length * SAFE_REVEAL_POINTS;
    state.endless.totalSafeRevealed += result.newlyRevealedSafe.length;
  }

  finalizeAction(state, events, mistake, false);
  return { state, events };
}

export function applyCoopFlag(state: CoopState, pos: Position): CoopActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  const player = activePlayer(state);
  const stats = state.stats[player.id];

  const result = toggleFlag(state.board, pos, player.id);
  events.push(...result.events);

  let mistake = false;
  let correctMineFlag = false;
  if (result.correct === true) {
    stats.minesDetected += 1;
    state.teamScore += MINE_DETECT_POINTS;
    state.endless.totalMinesDetected += 1;
    correctMineFlag = true;
  } else if (result.correct === false) {
    stats.incorrectFlags += 1;
    mistake = true;
    loseLife(state, player.id, events);
  }

  finalizeAction(state, events, mistake, correctMineFlag);
  return { state, events };
}

export function handleCoopTeamTimerExpired(state: CoopState): CoopActionResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return { state, events };
  state.status = 'lost';
  events.push({ type: 'TIMER_EXPIRED' }, { type: 'GAME_COMPLETED', data: { outcome: 'team-timeout' } });
  state.log.push(...events);
  return { state, events };
}

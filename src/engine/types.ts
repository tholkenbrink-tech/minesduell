// Core Minesweeper + MinesDuell domain types.
// This module has zero dependency on React and defines the shared vocabulary
// for the board engine and the three game modes (duel / race / coop).

export type GameMode = 'duel' | 'race' | 'coop';

export type ActionMode = 'reveal' | 'flag';

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  /** Number of mines in the 8 surrounding cells. -1 while unknown pre-generation is never used; always computed. */
  adjacent: number;
  /** playerId that revealed this cell (for territory stats / ownership display) */
  revealedBy?: string;
  /** playerId that correctly flagged this mine */
  flaggedBy?: string;
}

export interface Board {
  width: number;
  height: number;
  mineCount: number;
  seed: number;
  cells: Cell[][];
  /** true once the first reveal has happened and mines have been placed */
  generated: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export type DifficultyPreset = 'easy' | 'medium' | 'hard' | 'extreme' | 'custom';

export interface BoardConfig {
  width: number;
  height: number;
  mines: number;
  preset: DifficultyPreset;
}

export const DIFFICULTY_PRESETS: Record<Exclude<DifficultyPreset, 'custom'>, BoardConfig> = {
  easy: { width: 9, height: 9, mines: 10, preset: 'easy' },
  medium: { width: 12, height: 16, mines: 30, preset: 'medium' },
  hard: { width: 16, height: 22, mines: 60, preset: 'hard' },
  extreme: { width: 20, height: 30, mines: 130, preset: 'extreme' },
};

export type PlayerTheme =
  | 'coral'
  | 'teal'
  | 'violet'
  | 'amber';

export const PLAYER_THEMES: PlayerTheme[] = ['coral', 'teal', 'violet', 'amber'];
export const PLAYER_SHAPES = ['circle', 'triangle', 'square', 'diamond'] as const;
export type PlayerShape = (typeof PLAYER_SHAPES)[number];

export interface Player {
  id: string;
  name: string;
  icon?: string;
  theme: PlayerTheme;
  shape: PlayerShape;
}

// Three explicit device arrangements. Legacy 'auto' was removed — see
// migrateArrangement() in engine/arrangement.ts for how saved values migrate.
export type DeviceArrangement = 'side-by-side' | 'face-to-face' | 'table';

export type DuelVariant = 'classic' | 'streak' | 'survival';
export type DuelTargetType = 'first-to' | 'majority' | 'complete-board';

export interface DuelTarget {
  type: DuelTargetType;
  count?: number; // used for 'first-to'
}

export type TimerBehavior = 'pass-turn' | 'elimination' | 'sudden-death';

export interface TimerConfig {
  enabled: boolean;
  seconds: number; // 0 = no timer
  behavior: TimerBehavior;
}

export type RaceScoring = 'time' | 'click' | 'survival';
export type RaceCompletionRule = 'reveal-all-safe' | 'flag-all-mines';

export interface GameSettings {
  mode: GameMode;
  board: BoardConfig;
  arrangement: DeviceArrangement;
  firstRevealSafe: boolean;
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  tileSize: 'compact' | 'comfortable' | 'large';
  textSize: 'normal' | 'large';
  confirmDangerousReveal: boolean;
  leftHanded: boolean;

  // Duel-specific
  duelVariant: DuelVariant;
  duelTarget: DuelTarget;
  duelTimer: TimerConfig;
  duelMaxActionsPerTurn: number; // 0 = unlimited

  // Race-specific
  raceLives: number;
  raceScoring: RaceScoring;
  raceCompletionRule: RaceCompletionRule;
  raceFlagCostsLife: boolean;
  raceMaxSeconds: number; // 0 = unlimited

  // Co-op specific
  coopLives: number;
  coopLifeCap: number;
  coopTarget: { type: 'complete-board' | 'mine-count' | 'score'; count?: number };
  coopRewards: { extraLife: boolean; peek: boolean; randomDrop: boolean };
  coopEndless: boolean;
  coopEndlessMilestone: number;
  coopEndlessContinueAfterMilestone: boolean;
  coopTeamTimerSeconds: number; // 0 = disabled
}

export type GameEventType =
  | 'SAFE_CELL_REVEALED'
  | 'ZERO_REGION_EXPANDED'
  | 'MINE_REVEALED'
  | 'MINE_CORRECTLY_FLAGGED'
  | 'SAFE_CELL_INCORRECTLY_FLAGGED'
  | 'FLAG_REMOVED'
  | 'TURN_ENDED'
  | 'TURN_CONTINUED'
  | 'LIFE_LOST'
  | 'PLAYER_ELIMINATED'
  | 'REWARD_EARNED'
  | 'GAME_COMPLETED'
  | 'TIMER_EXPIRED';

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  position?: Position;
  message?: string;
  data?: Record<string, unknown>;
}

export interface PlayerStats {
  playerId: string;
  minesDetected: number;
  incorrectFlags: number;
  minesTriggered: number;
  safeCellsRevealed: number;
  revealActions: number;
  longestStreak: number;
  currentStreak: number;
  lives: number;
  eliminated: boolean;
  turnDurationsMs: number[];
}

export function createPlayerStats(playerId: string, lives: number): PlayerStats {
  return {
    playerId,
    minesDetected: 0,
    incorrectFlags: 0,
    minesTriggered: 0,
    safeCellsRevealed: 0,
    revealActions: 0,
    longestStreak: 0,
    currentStreak: 0,
    lives,
    eliminated: false,
    turnDurationsMs: [],
  };
}

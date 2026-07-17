import type { GameMode, GameSettings } from './types';

/** Human-readable name for a mode, used in headings/labels. */
export function modeDisplayName(mode: GameMode): string {
  if (mode === 'race') return 'Race';
  if (mode === 'coop') return 'Co-op Survival';
  return 'Duell';
}

/** Default click/interaction budget for a fresh Turn-mode match. */
export const DEFAULT_DUEL_TURN_CLICK_LIMIT = 10;
/** Default total-mistakes budget when a player first switches mistake limiting on. */
export const DEFAULT_DUEL_MISTAKE_LIMIT_COUNT = 3;

const shared = {
  firstRevealSafe: true,
  sound: false,
  haptics: false,
  reducedMotion: false,
  highContrast: false,
  tileSize: 'comfortable' as const,
  textSize: 'normal' as const,
  confirmDangerousReveal: false,
  leftHanded: false,
};

export function defaultDuelSettings(): GameSettings {
  return {
    mode: 'duel',
    board: { width: 12, height: 16, mines: 30, preset: 'medium' },
    arrangement: 'side-by-side',
    ...shared,
    duelVariant: 'streak',
    duelTarget: { type: 'complete-board' },
    duelTimer: { enabled: false, seconds: 15, behavior: 'pass-turn' },
    duelMaxActionsPerTurn: 0,
    duelTurnChangeOnMistake: true,
    duelMistakeLimit: { mode: 'unlimited', count: DEFAULT_DUEL_MISTAKE_LIMIT_COUNT },
    raceLives: 3,
    raceScoring: 'time',
    raceCompletionRule: 'reveal-all-safe',
    raceFlagCostsLife: false,
    raceMaxSeconds: 0,
    coopLives: 3,
    coopLifeCap: 5,
    coopTarget: { type: 'complete-board' },
    coopRewards: { extraLife: true, peek: true, randomDrop: false },
    coopEndless: false,
    coopEndlessMilestone: 50,
    coopEndlessContinueAfterMilestone: true,
    coopTeamTimerSeconds: 0,
  };
}

export function defaultRaceSettings(): GameSettings {
  return {
    ...defaultDuelSettings(),
    mode: 'race',
    board: { width: 12, height: 16, mines: 30, preset: 'medium' },
    raceLives: 3,
    raceScoring: 'time',
    raceCompletionRule: 'reveal-all-safe',
    raceFlagCostsLife: false,
    raceMaxSeconds: 0,
  };
}

export function defaultCoopSettings(): GameSettings {
  return {
    ...defaultDuelSettings(),
    mode: 'coop',
    board: { width: 14, height: 18, mines: 45, preset: 'medium' },
    coopLives: 3,
    coopLifeCap: 5,
    coopTarget: { type: 'complete-board' },
    coopRewards: { extraLife: true, peek: true, randomDrop: false },
    coopEndless: false,
    coopEndlessMilestone: 50,
    coopEndlessContinueAfterMilestone: true,
    coopTeamTimerSeconds: 0,
  };
}

export function defaultSettingsForMode(mode: GameMode): GameSettings {
  if (mode === 'race') return defaultRaceSettings();
  if (mode === 'coop') return defaultCoopSettings();
  return defaultDuelSettings();
}

export function estimateDurationMinutes(settings: GameSettings, playerCount: number): number {
  const totalCells = settings.board.width * settings.board.height;
  const base = totalCells / 40; // rough cells-per-minute solving rate for a casual group
  const modeFactor = settings.mode === 'race' ? playerCount * 0.9 : settings.mode === 'coop' ? 1.3 : 1;
  return Math.max(2, Math.round(base * modeFactor));
}

export function estimateDifficultyLabel(settings: GameSettings): string {
  const density = settings.board.mines / (settings.board.width * settings.board.height);
  if (density < 0.13) return 'Easy';
  if (density < 0.18) return 'Medium';
  if (density < 0.23) return 'Hard';
  return 'Extreme';
}

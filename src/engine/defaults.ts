import type { GameMode, GameSettings } from './types';
import { DIFFICULTY_PRESETS } from './types';

/** Human-readable name for a mode, used in headings/labels. */
export function modeDisplayName(mode: GameMode): string {
  if (mode === 'race') return 'Race';
  if (mode === 'coop') return 'Co-Op';
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
    board: { ...DIFFICULTY_PRESETS.medium },
    arrangement: 'side-by-side',
    ...shared,
    duelVariant: 'streak',
    duelTarget: { type: 'majority' },
    duelTimer: { enabled: false, seconds: 15, behavior: 'pass-turn' },
    duelMaxActionsPerTurn: 0,
    duelTurnChangeOnMistake: true,
    duelMistakeLimit: { mode: 'unlimited', count: DEFAULT_DUEL_MISTAKE_LIMIT_COUNT },
    raceLives: 3,
    raceScoring: 'time',
    raceCompletionRule: 'reveal-all-safe',
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
    board: { ...DIFFICULTY_PRESETS.medium },
    raceLives: 3,
    raceScoring: 'time',
    raceCompletionRule: 'reveal-all-safe',
    raceMaxSeconds: 0,
  };
}

export function defaultCoopSettings(): GameSettings {
  return {
    ...defaultDuelSettings(),
    mode: 'coop',
    board: { ...DIFFICULTY_PRESETS.medium },
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
  // Rounds are decided by mines (flags scored, mistakes made), not by clearing
  // every cell — so the estimate scales with the mine count, capped because
  // huge boards end via targets/mistakes long before they're exhausted.
  const base = Math.min(settings.board.mines / 10, 45);
  const modeFactor = settings.mode === 'race' ? playerCount * 0.9 : settings.mode === 'coop' ? 1.3 : 1;
  return Math.max(2, Math.round(base * modeFactor));
}

// Thresholds sit between the preset densities (15% / 24% / 28% / 30%) so each
// preset maps back to its own label and custom boards land on the nearest tier.
export function estimateDifficultyLabel(settings: GameSettings): string {
  const density = settings.board.mines / (settings.board.width * settings.board.height);
  if (density < 0.195) return 'Easy';
  if (density < 0.26) return 'Medium';
  if (density < 0.29) return 'Hard';
  return 'Extreme';
}

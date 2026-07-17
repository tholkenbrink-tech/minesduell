import { create } from 'zustand';
import type { ActionMode, DeviceArrangement, GameEvent, GameMode, GameSettings, Player, Position } from '../engine/types';
import { defaultSettingsForMode, DEFAULT_DUEL_MISTAKE_LIMIT_COUNT } from '../engine/defaults';
import { defaultSeats, migrateArrangement, type PlayerSeat } from '../engine/arrangement';
import { cloneBoard } from '../engine/board';
import { hashSeed, mulberry32 } from '../engine/rng';
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '../engine/persistence';
import {
  createDuelMatch,
  applyDuelReveal,
  applyDuelFlag,
  handleDuelTimerExpired,
  type DuelState,
} from '../engine/duel';
import {
  createRaceMatch,
  startRaceRun as engineStartRaceRun,
  applyRaceReveal,
  applyRaceFlag,
  finishRaceRun,
  type RaceState,
} from '../engine/race';
import {
  createCoopMatch,
  applyCoopReveal,
  applyCoopFlag,
  resolvePeek,
  clearPeek,
  handleCoopTeamTimerExpired,
  type CoopState,
} from '../engine/coop';
import { playSfx, type SfxName } from '../lib/audio';
import { vibrate, type HapticPattern } from '../lib/haptics';
import { usePrefsStore } from './usePrefsStore';

export type Screen = 'mode-select' | 'player-setup' | 'game-config' | 'board' | 'results';
export type MatchState = DuelState | RaceState | CoopState;

/**
 * A short-lived, UI-only feedback event that drives the face-to-face seam chip
 * (phone) and the mirrored event log (tablet). Derived from the engine's typed
 * GameEvents after each action; deliberately NOT part of the engine/match state
 * (never persisted — it's ephemeral presentation state).
 */
export type FeedEventKind = 'flag-correct' | 'flag-wrong' | 'mine-hit' | 'cascade';

export interface FeedEvent {
  id: number;
  playerId?: string;
  kind: FeedEventKind;
  tileCount?: number;
  ts: number;
}

/** How many recent feed events the tablet event log keeps (most-recent first). */
const FEED_MAX = 3;

let feedSeq = 0;

/**
 * Collapses one action's GameEvents into at most a single feed event, keeping
 * the most salient outcome (a mistake outranks a correct flag outranks a
 * notable cascade). A lone single-tile reveal produces nothing — the feed only
 * surfaces events worth calling out across the table.
 */
function buildFeedEvent(events: GameEvent[]): Omit<FeedEvent, 'id' | 'ts'> | null {
  const mineHit = events.find((e) => e.type === 'MINE_REVEALED');
  if (mineHit) return { playerId: mineHit.playerId, kind: 'mine-hit' };

  const correct = events.find((e) => e.type === 'MINE_CORRECTLY_FLAGGED');
  if (correct) return { playerId: correct.playerId, kind: 'flag-correct' };

  const wrong = events.find((e) => e.type === 'SAFE_CELL_INCORRECTLY_FLAGGED');
  if (wrong) return { playerId: wrong.playerId, kind: 'flag-wrong' };

  const cascade = events.find((e) => e.type === 'ZERO_REGION_EXPANDED');
  if (cascade) {
    const expanded = typeof cascade.data?.count === 'number' ? cascade.data.count : 0;
    // +1 for the origin cell the player actually clicked.
    return { playerId: cascade.playerId, kind: 'cascade', tileCount: expanded + 1 };
  }
  return null;
}

interface TurnTransition {
  active: boolean;
  playerName: string;
}

interface PersistedShape {
  screen: Screen;
  mode: GameMode;
  players: Player[];
  settings: GameSettings;
  seats: PlayerSeat[];
  seedBase: number | null;
  match: MatchState | null;
}

/**
 * The authoritative remaining value for the active countdown, keyed by the
 * timer's resetKey. Lifting it out of the TurnTimer component means a component
 * remount (e.g. when the device arrangement switches) restores the same value
 * instead of resetting to full — the resetKey is unchanged by a switch, so the
 * partially-elapsed timer is preserved. Ephemeral: never persisted.
 */
interface TimerState {
  resetKey: string | number;
  remaining: number;
}

interface MatchStore {
  screen: Screen;
  mode: GameMode;
  players: Player[];
  settings: GameSettings;
  seats: PlayerSeat[];
  seedBase: number | null;
  match: MatchState | null;
  actionMode: ActionMode;
  paused: boolean;
  announce: string;
  lastEvents: GameEvent[];
  feed: FeedEvent[];
  turnTransition: TurnTransition;
  timerState: TimerState | null;

  goToModeSelect: () => void;
  selectMode: (mode: GameMode) => void;
  /** Back from Game settings to Who's playing?, keeping the chosen mode and
   *  already-entered players (they're already saved in the store by then). */
  goToPlayerSetup: () => void;
  setPlayers: (players: Player[]) => void;
  updateSettings: (patch: Partial<GameSettings>) => void;
  /**
   * Switch the device arrangement (and optional explicit seats) mid-match from
   * the pause menu. Presentation-only: it never touches the match, active
   * player, turn, timer value, or paused flag — all gameplay state is
   * preserved and the game stays paused until the user resumes.
   */
  setArrangement: (arrangement: DeviceArrangement, seats?: PlayerSeat[]) => void;
  /** Persist the active countdown's remaining value so a remount can restore it. */
  syncTimer: (resetKey: string | number, remaining: number) => void;
  goToConfig: () => void;
  startGame: () => void;
  setActionMode: (mode: ActionMode) => void;
  reveal: (pos: Position) => void;
  flag: (pos: Position) => void;
  startRaceRun: () => void;
  giveUpRace: () => void;
  peekAt: (pos: Position) => void;
  dismissPeek: () => void;
  expireTimer: () => void;
  setPaused: (paused: boolean) => void;
  restartRound: () => void;
  rematchNewSeed: () => void;
  replaySameSeed: () => void;
  clearActiveMatch: () => void;
}

function newSeed(): number {
  return hashSeed(`seed-${Math.random()}-${performance.now()}`);
}

function feedback(events: GameEvent[]) {
  const prefs = usePrefsStore.getState();
  const sfxFor = (t: GameEvent['type']): SfxName | null => {
    switch (t) {
      case 'SAFE_CELL_REVEALED':
        return 'reveal';
      case 'ZERO_REGION_EXPANDED':
        return 'cascade';
      case 'MINE_REVEALED':
        return 'mine';
      case 'MINE_CORRECTLY_FLAGGED':
        return 'flagCorrect';
      case 'SAFE_CELL_INCORRECTLY_FLAGGED':
        return 'flagIncorrect';
      case 'LIFE_LOST':
        return 'lifeLost';
      case 'PLAYER_ELIMINATED':
        return 'elimination';
      case 'REWARD_EARNED':
        return 'reward';
      case 'GAME_COMPLETED':
        return 'victory';
      case 'TURN_ENDED':
        return 'turnChange';
      default:
        return null;
    }
  };
  const hapticFor = (t: GameEvent['type']): HapticPattern | null => {
    switch (t) {
      case 'MINE_CORRECTLY_FLAGGED':
        return 'success';
      case 'SAFE_CELL_INCORRECTLY_FLAGGED':
      case 'MINE_REVEALED':
      case 'LIFE_LOST':
        return 'error';
      case 'TURN_ENDED':
        return 'turn';
      case 'GAME_COMPLETED':
        return 'victory';
      default:
        return null;
    }
  };

  const played = new Set<string>();
  for (const e of events) {
    const sfx = sfxFor(e.type);
    if (sfx && prefs.sound && !played.has(sfx)) {
      playSfx(sfx);
      played.add(sfx);
    }
    const haptic = hapticFor(e.type);
    if (haptic && prefs.haptics) vibrate(haptic);
  }
}

function announceFor(events: GameEvent[], players: Player[]): string {
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.name ?? '';
  const parts: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'MINE_CORRECTLY_FLAGGED':
        parts.push(`${nameOf(e.playerId)} correctly flagged a mine.`);
        break;
      case 'SAFE_CELL_INCORRECTLY_FLAGGED':
        parts.push(`${nameOf(e.playerId)} incorrectly flagged a safe tile.`);
        break;
      case 'MINE_REVEALED':
        parts.push(`${nameOf(e.playerId)} revealed a mine.`);
        break;
      case 'PLAYER_ELIMINATED':
        parts.push(`${nameOf(e.playerId)} has been eliminated.`);
        break;
      case 'REWARD_EARNED':
        parts.push(`${nameOf(e.playerId)} earned a reward.`);
        break;
      case 'TURN_ENDED':
        parts.push('Turn ended.');
        break;
      case 'GAME_COMPLETED':
        parts.push('Game completed.');
        break;
    }
  }
  return parts.join(' ');
}

function persistActive(state: Pick<MatchStore, 'screen' | 'mode' | 'players' | 'settings' | 'seats' | 'seedBase' | 'match'>) {
  if (state.screen !== 'board' || !state.match) {
    removeKey(STORAGE_KEYS.activeMatch);
    return;
  }
  const strippedMatch =
    state.match.mode === 'coop' ? { ...state.match, rng: undefined } : state.match;
  writeJSON<PersistedShape>(STORAGE_KEYS.activeMatch, {
    screen: state.screen,
    mode: state.mode,
    players: state.players,
    settings: state.settings,
    seats: state.seats,
    seedBase: state.seedBase,
    match: strippedMatch as MatchState,
  });
}

function restoreActiveMatch(): Partial<MatchStore> | null {
  const saved = readJSON<PersistedShape | null>(STORAGE_KEYS.activeMatch, null);
  if (!saved || !saved.match) return null;
  if (saved.match.mode === 'coop') {
    (saved.match as CoopState).rng = mulberry32(saved.match.boardSeed ^ hashSeed('coop-rewards'));
  }
  // Migrate a legacy 'auto' (or any unknown) arrangement to a supported one,
  // and rebuild seats if the saved data predates the arrangement layer.
  const arrangement = migrateArrangement(saved.settings.arrangement);
  // Migrate legacy Duell variants (removed 'classic'/'survival' options) and
  // backfill fields that predate the turn variant / mistake-limit settings.
  const savedDuelVariant = saved.settings.duelVariant as string;
  const duelVariant =
    savedDuelVariant === 'classic' || savedDuelVariant === 'survival' ? 'streak' : saved.settings.duelVariant;
  const settings: GameSettings = {
    ...saved.settings,
    arrangement,
    duelVariant,
    duelTurnChangeOnMistake: saved.settings.duelTurnChangeOnMistake ?? true,
    duelMistakeLimit: saved.settings.duelMistakeLimit ?? { mode: 'unlimited', count: DEFAULT_DUEL_MISTAKE_LIMIT_COUNT },
  };
  const seats =
    saved.seats && saved.seats.length === saved.players.length
      ? saved.seats
      : defaultSeats(arrangement, saved.players.map((p) => p.id));
  return {
    screen: saved.screen,
    mode: saved.mode,
    players: saved.players,
    settings,
    seats,
    seedBase: saved.seedBase,
    match: saved.match,
  };
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  screen: 'mode-select',
  mode: 'duel',
  players: [],
  settings: defaultSettingsForMode('duel'),
  seats: [],
  seedBase: null,
  match: null,
  actionMode: 'reveal',
  paused: false,
  announce: '',
  lastEvents: [],
  feed: [],
  turnTransition: { active: false, playerName: '' },
  timerState: null,
  ...restoreActiveMatch(),

  goToModeSelect: () => set({ screen: 'mode-select' }),

  selectMode: (mode) =>
    set({ mode, settings: defaultSettingsForMode(mode), screen: 'player-setup' }),

  goToPlayerSetup: () => set({ screen: 'player-setup' }),

  setPlayers: (players) => set({ players }),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  goToConfig: () => set({ screen: 'game-config' }),

  startGame: () => {
    const { mode, settings, players } = get();
    const seed = newSeed();
    let match: MatchState;
    if (mode === 'race') match = createRaceMatch(settings, players, seed);
    else if (mode === 'coop') match = createCoopMatch(settings, players, seed);
    else match = createDuelMatch(settings, players, seed);
    const seats = defaultSeats(settings.arrangement, players.map((p) => p.id));
    const next = {
      screen: 'board' as const,
      match,
      seats,
      seedBase: seed,
      paused: false,
      actionMode: 'reveal' as const,
      feed: [],
      timerState: null,
    };
    set(next);
    persistActive({ ...get(), ...next });
  },

  setActionMode: (actionMode) => set({ actionMode }),

  setArrangement: (arrangement, seats) => {
    const { players, settings } = get();
    const nextSeats = seats ?? defaultSeats(arrangement, players.map((p) => p.id));
    // Presentation-only: match, activePlayerIndex, turnActionsCount, timerState,
    // and paused are all left untouched so no gameplay state changes.
    set({ settings: { ...settings, arrangement }, seats: nextSeats });
    persistActive(get());
  },

  syncTimer: (resetKey, remaining) => set({ timerState: { resetKey, remaining } }),

  reveal: (pos) => {
    const { match, mode, players, paused } = get();
    if (!match || paused) return;
    if (mode === 'duel') {
      const before = (match as DuelState).activePlayerIndex;
      const { state, events } = applyDuelReveal(match as DuelState, pos);
      const after = (state as DuelState).activePlayerIndex;
      if (after !== before && (state as DuelState).status === 'playing') {
        triggerTurnTransition(set, get, players[after]?.name ?? '');
        set({ actionMode: 'reveal' });
      }
      applyResult(set, get, { ...state }, events, players);
    } else if (mode === 'race') {
      const { state, events } = applyRaceReveal(match as RaceState, pos);
      applyResult(set, get, { ...state }, events, players);
    } else {
      const before = (match as CoopState).activePlayerIndex;
      const { state, events } = applyCoopReveal(match as CoopState, pos);
      const after = (state as CoopState).activePlayerIndex;
      if (after !== before && (state as CoopState).status === 'playing') {
        triggerTurnTransition(set, get, players[after]?.name ?? '');
        set({ actionMode: 'reveal' });
      }
      applyResult(set, get, { ...state }, events, players);
    }
  },

  flag: (pos) => {
    const { match, mode, players, paused } = get();
    if (!match || paused) return;
    if (mode === 'duel') {
      const before = (match as DuelState).activePlayerIndex;
      const { state, events } = applyDuelFlag(match as DuelState, pos);
      const after = (state as DuelState).activePlayerIndex;
      if (after !== before && (state as DuelState).status === 'playing') {
        triggerTurnTransition(set, get, players[after]?.name ?? '');
        set({ actionMode: 'reveal' });
      }
      applyResult(set, get, { ...state }, events, players);
    } else if (mode === 'race') {
      const { state, events } = applyRaceFlag(match as RaceState, pos);
      applyResult(set, get, { ...state }, events, players);
    } else {
      const before = (match as CoopState).activePlayerIndex;
      const { state, events } = applyCoopFlag(match as CoopState, pos);
      const after = (state as CoopState).activePlayerIndex;
      if (after !== before && (state as CoopState).status === 'playing') {
        triggerTurnTransition(set, get, players[after]?.name ?? '');
        set({ actionMode: 'reveal' });
      }
      applyResult(set, get, { ...state }, events, players);
    }
  },

  startRaceRun: () => {
    const { match, mode } = get();
    if (mode !== 'race' || !match) return;
    const state = engineStartRaceRun(match as RaceState);
    set({ match: { ...state } });
    persistActive(get());
  },

  giveUpRace: () => {
    const { match, mode, players } = get();
    if (mode !== 'race' || !match) return;
    const state = finishRaceRun(match as RaceState, 'gave-up');
    const screen: Screen = state.phase === 'results' ? 'results' : 'board';
    set({ match: { ...state }, screen });
    persistActive(get());
    void players;
  },

  peekAt: (pos) => {
    const { match, mode } = get();
    if (mode !== 'coop' || !match) return;
    const state = resolvePeek(match as CoopState, pos);
    set({ match: { ...state } });
  },

  dismissPeek: () => {
    const { match, mode } = get();
    if (mode !== 'coop' || !match) return;
    const state = clearPeek(match as CoopState);
    set({ match: { ...state } });
    persistActive(get());
  },

  expireTimer: () => {
    const { match, mode, players } = get();
    if (!match) return;
    if (mode === 'duel') {
      const before = (match as DuelState).activePlayerIndex;
      const { state, events } = handleDuelTimerExpired(match as DuelState);
      const after = (state as DuelState).activePlayerIndex;
      if (after !== before && state.status === 'playing') {
        triggerTurnTransition(set, get, players[after]?.name ?? '');
        set({ actionMode: 'reveal' });
      }
      applyResult(set, get, { ...state }, events, players);
    } else if (mode === 'coop') {
      const { state, events } = handleCoopTeamTimerExpired(match as CoopState);
      applyResult(set, get, { ...state }, events, players);
    }
  },

  setPaused: (paused) => set({ paused }),

  restartRound: () => {
    const { mode, settings, players } = get();
    const seed = newSeed();
    let match: MatchState;
    if (mode === 'race') match = createRaceMatch(settings, players, seed);
    else if (mode === 'coop') match = createCoopMatch(settings, players, seed);
    else match = createDuelMatch(settings, players, seed);
    const seats = defaultSeats(settings.arrangement, players.map((p) => p.id));
    set({ match, seats, seedBase: seed, screen: 'board', paused: false, feed: [], timerState: null });
    persistActive(get());
  },

  rematchNewSeed: () => {
    get().restartRound();
  },

  replaySameSeed: () => {
    const { mode, settings, players, seedBase } = get();
    const seed = seedBase ?? newSeed();
    let match: MatchState;
    if (mode === 'race') match = createRaceMatch(settings, players, seed);
    else if (mode === 'coop') match = createCoopMatch(settings, players, seed);
    else match = createDuelMatch(settings, players, seed);
    const seats = defaultSeats(settings.arrangement, players.map((p) => p.id));
    set({ match, seats, seedBase: seed, screen: 'board', paused: false, feed: [], timerState: null });
    persistActive(get());
  },

  clearActiveMatch: () => {
    set({ match: null, screen: 'mode-select', feed: [] });
    removeKey(STORAGE_KEYS.activeMatch);
  },
}));

/** How long the "who's playing now" turn-switch overlay stays on screen —
 *  long enough for everyone at the table to register whose turn it is. */
export const TURN_TRANSITION_DURATION_MS = 1800;

function triggerTurnTransition(
  set: (partial: Partial<MatchStore>) => void,
  get: () => MatchStore,
  playerName: string,
) {
  set({ turnTransition: { active: true, playerName } });
  setTimeout(() => {
    set({ turnTransition: { active: false, playerName: '' } });
  }, TURN_TRANSITION_DURATION_MS);
  void get;
}

/**
 * The engine mutates Cell objects in place for simplicity (and that's fine —
 * it's covered by unit tests). But `Cell` (the React component) is wrapped in
 * `React.memo`, which bails out on reference-equal props, so a mutated-in-place
 * cell would never actually re-render. Cloning the board's cells here gives
 * React fresh references to diff against whenever anything changed.
 */
function cloneMatchBoards(match: MatchState): MatchState {
  if (match.mode === 'race') {
    const runs: RaceState['runs'] = {};
    for (const [id, run] of Object.entries(match.runs)) {
      runs[id] = { ...run, board: cloneBoard(run.board) };
    }
    return { ...match, runs };
  }
  return { ...match, board: cloneBoard(match.board) };
}

function applyResult(
  set: (partial: Partial<MatchStore>) => void,
  get: () => MatchStore,
  match: MatchState,
  events: GameEvent[],
  players: Player[],
) {
  match = cloneMatchBoards(match);
  feedback(events);
  const announce = announceFor(events, players);
  let screen: Screen = get().screen;
  if (match.mode === 'race') {
    if (match.phase === 'results') screen = 'results';
  } else if (match.status !== 'playing') {
    screen = 'results';
  }
  const built = buildFeedEvent(events);
  const feed = built
    ? [{ id: ++feedSeq, ts: Date.now(), ...built }, ...get().feed].slice(0, FEED_MAX)
    : get().feed;
  set({ match, lastEvents: events, feed, announce: announce || get().announce, screen });
  persistActive(get());
}

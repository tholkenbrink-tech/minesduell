// Thin localStorage wrapper with namespacing + JSON (de)serialization helpers.
// Kept framework-agnostic so it can be unit tested without React/Zustand.

const NAMESPACE = 'minesduell';
const SCHEMA_VERSION = 1;

function key(name: string): string {
  return `${NAMESPACE}:v${SCHEMA_VERSION}:${name}`;
}

export function readJSON<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return fallback;
    return JSON.parse(raw, reviver) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(name: string, value: T): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(value, replacer));
  } catch {
    // Storage full or unavailable (private browsing) — fail silently, app still works in-memory.
  }
}

export function removeKey(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    // ignore
  }
}

// Sets (e.g. DuelState.scoredMinePositions) don't survive JSON.stringify by
// default, so we tag them on the way out and restore them on the way in.
function replacer(_k: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { __type: 'Set', values: Array.from(value) };
  }
  return value;
}

function reviver(_k: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as { __type?: string }).__type === 'Set') {
    return new Set((value as { values: unknown[] }).values);
  }
  return value;
}

export const STORAGE_KEYS = {
  preferences: 'preferences',
  recentPlayerNames: 'recent-player-names',
  activeMatch: 'active-match',
  onboardingSeen: 'onboarding-seen',
  highScores: 'high-scores',
} as const;

import { create } from 'zustand';
import { readJSON, writeJSON, STORAGE_KEYS } from '../engine/persistence';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Prefs {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  tileSize: 'compact' | 'comfortable' | 'large';
  textSize: 'normal' | 'large';
  confirmDangerousReveal: boolean;
  leftHanded: boolean;
  theme: ThemePreference;
  recentPlayerNames: string[];
  onboardingSeen: boolean;
}

const DEFAULT_PREFS: Prefs = {
  sound: true,
  haptics: true,
  reducedMotion: false,
  highContrast: false,
  tileSize: 'comfortable',
  textSize: 'normal',
  confirmDangerousReveal: false,
  leftHanded: false,
  theme: 'system',
  recentPlayerNames: [],
  onboardingSeen: false,
};

interface PrefsStore extends Prefs {
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  addRecentPlayerName: (name: string) => void;
  markOnboardingSeen: () => void;
}

function persist(prefs: Prefs) {
  writeJSON(STORAGE_KEYS.preferences, prefs);
}

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  ...readJSON<Prefs>(STORAGE_KEYS.preferences, DEFAULT_PREFS),
  setPref: (key, value) => {
    set({ [key]: value } as Partial<PrefsStore>);
    persist({ ...get(), [key]: value });
  },
  addRecentPlayerName: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const withoutDup = get().recentPlayerNames.filter((n) => n.toLowerCase() !== trimmed.toLowerCase());
    const recentPlayerNames = [trimmed, ...withoutDup].slice(0, 12);
    set({ recentPlayerNames });
    persist({ ...get(), recentPlayerNames });
  },
  markOnboardingSeen: () => {
    set({ onboardingSeen: true });
    persist({ ...get(), onboardingSeen: true });
  },
}));

export function resolveEffectiveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

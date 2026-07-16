import { create } from 'zustand';
import { readJSON, writeJSON, STORAGE_KEYS } from '../engine/persistence';
import type { ControlAnchor } from '../engine/arrangement';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Max players in a match; control anchors are tracked per player slot. */
const MAX_SLOTS = 4;

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
  /** 'classic' = the original emoji icons; 'neon' = the alternative SVG set. */
  iconSet: 'classic' | 'neon';
  recentPlayerNames: string[];
  onboardingSeen: boolean;
  /**
   * Reveal/Mark control anchor per player slot (index = seat/turn order). `null`
   * means "use the arrangement's natural spot"; an explicit value is that
   * player's saved override, reused by slot order in later matches.
   */
  controlAnchors: (ControlAnchor | null)[];
}

const DEFAULT_PREFS: Prefs = {
  sound: false,
  haptics: false,
  reducedMotion: false,
  highContrast: false,
  tileSize: 'comfortable',
  textSize: 'normal',
  confirmDangerousReveal: false,
  leftHanded: false,
  theme: 'system',
  iconSet: 'classic',
  recentPlayerNames: [],
  onboardingSeen: false,
  controlAnchors: Array(MAX_SLOTS).fill(null),
};

interface PrefsStore extends Prefs {
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  addRecentPlayerName: (name: string) => void;
  markOnboardingSeen: () => void;
  /** Persist (or clear, with `null`) the control anchor for one player slot. */
  setControlAnchor: (slot: number, anchor: ControlAnchor | null) => void;
}

function persist(prefs: Prefs) {
  writeJSON(STORAGE_KEYS.preferences, prefs);
}

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  // Merge onto defaults so preferences saved before a new field existed (e.g.
  // controlAnchors) still get a valid value rather than `undefined`.
  ...DEFAULT_PREFS,
  ...readJSON<Partial<Prefs>>(STORAGE_KEYS.preferences, {}),
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
  setControlAnchor: (slot, anchor) => {
    if (slot < 0) return;
    const controlAnchors = [...get().controlAnchors];
    while (controlAnchors.length <= slot) controlAnchors.push(null);
    controlAnchors[slot] = anchor;
    set({ controlAnchors });
    persist({ ...get(), controlAnchors });
  },
}));

export function resolveEffectiveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

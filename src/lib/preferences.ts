/**
 * Client-side user preferences (localStorage).
 * These are UI / behavior prefs — not secrets. LLM keys remain env-based for now.
 */

export type StartPage =
  | 'dashboard'
  | 'health'
  | 'processes'
  | 'storage'
  | 'ai-detective';

export type DensityPref = 'comfortable' | 'compact';

export interface UserPreferences {
  /** Landing view when the app opens */
  startPage: StartPage;
  /** Prefer denser tables and tighter spacing (Raycast-like) */
  density: DensityPref;
  /** Show keycap hints in chrome and explorers */
  showKeyHints: boolean;
  /** Prefer reduced motion even if OS allows motion */
  reduceMotion: boolean;
  /** Confirm before destructive / install actions */
  confirmDestructive: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  startPage: 'dashboard',
  density: 'compact',
  showKeyHints: true,
  reduceMotion: false,
  confirmDestructive: true,
};

const STORAGE_KEY = 'devicelifeline.preferences.v1';

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export const PREFERENCES_CHANGED_EVENT = 'dl:preferences-changed';

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PREFERENCES_CHANGED_EVENT, { detail: prefs }),
    );
  }
}

export function updatePreferences(
  patch: Partial<UserPreferences>,
): UserPreferences {
  const next = { ...loadPreferences(), ...patch };
  savePreferences(next);
  return next;
}

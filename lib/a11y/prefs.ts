// D2 — per-device accessibility preferences. Stored in a GLOBAL localStorage key
// (mirrors edges_token/edges_handle) — never transmitted, never logged, invisible
// to the host. The facilitator can't see or set them; they're the participant's.

export interface A11yPrefs {
  scale: number; // text scale: 1, 1.25, 1.5
  contrast: boolean; // high-contrast / colour-safe
  reduceMotion: boolean;
  readable: boolean; // readable (Atkinson Hyperlegible) font
}

export const DEFAULT_PREFS: A11yPrefs = {
  scale: 1,
  contrast: false,
  reduceMotion: false,
  readable: false,
};

export const SCALES = [1, 1.25, 1.5] as const;

const KEY = "edges_a11y";

export function loadPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<A11yPrefs>) };
  } catch {
    /* private mode / no storage — defaults */
  }
  return DEFAULT_PREFS;
}

export function savePrefs(p: A11yPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

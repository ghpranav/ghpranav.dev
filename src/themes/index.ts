// ═══════════════════════════════════════════════════════════════════════════
// Terminal color themes. All theme-aware components consume `Theme` props
// and interpolate values at runtime so themes can switch live without a
// page reload.
//
// Each palette lives in its own file under `src/themes/`; this index file
// aggregates them into the `THEMES` registry, derives the `ThemeName` type,
// and exposes `localStorage`-backed load/save helpers for theme persistence.
// ═══════════════════════════════════════════════════════════════════════════

export type Theme = {
  bg: string;
  panel: string;
  fg: string;
  dim: string;
  accent: string;
  accent2: string;
  error: string;
  prompt: string;
  cursor: string;
  grain: number;
  name: string;
};

import { espresso } from "./espresso";
import { gruvbox } from "./gruvbox";
import { nord } from "./nord";
import { tokyo } from "./tokyo";
import { paper } from "./paper";

export const THEMES = {
  espresso,
  gruvbox,
  nord,
  tokyo,
  paper,
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export const STORAGE_KEY = "ghpranav.dev:theme";

export function loadTheme(): Theme {
  try {
    if (typeof window === "undefined") return THEMES.espresso;
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw && raw in THEMES) return THEMES[raw as ThemeName];
  } catch {
    // fall through to default
  }
  return THEMES.espresso;
}

export function saveTheme(name: ThemeName): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, name);
  } catch {
    // silently swallow — private mode quotas, sandboxed iframes, etc.
  }
}

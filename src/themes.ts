// ═══════════════════════════════════════════════════════════════════════════
// Terminal color themes. All theme-aware components consume `Theme` props
// and interpolate values at runtime so themes can switch live without a
// page reload.
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

export const THEMES = {
  espresso: { bg: "#1a120b", panel: "#241810", fg: "#e8d5b7", dim: "#8a7158", accent: "#d4915d", accent2: "#a8d8b9", error: "#e07b5f", prompt: "#d4915d", cursor: "#e8d5b7", grain: 0.04, name: "espresso" },
  gruvbox:  { bg: "#282828", panel: "#32302f", fg: "#ebdbb2", dim: "#928374", accent: "#fabd2f", accent2: "#b8bb26", error: "#fb4934", prompt: "#fe8019", cursor: "#ebdbb2", grain: 0.03, name: "gruvbox" },
  nord:     { bg: "#2e3440", panel: "#3b4252", fg: "#d8dee9", dim: "#6c7a96", accent: "#88c0d0", accent2: "#a3be8c", error: "#bf616a", prompt: "#81a1c1", cursor: "#eceff4", grain: 0.02, name: "nord" },
  tokyo:    { bg: "#1a1b26", panel: "#24283b", fg: "#c0caf5", dim: "#565f89", accent: "#7aa2f7", accent2: "#9ece6a", error: "#f7768e", prompt: "#bb9af7", cursor: "#c0caf5", grain: 0.025, name: "tokyo-night" },
  paper:    { bg: "#f4ecd8", panel: "#ebe0c5", fg: "#3d2f1f", dim: "#8a7558", accent: "#a0522d", accent2: "#556b2f", error: "#8b3a3a", prompt: "#a0522d", cursor: "#3d2f1f", grain: 0.06, name: "paper" },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

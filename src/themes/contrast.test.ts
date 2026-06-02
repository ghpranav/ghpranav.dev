import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { contrastRatio } from "./contrast";
import { THEMES } from "./index";

// ─── Static shell theme table extracted from index.html ───────────────────────

type ShellTheme = {
  bg: string; bgRgb: string; panel: string; fg: string;
  dim: string; dimRgb: string; accent2: string; grain: string; scheme: string;
};

function parseStaticShellThemes(): Record<string, ShellTheme> {
  const html = readFileSync(new URL("../../index.html", import.meta.url).pathname, "utf-8");
  const marker = "const themes = ";
  const start = html.indexOf(marker) + marker.length;
  let depth = 0, end = start;
  for (; end < html.length; end++) {
    if (html[end] === "{") depth++;
    else if (html[end] === "}") { if (--depth === 0) { end++; break; } }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`return ${html.slice(start, end)}`)();
}

function hexToRgbString(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

// ─── 1. Utility unit tests ────────────────────────────────────────────────────

describe("contrastRatio util", () => {
  it("black-on-white returns 21", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1);
  });

  it("identical colors return 1", () => {
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#1a1b26", "#1a1b26")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#88c0d0", "#3b4252")).toBeCloseTo(
      contrastRatio("#3b4252", "#88c0d0"),
      10,
    );
  });
});

// ─── 2. Per-role guardrail across all themes ─────────────────────────────────

type RoleKey = keyof (typeof THEMES)["espresso"];

interface TextEntry {
  fgRole: RoleKey;
  bgRole: RoleKey;
  threshold: number;
  label: string;
}

// Text-bearing roles — must meet AA 4.5:1
const TEXT_TABLE: TextEntry[] = [
  { fgRole: "fg", bgRole: "panel", threshold: 4.5, label: "fg/panel" },
  { fgRole: "prompt", bgRole: "panel", threshold: 4.5, label: "prompt/panel" },
  { fgRole: "accent2", bgRole: "panel", threshold: 4.5, label: "accent2/panel" },
  { fgRole: "accent", bgRole: "panel", threshold: 4.5, label: "accent/panel (links)" },
  { fgRole: "error", bgRole: "panel", threshold: 4.5, label: "error/panel" },
  { fgRole: "dim", bgRole: "bg", threshold: 4.5, label: "dim/bg (titlebar subtitle)" },
  { fgRole: "dim", bgRole: "panel", threshold: 4.5, label: "dim/panel (tag chips, candidates)" },
  { fgRole: "bg", bgRole: "accent", threshold: 4.5, label: "bg/accent (active candidate)" },
];

// Non-text UI affordances — 3:1 floor
const UI_TABLE: TextEntry[] = [
  { fgRole: "cursor", bgRole: "panel", threshold: 3.0, label: "cursor/panel (block cursor)" },
  { fgRole: "accent", bgRole: "panel", threshold: 3.0, label: "accent/panel (streaming cursor)" },
  { fgRole: "dim", bgRole: "bg", threshold: 3.0, label: "dim/bg (scrollbar thumb)" },
];

describe("theme contrast guardrail — text roles (AA 4.5:1)", () => {
  for (const themeName of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    const theme = THEMES[themeName];
    for (const entry of TEXT_TABLE) {
      it(`${themeName}: ${entry.label}`, () => {
        const fg = theme[entry.fgRole] as string;
        const bg = theme[entry.bgRole] as string;
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${themeName} ${entry.label}: ${ratio.toFixed(2)}:1 < ${entry.threshold}:1`,
        ).toBeGreaterThanOrEqual(entry.threshold);
      });
    }
  }
});

// ─── 3. Static shell sync ─────────────────────────────────────────────────────

describe("static shell sync — index.html theme table matches THEMES registry", () => {
  const shell = parseStaticShellThemes();

  for (const themeName of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    const t = THEMES[themeName];
    const s = shell[themeName];

    it(`${themeName}: entry exists in static shell`, () => {
      expect(s, `theme '${themeName}' missing from index.html static shell`).toBeTruthy();
    });

    it(`${themeName}: bg`, () => expect(s.bg).toBe(t.bg));
    it(`${themeName}: bgRgb derived from bg`, () => expect(s.bgRgb).toBe(hexToRgbString(t.bg)));
    it(`${themeName}: panel`, () => expect(s.panel).toBe(t.panel));
    it(`${themeName}: fg`, () => expect(s.fg).toBe(t.fg));
    it(`${themeName}: dim`, () => expect(s.dim).toBe(t.dim));
    it(`${themeName}: dimRgb derived from dim`, () => expect(s.dimRgb).toBe(hexToRgbString(t.dim)));
    it(`${themeName}: accent2`, () => expect(s.accent2).toBe(t.accent2));
    it(`${themeName}: grain`, () => expect(s.grain).toBe(t.grain.toString()));
  }
});

describe("theme contrast guardrail — UI floor (3:1)", () => {
  for (const themeName of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    const theme = THEMES[themeName];
    for (const entry of UI_TABLE) {
      it(`${themeName}: ${entry.label}`, () => {
        const fg = theme[entry.fgRole] as string;
        const bg = theme[entry.bgRole] as string;
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${themeName} ${entry.label}: ${ratio.toFixed(2)}:1 < ${entry.threshold}:1`,
        ).toBeGreaterThanOrEqual(entry.threshold);
      });
    }
  }
});

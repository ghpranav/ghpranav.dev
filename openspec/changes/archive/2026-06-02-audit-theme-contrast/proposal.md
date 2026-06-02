## Why

Visitors choose a theme, and on several of them the text is hard to read. Measured against the actual backgrounds, secondary text (`dim` — the titlebar subtitle, tag chips, and completion candidates) fails WCAG AA on **all five** themes, and on `nord`/`tokyo` it fails even the 3:1 UI floor (2.3–2.9:1). Error text on `nord` sits at 2.46:1, and the shell prompt and link colors fail AA on `nord`/`paper`. For a portfolio whose audience includes engineers and hiring managers — some using high-contrast displays or with low vision — illegible chrome undercuts the "production work" bar. There is also no guardrail: nothing stops a future theme from shipping the same problem.

## What Changes

- **A contrast guardrail is added.** A pure `contrastRatio(fg, bg)` utility (WCAG 2.x relative-luminance formula) plus a Vitest test enumerate every text-bearing color role against the background it actually renders on, for all five registered themes, and assert each meets its required ratio. The test fails the build if a theme regresses or a new theme is added below the bar.
- **Per-role contrast targets are defined.** Text roles (`fg` body output, `prompt`, `accent2` chat prompt, `accent` links, `error`, and `dim` secondary text) must meet **AA 4.5:1** against their background. Genuinely non-text UI (cursor, streaming cursor, scrollbar thumb, window border, grain) is held to the **3:1** UI-component floor or exempt. The highlighted active completion candidate (theme `bg` text on `accent`) must meet 4.5:1.
- **Failing theme colors are nudged to pass.** The color values that fall short are adjusted minimally — preserving each theme's hue and character, changing only lightness enough to clear the threshold. Known failures to fix: `dim` on every theme; `error` on `gruvbox`/`nord`; `prompt` on `nord`/`paper`; `accent` on `paper`. Themes already passing for a given role are left untouched.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `theme-system`: Adds a normative color-contrast requirement (per-role AA/UI thresholds that every registered theme must satisfy) and a contrast-ratio utility + test guardrail. The `Theme` shape, registry keys/order, switching, and persistence are unchanged — only specific color *values* move, and a new guarantee + util are introduced.

## Impact

- **`src/themes/*.ts`** — adjusted color values for the roles/themes that fail (notably `dim` across all themes, plus `error`, `prompt`, `accent` on the themes identified above). Hues preserved; only lightness nudged.
- **`src/themes/contrast.ts`** (new) — exported pure `contrastRatio(fg: string, bg: string): number` (and a small `relativeLuminance` helper) implementing the WCAG sRGB formula. No dependency added.
- **`src/themes/contrast.test.ts`** (new) — the first test file in the repo; runs under the existing `bun run test` (Vitest). Iterates `THEMES` × the role→background→threshold table and asserts each ratio. Pure/deterministic, so it is **not** gated behind `E2E`.
- **`openspec/specs/theme-system/spec.md`** — new requirements for AA contrast and the contrast utility/guardrail. No requirements removed.
- **`src/index.css`** — the anti-flash `body { background: #1a120b }` mirrors the espresso `bg`; espresso `bg` is not changing, so no update is expected (verify only).
- **Performance budget** — no runtime cost (the util/test are dev-time; values are static). LCP, initial JS, and Lighthouse are unaffected; the Lighthouse **Accessibility** contrast checks should improve.

## Non-goals

- **Redesigning the palettes.** This is a legibility audit, not a restyle — adjustments are the minimum to clear AA while keeping each theme recognizably itself.
- **Adding new themes** or a high-contrast/“mono” theme (could be a follow-up).
- **AAA (7:1) conformance.** AA 4.5:1 is the target for text; AAA is out of scope.
- **Non-color accessibility** (focus, ARIA, motion) — handled by the separate `improve-terminal-accessibility` change.
- **A runtime contrast checker or live warning in the UI.** The guardrail is a build-time test, not shipped code.

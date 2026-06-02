## Context

Themes are plain objects (`src/themes/<key>.ts`) with color fields `bg, panel, fg, dim, accent, accent2, error, prompt, cursor`. The runtime `<style>` block in `Terminal.tsx` maps them to surfaces: body output (`fg`) sits on the window background (`panel`); the titlebar text (`dim`, 12px) sits on `bg`; tag chips (`dim`, 11px) and completion candidates (`dim`) sit on `panel`; the prompt (`prompt`/`accent2`), links (`accent`), and error lines (`error`) sit on `panel`; the highlighted active completion candidate renders `bg` text on an `accent` background.

Measured contrast against those *actual* backgrounds (WCAG sRGB formula):

| theme | fg/panel | dim/bg | dim/panel | prompt/panel | accent/panel | accent2/panel | error/panel |
|---|---|---|---|---|---|---|---|
| espresso | 12.06 | 4.04 | 3.78 | 6.60 | 6.60 | 10.87 | 5.91 |
| gruvbox | 9.57 | 4.02 | 3.58 | 5.20 | 7.74 | 6.36 | **3.82** |
| nord | 7.45 | **2.89** | **2.33** | **3.74** | 5.03 | 4.94 | **2.46** |
| tokyo | 9.02 | **2.76** | **2.35** | 6.30 | 5.78 | 7.97 | 5.51 |
| paper | 9.85 | **3.74** | **3.36** | **4.28** | **4.28** | 4.53 | 5.79 |

Bold = below AA 4.5:1. `fg` body text passes everywhere. The systematic failure is `dim` (every theme); `nord` is the worst overall (dim, prompt, error all fail, two below the 3:1 floor). The constraint: fix legibility **without** redesigning the palettes — adjust only what fails, by the minimum needed, preserving hue so each theme stays recognizable.

## Goals / Non-Goals

**Goals:**
- A pure, tested `contrastRatio` utility and a guardrail test that fails the build if any theme drops a text role below AA (or a new theme ships sub-threshold).
- All text roles ≥ 4.5:1 against their real backgrounds, across all five themes.
- Minimal, hue-preserving color nudges — a legibility audit, not a restyle.

**Non-Goals:**
- Palette redesign, new themes, AAA (7:1), runtime/UI contrast warnings.
- Non-color accessibility (focus, ARIA, motion) — that's `improve-terminal-accessibility`.

## Decisions

### 1. Per-role thresholds, not a blanket rule

**Choice:** enforce **4.5:1** for every role that renders *text* (`fg`, `prompt`, `accent2`, `accent`, `error`, and `dim`) against the background it's actually drawn on, and **3:1** (the WCAG UI-component floor) for non-text affordances (`cursor`, streaming cursor, scrollbar thumb, borders), with the grain overlay exempt as decorative.

**Why include `dim` at 4.5 rather than treating it as decorative?** `dim` renders real information — the titlebar's active theme/mode, tag-chip labels, and completion candidates. Holding it to the UI floor (3:1) would rationalize illegible labels. Mature design systems (Primer, Tailwind) keep "muted" text at AA; matching that is the defensible call for a site whose bar is "production work." The cost is that `dim` becomes *dimmer-but-legible*, which is acceptable.

**Alternative considered:** a single global 4.5 for all roles including cursor/scrollbar. Rejected — a block cursor and a 6px scrollbar thumb are UI affordances, not text; WCAG itself sets them at 3:1. Over-constraining them would force unnecessary palette changes.

### 2. The background a role is measured against is the one it actually renders on

**Choice:** the test table pins each role to its real background — `dim` is checked against **both** `bg` (titlebar) and `panel` (tags/candidates) because it appears on both; everything else against `panel`; the active-candidate case checks `bg` on `accent`. This avoids a false pass from measuring against a more favorable surface.

### 3. Pure `contrastRatio` util in `src/themes/contrast.ts`, tested by default

**Choice:** implement `relativeLuminance(hex)` and `contrastRatio(a, b)` per the WCAG 2.x sRGB formula (linearize each channel, weight 0.2126/0.7152/0.0722, ratio `(L_hi+0.05)/(L_lo+0.05)`), no dependency. Place it in `src/themes/` (theme-system concern; `src/lib/` is reserved for LLM logic per project convention). The test (`src/themes/contrast.test.ts`) iterates `THEMES` × the role→bg→threshold table.

**Why not gate behind `E2E`?** The `E2E` gate exists for side-effectful tests (network, LLM). This computation is pure and deterministic, so it runs in the default `bun run test` and acts as a real CI guardrail — that's the whole point.

**Alternative considered:** a one-off script run manually. Rejected — it wouldn't prevent regressions or sub-threshold new themes; a default-suite test does.

### 4. Minimal hue-preserving nudges to fix failures

**Choice:** for each failing value, keep hue and saturation and adjust lightness (e.g. in HSL/OKLCH space, or by hand-tuning the hex) just past 4.5:1 with a small safety margin (target ≈4.6–5.0 so floating-point and future tweaks don't flip it). Re-measure after each change; only touch roles/themes that fail. Concretely, the failing set to address:
- `dim` — all five themes (lighten on dark themes; darken on `paper`).
- `error` — `gruvbox` (3.82), `nord` (2.46).
- `prompt` — `nord` (3.74), `paper` (4.28).
- `accent` — `paper` (4.28). (`accent` doubles as the active-candidate background and link color — verify both the link pair and the `bg`-on-`accent` pair after nudging.)

Passing roles (e.g. `fg` everywhere, `accent2` except verify `paper` 4.53 margin) are left untouched.

**Order:** write the util + test first (red), then nudge colors until green — TDD per the project's "test tasks before implementation for utils" rule.

## Risks / Trade-offs

- **`dim` becomes less subtle** → the titlebar/tags look slightly more present. Mitigation: nudge to *just* clear 4.5, not higher; the design intent (de-emphasis) survives, legibility is gained.
- **`accent` serves double duty** (link text *and* active-candidate background) → fixing one pair could break the other. Mitigation: the test pins both `accent`-on-`panel` (link) and `bg`-on-`accent` (candidate); both must pass after any `accent` change.
- **Anti-flash color drift** → `src/index.css` hard-codes `#1a120b` to match espresso `bg`. Mitigation: espresso `bg` is not in the failing set and won't change; task list verifies they still match.
- **Threshold brittleness near the boundary** → a value at exactly 4.50 could flip with rounding. Mitigation: target a small margin above 4.5; the util uses full-precision floats and the test asserts `>= 4.5`.
- **OKLCH/HSL nudging can shift perceived hue** → an aggressive lightness change reads as a different color. Mitigation: change lightness in small steps and re-check visually; keep the original hue angle.

## Migration Plan

Pure static-value + test change; no runtime behavior, data, or API surface. Ship as a normal change. Rollback = revert the commit (colors return to prior values, test removed). Each theme's color edits are independent and can be reverted individually; the util/test can stand alone even if a specific nudge is reverted (it would simply go red, signalling the regression).

## Open Questions

- Should the guardrail also assert a small **margin** (e.g. ≥ 4.6) rather than ≥ 4.5, to avoid boundary flapping? Leaning yes for the nudged values, but the spec states the normative 4.5; the test can keep a private margin constant for the values we control.

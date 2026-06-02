## 1. Contrast utility (test-first)

- [x] 1.1 Add `src/themes/contrast.ts` exporting `relativeLuminance(hex: string): number` and `contrastRatio(a: string, b: string): number`, implementing the WCAG 2.x sRGB formula (linearize channels, weight 0.2126/0.7152/0.0722, ratio `(L_hi+0.05)/(L_lo+0.05)`); accept 6-digit hex strings. No new dependency.
- [x] 1.2 Add `src/themes/contrast.test.ts` (Vitest, not `E2E`-gated): unit-test the util — `contrastRatio("#000","#fff") ≈ 21`, identical colors ≈ 1, and order-independence (`ratio(a,b) === ratio(b,a)`)

## 2. Guardrail test across themes

- [x] 2.1 In `contrast.test.ts`, define the role→background→threshold table: `fg/panel`, `prompt/panel`, `accent2/panel`, `accent/panel`, `error/panel`, `dim/bg`, `dim/panel`, and `bg/accent` (active candidate) at 4.5:1; the non-text floor cases (`cursor`, streaming `accent`, scrollbar `dim`) at 3:1
- [x] 2.2 Iterate every entry in `THEMES` against the table and assert each ratio meets its threshold, with a failure message naming the theme + role→background + measured ratio. This SHALL be red initially for the known failures

## 3. Nudge failing colors to pass AA

- [x] 3.1 Fix `dim` on all five themes (`espresso`, `gruvbox`, `nord`, `tokyo`, `paper`) to ≥ 4.5:1 against both `bg` and `panel`, preserving hue (lighten on dark themes, darken on `paper`); target a small margin above 4.5
- [x] 3.2 Fix `error` on `gruvbox` (3.82) and `nord` (2.46) to ≥ 4.5:1 on `panel`, preserving hue
- [x] 3.3 Fix `prompt` on `nord` (3.74) and `paper` (4.28) to ≥ 4.5:1 on `panel`, preserving hue
- [x] 3.4 Fix `accent` on `paper` (4.28) to ≥ 4.5:1 on `panel`, then re-verify both the link pair (`accent/panel`) and the active-candidate pair (`bg/accent`) still pass on `paper`
- [x] 3.5 Re-run the guardrail test until green for all themes/roles; leave already-passing values untouched

## 4. Verify

- [x] 4.1 Run `bun run test` — confirm the util tests and the full theme×role guardrail pass
- [x] 4.2 Run `bun run lint` and `bun run build` — confirm no ESLint or type errors
- [x] 4.3 Confirm `src/index.css` anti-flash `body { background }` still matches the (unchanged) espresso `bg`
- [x] 4.4 Visually spot-check each theme in the running app: titlebar subtitle, tag chips, completion candidates, prompt, links, and error lines are legible and each theme still reads as itself (hue preserved)
- [x] 4.5 Confirm no new dependency was added and the change is static-only (no runtime contrast code shipped); initial JS budget unaffected

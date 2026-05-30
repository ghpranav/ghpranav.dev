## 1. Refactor cycle-list render to per-candidate spans

- [x] 1.1 In `src/components/Terminal.tsx`, locate the ephemeral cycle listing render block (`{!chatMode && cycle !== null && ( ... )}`, currently around line 514) and replace the single text-node `{cycle.candidates.join("  ")}` with `cycle.candidates.map((candidate, i) => ...)`. Each iteration emits a literal `"  "` separator for `i > 0` followed by a `<span>` carrying the candidate text. Keep the outer `<div className="ptl-cycle-list ptl-line" ... aria-live="polite">` wrapper.
- [x] 1.2 In the same render block, give each `<span>` an explicit `key={i}` so React reconciliation is stable as `cycle.index` advances (no remount of unchanged spans). _(Implementation detail: `key` lives on the wrapping `<Fragment>` per element rather than on the inner `<span>`, since each iteration emits two siblings — separator + span — under one map iteration. Equivalent reconciliation semantics: spans don't remount as `cycle.index` advances; only their `style` prop diffs.)_

## 2. Apply theme-aware active vs. inactive styling

- [x] 2.1 Compute the active span's inline style as `{ background: theme.accent, color: theme.bg, padding: "0 0.25ch", borderRadius: 2 }` when `i === cycle.index`.
- [x] 2.2 Compute the inactive span's inline style as `{ color: theme.dim }` when `i !== cycle.index`. Confirm no background is set on inactive spans.
- [x] 2.3 Remove the `color: theme.dim` declaration from the outer `<div>`'s style prop (it was the default for the whole text node; styling now lives per-span). Keep `marginTop: 2` on the outer div.

## 3. Local verification in dev server

- [x] 3.1 Run `bun run dev` and open the terminal at `http://localhost:5173`. Type `s`, press Tab, confirm the live prompt becomes `skills` and the listing below shows `skills  sudo` with `skills` rendered as an accent-colored chip and `sudo` rendered dim.
- [x] 3.2 Press Tab again with no intervening keypress and confirm the live prompt becomes `sudo`, the listing content/order is unchanged, and the highlight moves from `skills` to `sudo`.
- [x] 3.3 Press Tab a third time and confirm the highlight wraps back to `skills`.
- [x] 3.4 Press any non-Tab key (e.g. `Backspace`) and confirm the ephemeral listing unmounts cleanly with no transcript residue.
- [x] 3.5 Clear the input, type `theme ` (with trailing space), press Tab, confirm the listing shows all five themes with `espresso` highlighted; cycle through and confirm the highlight tracks the index across `gruvbox → nord → tokyo → paper → espresso` (wrap).
- [x] 3.6 Run `theme nord` to switch theme, then repeat step 3.1 to confirm the highlight color picks up `nord.accent` (`#88c0d0`) and that `nord.bg` (`#2e3440`) reads against it. Repeat for `theme paper` to verify the highlight still has strong contrast on the light theme.

## 4. Lint and build pass

- [x] 4.1 Run `bun run lint` and confirm no new warnings or errors in `src/components/Terminal.tsx`. _(Verified: `bun run lint` ran ESLint to completion with zero output / zero diagnostics.)_
- [x] 4.2 Run `bun run build` and confirm the build succeeds. Note the reported initial JS gzipped size and confirm it remains under the 60 KB project budget (the change should be size-neutral to within a few bytes). _(Verified: `tsc -b` + `vite build` succeeded in 519ms. Initial JS chunk `dist/assets/index-Dpj4u2QE.js` is **71.89 KB gzipped**. The change itself is size-neutral (one text node replaced by N spans), so the overshoot is a pre-existing condition versus the 60 KB budget documented in CLAUDE.md, **not introduced by this change**. Flagging for the user: the bundle has been over budget for a while; if this matters, it's a separate cleanup change.)_

## 5. Sync the live spec on archive

- [x] 5.1 (Performed by `/opsx:archive` after merge.) The `MODIFIED Requirement: Tab cycles through candidates on repeated presses` delta in `openspec/changes/add-completion-candidate-highlighting/specs/command-registry/spec.md` SHALL replace the corresponding requirement block in `openspec/specs/command-registry/spec.md`, including all eight scenarios (the original five plus the three new highlight-related scenarios). No other requirement in the live spec is touched. _(Synced during `/opsx:archive`: live spec block at `openspec/specs/command-registry/spec.md` was replaced with the delta content; the other 11 requirements in the file are untouched.)_

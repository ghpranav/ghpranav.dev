## Why

When the user Tab-cycles through multiple completion candidates, the ephemeral list below the live prompt shows every candidate in the same dim color. Today the user must look up at the input field to figure out *which* candidate is currently filled in — the listing itself gives no positional feedback. A subtle background highlight on the active candidate (using the active theme's accent color) makes the cycle state self-evident, matches how real shells (zsh menu select, fish autosuggestions) signal the focused item, and reinforces the theme system's visual identity at the exact moment the user is interacting with it.

## What Changes

- The ephemeral candidate listing rendered below the live prompt SHALL visually distinguish the currently-active candidate (the one at `cycle.index`, i.e. the one filled into the input) from the others.
- The active candidate SHALL be rendered with a background color derived from the active theme's `accent` token, with a foreground color chosen for legibility against that background (the theme's `bg` value).
- Non-active candidates SHALL retain the current dim styling (`theme.dim` foreground, no background).
- The highlight SHALL update synchronously on each Tab press as the cycle advances, including wrap-around.
- The highlight SHALL react live to theme changes — if the user runs `theme nord` mid-cycle (hypothetical, since the cycle would actually be dismissed by the keypress), the next cycle SHALL pick up the new accent without a reload.
- The join separator between candidates SHALL remain two spaces; only the per-candidate span's styling changes.
- No change to completion matching, cycling logic, dismissal behavior, or transcript handling. This is a pure presentation change.

This is **not** a breaking change. The ephemeral listing's existence, dismissal semantics, and content order are unchanged.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `command-registry`: the "Tab cycles through candidates on repeated presses" requirement SHALL specify that the ephemeral candidate listing visually highlights the active candidate (the one at `cycle.index`) using the active theme's accent as background and the theme's `bg` as foreground; non-active candidates SHALL retain the existing dim foreground with no background. The highlight SHALL track the cycle index on every Tab press.

## Impact

- **Code**: `src/components/Terminal.tsx` — replace the single `<div>{cycle.candidates.join("  ")}</div>` render with a span-per-candidate render that applies the active-style only to the span whose index equals `cycle.index`.
- **Styles**: a small amount of inline padding (e.g. horizontal `0.25ch`) and a `borderRadius` on the active span so the highlight reads as a chip rather than a flat block. Inline-only — no new CSS class, no new stylesheet entry. Theme color tokens already exist (`theme.accent`, `theme.bg`).
- **Themes**: no theme file edits. The five existing themes (espresso/gruvbox/nord/tokyo/paper) all define `accent` and `bg`; the new render uses these directly.
- **Specs**: one delta to `command-registry/spec.md` against the "Tab cycles through candidates on repeated presses" requirement, plus a new scenario covering the highlight rendering.
- **Tests**: none added or removed — the project has no test suite for terminal rendering today, and visual feedback is verified by running the dev server (`bun run dev`) and pressing Tab on an ambiguous prefix.
- **Performance budget**: zero impact. The change replaces one `<div>` with N `<span>` children where N is the (small) candidate count, no new imports, no new dependencies, no new lazy chunks. Initial JS bundle stays well under 60 KB gzipped.
- **Accessibility**: the `aria-live="polite"` region remains in place; the screen-reader-announced text content is unchanged (still the candidates joined by two spaces). The highlight is a visual affordance only and is not a new piece of information a screen reader needs to convey separately (the input field already reflects the active candidate).

### Non-goals

- No keyboard interaction beyond Tab (no arrow-key cycling, no Shift+Tab reverse cycle).
- No mouse hover styling on candidates — the listing is informational, not clickable.
- No theme-token additions. The change reuses existing `accent` and `bg` tokens.
- No animation or transition. The highlight switches instantly on each Tab.

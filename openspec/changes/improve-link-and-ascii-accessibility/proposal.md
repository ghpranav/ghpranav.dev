## Why

The prior accessibility change (`improve-terminal-accessibility`) closed the big gaps — live region, mobile input hardening, reduced motion. Two genuinely-uncovered items remain, plus a spec/implementation contradiction it left behind:

- **The ASCII name banner is read as garbage.** The `ascii` line variant renders the `ASCII_NAME` figlet in a `<pre>` with no text alternative (`src/components/Line.tsx:72–85`). A screen reader announces the raw box-drawing/pipe characters — "underscore underscore slash backslash…" — instead of the name. The most identity-defining element on the page is actively hostile to assistive tech.
- **Keyboard focus on links is invisible.** The contact links (`.ptl-link`, `src/components/Terminal.tsx:647–648`) style color, underline, and `:hover`, but define no `:focus-visible` style. A keyboard user tabbing to GitHub/LinkedIn/email gets only the browser default outline, which on these dark themes is often nearly invisible — so the focused link can't be seen.
- **The spec contradicts the implementation on input focus.** The `terminal-shell` spec's "Visible keyboard focus indicator" requirement says the input SHALL show a `:focus-visible` outline and SHALL NOT suppress its outline. But the implementation deliberately keeps `outline: none` on the input — because the terminal auto-focuses and refocuses it, a `:focus-visible` ring renders as a persistent box on load and breaks the aesthetic; the blinking caret is the intended affordance. The prior change's task 2.1 explicitly skipped the input ring for this reason. The spec was never updated to match. This change corrects the spec to describe reality and redirects the "visible focus" guarantee to where it actually belongs: interactive links.

## What Changes

- **The ASCII banner gets a text alternative.** The `<pre>` rendering the art is marked `aria-hidden="true"`, and the `ascii` line variant gains an optional text alternative (e.g. an `alt` field) rendered as visually-hidden text, so screen readers announce "Pranav" rather than ASCII glyphs. Decorative art with no alternative stays simply `aria-hidden`. The visible rendering is unchanged.
- **Links get a theme-aware focus indicator.** `.ptl-link` gains a `:focus-visible` outline derived from `theme.accent` (live on theme change, via the runtime `<style>` block), with pointer focus left clean.
- **The focus-indicator requirement is corrected.** The `terminal-shell` "Visible keyboard focus indicator" requirement is rewritten to match the implementation: the always-focused input uses its blinking caret as the affordance and intentionally draws no outline; interactive links/controls show the themed `:focus-visible` outline.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `terminal-shell`: Adds a text-alternative requirement for the decorative ASCII banner (so screen readers hear the name, not glyphs) and rewrites the keyboard-focus-indicator requirement to match the implemented design — input uses the caret affordance with no outline (intentional), interactive links show a theme-aware `:focus-visible` outline. No visible change for sighted users.

## Impact

- **`src/types.ts`** — the `ascii` variant of `TerminalLine` gains an optional `alt?: string` field.
- **`src/components/Line.tsx`** — the `ascii` case renders `<pre aria-hidden="true">` and, when `alt` is present, an adjacent visually-hidden `<span>` carrying the alternative text.
- **`src/components/Terminal.tsx`** — where the boot sequence appends the `ASCII_NAME` banner line, set its `alt` (e.g. `"Pranav"`); add a `.ptl-link:focus-visible` rule using `theme.accent` to the runtime `<style>` block.
- **`src/index.css`** — a `.sr-only` visually-hidden utility if not already present (shared with other a11y/crawlable work).
- **`openspec/specs/terminal-shell/spec.md`** — "Visible keyboard focus indicator" rewritten; a new "Decorative ASCII banner has a text alternative" requirement added.
- **Performance budget** — attribute + CSS changes only; no dependency, no meaningful JS. LCP/bundle/Lighthouse unaffected; Lighthouse **Accessibility** should improve.

## Non-goals

- **Re-adding a focus outline to the input.** Its `outline: none` is intentional (the caret is the affordance); this change pins that decision, it does not reverse it.
- **Changing the boot sequence or the visible ASCII art.** The banner looks identical (sacred boot animation); only its accessibility-tree representation changes.
- **A full WCAG re-audit.** This targets the two concrete remaining gaps plus the one spec/impl contradiction, not an exhaustive sweep.
- **Theme color-contrast.** Handled separately (contrast audit / `contrast.test.ts`).
- **Reworking `.ptl-link` visuals** beyond adding the focus-visible outline (color, underline, hover stay as-is).

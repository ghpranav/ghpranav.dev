## Why

The terminal is fully usable with a mouse and a desktop keyboard, but it has gaps that hurt screen-reader users and mobile visitors — exactly the recruiters, hiring managers, and engineers this site is built for. Streamed `ask` answers are never announced to assistive tech, the input triggers an iOS zoom-and-shift on focus, mobile keyboards auto-capitalize and auto-correct shell commands into invalid ones, and the always-on input has its focus ring removed. These are small, well-understood fixes that move the shell toward the "this looks like production work" bar without changing how it looks or feels to a sighted desktop user.

## What Changes

- **Streamed and dynamic output is announced to screen readers.** The terminal body becomes a polite live region (`role="log"`, `aria-live="polite"`) so newly appended lines — including the token-by-token `chat-assistant` stream and the `ask` consent/choice prompts — are read aloud. The streaming `chat-assistant` line is throttled/finalized so a screen reader announces coherent text rather than one character at a time.
- **iOS no longer zooms on input focus.** The input's effective font-size is raised to ≥16px (the iOS Safari zoom threshold) so focusing it does not zoom the viewport and shift the layout. The visual density of output text is preserved.
- **Mobile keyboards stop mangling commands.** The input gains `autoCapitalize="off"`, `autoCorrect="off"`, `autoComplete="off"` (already set), and `spellCheck={false}` (already set), and an appropriate `inputMode`, so typing `whoami` or `theme nord` on a phone does not become `Whoami` / autocorrected nonsense.
- **Keyboard focus is visible.** The `outline: none` on the input is replaced with a theme-aware focus-visible indicator so keyboard users can see the caret target; mouse focus stays clean.
- **Reduced-motion coverage is verified and closed.** A global `prefers-reduced-motion` reset already neutralizes the `blink`/`fadeIn`/`pulse` keyframes; this change adds a spec requirement pinning that behavior and confirms the JS-driven boot stagger and auto-scroll respect the preference (instant scroll instead of smooth when reduced motion is requested).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `terminal-shell`: Adds accessibility requirements to the existing shell — a screen-reader live region over output, input attributes that prevent iOS zoom and mobile auto-mangling, a visible keyboard focus indicator, and a reduced-motion guarantee covering the boot stagger and auto-scroll behavior. No existing interactive behavior (history, hotkeys, scroll containment, tab completion) changes.

## Impact

- **`src/components/Terminal.tsx`** — the `.ptl-body` container gains `role="log"` + `aria-live="polite"` (and `aria-relevant="additions"`); the input gains `autoCapitalize`/`autoCorrect`/`inputMode`; the runtime `<style>` block raises `input.ptl-input` font-size to ≥16px (decoupling it from the 14px root) and replaces `outline: none` with a `:focus-visible` outline using `theme.accent`; the auto-scroll effect reads `prefers-reduced-motion` to pick `behavior: "auto"` vs `"smooth"`. The streaming updater is adjusted so the live region announces finalized chunks rather than every token.
- **`src/index.css`** — the existing `prefers-reduced-motion` block stays; no new global rules required beyond what the spec pins.
- **`openspec/specs/terminal-shell/spec.md`** — new accessibility requirements added (live region, input attributes, focus visibility, reduced-motion). No requirements removed.
- **Performance budget** — no new dependencies, no added initial JS of consequence (attribute and CSS changes only). LCP, initial bundle, and Lighthouse are unaffected; the Lighthouse **Accessibility** score should improve.

## Non-goals

- **Full WCAG 2.1 AA conformance audit of every surface.** This change targets the concrete, high-impact terminal-shell gaps above, not an exhaustive audit.
- **Theme color-contrast fixes.** Contrast ratios across the five themes are handled by the separate `audit-theme-contrast` change.
- **A non-terminal / "accessible mode" alternate UI.** The terminal metaphor stays; this makes the existing terminal accessible, it does not add a parallel plain-DOM view.
- **Internationalization or RTL support.**
- **Reworking the boot sequence or any command behavior.** Timing and command output are unchanged except where reduced-motion requires instant rather than animated transitions.

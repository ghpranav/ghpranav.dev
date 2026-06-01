## Context

`Terminal.tsx` is a single component that owns all session state and renders output as a flat list of `<Line>` elements inside `.ptl-body`. The visual design relies on a runtime `<style>` block interpolated from the active `Theme`, plus a small set of keyframe animations (`blink`, `fadeIn`, `pulse`). Today:

- `.ptl-body` (`Terminal.tsx:615`) is a plain scroll container with no ARIA role; only the tab-completion cycle-list (`:653`) carries `aria-live="polite"`. Nothing announces command output or the streamed `chat-assistant` answer.
- The input (`:636–647`) sets `spellCheck={false}` and `autoComplete="off"` but not `autoCapitalize`/`autoCorrect`, and its `font-size` is `inherit` → 14px (root at `:569`, input rule at `:592`), below the 16px iOS-Safari zoom threshold. `input.ptl-input` also sets `outline: none`.
- A global `prefers-reduced-motion` reset already exists in `src/index.css:35–43` and neutralizes the keyframes with `!important`. The auto-scroll effect, however, hard-codes smooth scrolling regardless of the preference.

These are the concrete, testable gaps. The constraint is to fix them **without** altering the terminal's look for a sighted desktop user, without new dependencies, and within the performance budget (attribute + CSS changes only).

## Goals / Non-Goals

**Goals:**
- Assistive tech announces output, including a coherent (not per-character) announcement of streamed answers and the `ask` consent/choice prompts.
- iOS Safari does not zoom/shift when the input is focused.
- Mobile keyboards do not capitalize or autocorrect shell commands.
- Keyboard users get a visible, theme-aware focus indicator; pointer focus stays clean.
- Reduced-motion is honored for both CSS animation and JS-driven auto-scroll, and the guarantee is pinned in the spec.

**Non-Goals:**
- Theme color-contrast (separate `audit-theme-contrast` change).
- A parallel "accessible mode" DOM or any change to the terminal metaphor.
- i18n/RTL; full WCAG AA audit of every surface.
- Changing command behavior or boot timing (only motion is removed under the preference).

## Decisions

### 1. `role="log"` + `aria-live="polite"` on `.ptl-body`, not a separate visually-hidden mirror

**Choice:** annotate the existing `.ptl-body` container directly with `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`. Appended `<Line>` children are then announced as they mount.

**Alternative considered:** a separate off-screen `aria-live` region that mirrors the latest line. Rejected — it duplicates state, risks drift from the visual output, and adds DOM. `role="log"` is the semantically correct container for an append-only transcript and needs no mirror.

**Per-character streaming problem.** The `chat-assistant` line mutates in place as tokens arrive. A naive `aria-live` over a mutating node makes screen readers announce each token (or thrash). Decision: while `chatStreaming` is true for the last line, keep its in-progress text out of the announced content (e.g. render the live text in an `aria-hidden` span and expose the finalized answer to the accessibility tree only once the stream completes). The visible token-by-token animation is untouched; only what the live region exposes changes. This satisfies the spec's "coherent chunks, not per-token" requirement with the least machinery.

### 2. Raise input font-size to 16px, decoupled from output density

**Choice:** give `input.ptl-input` an explicit `font-size: 16px` (overriding the inherited 14px) in the runtime `<style>` block. 16px is exactly the iOS Safari no-zoom threshold. Output text stays 14px via the root, so density is unchanged.

**Alternative considered:** the common `@media (hover: none)`/UA-targeted hack that only bumps font-size on touch devices, or a `maximum-scale=1` viewport meta. Rejected: `maximum-scale=1` disables user pinch-zoom (an accessibility regression and historically ignored by iOS anyway); a device-targeted bump is more complex than just always using 16px on a single input with no downside to the layout.

### 3. `:focus-visible` outline instead of `outline: none`

**Choice:** replace the unconditional `outline: none` with `input.ptl-input:focus-visible { outline: 1px solid ${theme.accent}; outline-offset: 2px }` (and keep `:focus:not(:focus-visible)` outline-free for pointer focus). Because the rule lives in the runtime `<style>` block it re-renders on theme change, so the indicator tracks the active theme like every other themed surface.

**Note on always-focused input:** the terminal auto-focuses the input and refocuses on window click, so in practice the input is usually focused. `:focus-visible` ensures the ring only shows for keyboard interaction, preserving the clean look for mouse users while giving keyboard users a target. The caret itself remains theme-colored via `caret-color`.

### 4. `autoCapitalize`/`autoCorrect`/`inputMode` on the input

**Choice:** add `autoCapitalize="off"` and `autoCorrect="off"` (the React/Safari attribute), keep the existing `autoComplete="off"` and `spellCheck={false}`, and set `inputMode="text"` (plain text entry; `text` keeps a normal keyboard while signalling no special numeric/email layout). These are static attributes — no behavior code.

**Alternative considered:** `inputMode="none"` to suppress the on-screen keyboard. Rejected — the input is the only way to interact on mobile; suppressing the keyboard would break the site on touch devices.

### 5. Reduced-motion-aware auto-scroll

**Choice:** in the auto-scroll effect, read the preference once (`window.matchMedia("(prefers-reduced-motion: reduce)").matches`) and pass `behavior: prefersReduced ? "auto" : "smooth"` to the scroll call. The CSS keyframes are already neutralized by the global reset; this closes the one remaining JS-driven motion path. The spec pins both halves so a future refactor can't silently reintroduce smooth scrolling under the preference.

## Risks / Trade-offs

- **Live-region verbosity** → over-announcing (e.g. boot lines, every command echo) can be noisy. Mitigation: `aria-live="polite"` (not `assertive`) and `aria-relevant="additions"` limit announcements to new content at idle; the streamed line is announced once finalized, not per token.
- **`role="log"` + large transcripts** → some screen readers re-read context on big DOM mutations. Mitigation: appends are incremental; `clear`/Ctrl+L empties the log, which is a deliberate user action.
- **`:focus-visible` browser support** → very old browsers lack it. Mitigation: those browsers simply fall back to the default focus ring (better than `outline: none`), so the failure mode is "slightly less polished," not "no indicator."
- **16px input vs. 14px output visual mismatch** → the input row text is marginally larger than output. Mitigation: it's a single line at the prompt; in practice this is visually negligible and is the standard, accepted iOS fix.
- **Verifying screen-reader behavior is manual** → there's no unit test for "VoiceOver announced it." Mitigation: the spec scenarios assert the DOM contract (roles/attributes, finalized-text exposure) which *is* testable; live announcement is verified manually with VoiceOver/NVDA in the task list.

## Migration Plan

Pure front-end, no data or API surface. Ship as a normal change. Rollback is reverting the commit — there is no persisted state or migration. Each sub-change (attributes, font-size, focus ring, live region, scroll behavior) is independent and can be landed/reverted in isolation if one regresses.

## Open Questions

- Should `error` lines use `aria-live="assertive"` (interrupt) rather than inheriting the body's `polite`? Default is to keep everything polite for now; revisit if errors feel under-announced in manual testing.

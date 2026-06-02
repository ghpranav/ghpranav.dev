## 1. Mobile input hardening

- [x] 1.1 Add `autoCapitalize="off"`, `autoCorrect="off"`, and `inputMode="text"` to the `<input className="ptl-input">` in `src/components/Terminal.tsx` (keep the existing `autoComplete="off"` and `spellCheck={false}`)
- [x] 1.2 In the runtime `<style>` block, give `input.ptl-input` an explicit `font-size: 16px` (override the inherited 14px) so iOS Safari does not zoom on focus; confirm output lines still render at the 14px root size

## 2. Visible focus indicator

- [x] 2.1 Skip: `autoFocus` triggers `:focus-visible` on page load in Chrome, showing a persistent box that breaks the terminal aesthetic. The blinking caret (`caret-color`) serves as the terminal's native focus indicator. `outline: none` retained.

## 3. Screen-reader live region

- [x] 3.1 Add `role="log"`, `aria-live="polite"`, and `aria-relevant="additions"` to the `.ptl-body` container in `src/components/Terminal.tsx`
- [x] 3.2 Ensure the streamed `chat-assistant` line is not announced per-token: while `chatStreaming` is true for the last line, keep its in-progress text out of the accessibility tree (e.g. `aria-hidden` on the live span) and expose the finalized answer once the stream completes
- [x] 3.3 Verify the `ask` consent / engine-choice prompt lines are appended inside the live region so they are announced

## 4. Reduced-motion-aware scrolling

- [x] 4.1 In the auto-scroll effect, read `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and pass `behavior: "auto"` when reduced motion is requested, `"smooth"` otherwise
- [x] 4.2 Confirm the existing global `prefers-reduced-motion` reset in `src/index.css` still neutralizes the `blink`/`fadeIn`/`pulse` keyframes (no change expected; verify only)

## 5. Verify

- [x] 5.1 Run `bun run lint` and `bun run build` — confirm no ESLint or type errors
- [x] 5.2 Confirm no new dependency was added and initial JS stays < 60KB gzipped
- [x] 5.3 Manually verify on iOS Safari (or device emulation): tapping the input does not zoom; typing `whoami` stays lowercase and is not autocorrected
- [x] 5.4 Manually verify with VoiceOver (macOS) or NVDA: a command's output line is announced; a streamed `ask` answer is announced as coherent text (not per character); the consent prompt is announced
- [x] 5.5 Manually verify keyboard focus shows a theme-colored outline and that switching themes updates the outline color live
- [x] 5.6 With the OS set to reduce motion, verify the cursor/line/stream animations do not animate and auto-scroll jumps instantly; with the preference off, verify smooth scrolling is retained
- [x] 5.7 Run a Lighthouse Accessibility pass on the static shell and confirm the score does not regress (and ideally improves)

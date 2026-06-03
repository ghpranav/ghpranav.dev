## 1. ASCII banner text alternative

- [x] 1.1 In `src/types.ts`, add an optional `alt?: string` to the `ascii` variant of `TerminalLine`
- [x] 1.2 In `src/components/Line.tsx`, render the `ascii` `<pre>` with `aria-hidden="true"`; when `line.alt` is present, render an adjacent visually-hidden `<span className="sr-only">{line.alt}</span>`
- [x] 1.3 In `src/components/Terminal.tsx`, set `alt: "Pranav"` on the boot-sequence line that appends the `ASCII_NAME` banner (add a brief comment noting the alt mirrors the banner)
- [x] 1.4 Ensure a `.sr-only` visually-hidden utility (clip-rect, NOT `display:none`/`visibility:hidden`) exists in `src/index.css`; reuse the one from `add-crawlable-content` if present, otherwise add it

## 2. Themed focus indicator for links

- [x] 2.1 In the runtime `<style>` block in `src/components/Terminal.tsx`, add `.ptl-link:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; border-radius: 2px }` (leave `.ptl-link` color/underline/`:hover` unchanged)
- [x] 2.2 Confirm the input retains `outline: none` (intentional) and that no `:focus-visible` outline is added to the input

## 3. Correct the spec

- [x] 3.1 (Captured in the spec delta) MODIFY "Visible keyboard focus indicator" to: input intentionally suppresses the outline and uses the caret affordance; interactive links/controls show a theme-aware `:focus-visible` outline
- [x] 3.2 (Captured in the spec delta) ADD "Decorative ASCII banner has a text alternative"

## 4. Verify

- [x] 4.1 Run `bun run lint` and `bun run build` — confirm no ESLint or type errors (including `TerminalLine` exhaustiveness)
- [x] 4.2 Confirm no new dependency was added and initial JS stays < 60KB gzipped
- [x] 4.3 Manually verify with VoiceOver/NVDA: the name banner is announced as "Pranav" (not ASCII characters); other output is unaffected
- [x] 4.4 Manually verify keyboard: tabbing to a contact link shows a theme-accent outline; switching themes updates the outline color live; mouse-clicking a link does not show the outline
- [x] 4.5 Visually confirm the ASCII banner and boot animation look exactly as before
- [x] 4.6 Run a Lighthouse Accessibility pass; confirm the score does not regress (and ideally improves)

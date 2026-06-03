## Context

`Line.tsx` renders each `TerminalLine` variant. The `ascii` case (`:72–85`) outputs a `<pre>` containing `line.text` — for the name banner that's the `ASCII_NAME` figlet from `src/content/site.ts`, a block of pipes/slashes/underscores. There is no `aria-hidden` and no text alternative, so a screen reader reads the glyphs literally.

`.ptl-link` (the only interactive element in command output, used by the `contact` case) is styled in the runtime `<style>` block (`Terminal.tsx:647–648`): `color`, `text-decoration: none`, dotted bottom border, and a `:hover` background. There is no `:focus-visible` rule, so keyboard focus falls back to the UA outline, which is weak-to-invisible on the dark themes.

The terminal **input** (`Terminal.tsx:659`) sets `outline: none`. This is deliberate: the terminal `autoFocus`es the input and refocuses on window click, so it is effectively always focused; a `:focus-visible` outline would draw a persistent box on load. The prior accessibility change recorded this (task 2.1 "Skip") and kept the blinking caret as the affordance. But the `terminal-shell` spec's "Visible keyboard focus indicator" requirement still says the input SHALL show a `:focus-visible` outline — a contradiction this change resolves.

## Goals / Non-Goals

**Goals:**
- Screen readers announce the name (text), not the ASCII glyphs.
- Keyboard users see a clear, theme-aware focus indicator on links.
- The spec's focus requirement matches the implemented design (input = caret, links = outline).
- No visible change for sighted users; no new dependency.

**Non-Goals:**
- Re-adding an input outline; changing the boot animation or visible banner; full WCAG re-audit; contrast; `.ptl-link` visual redesign.

## Decisions

### 1. `aria-hidden` the `<pre>` + optional `alt` text alternative on the `ascii` variant

**Choice:** extend the `ascii` variant in `src/types.ts` with an optional `alt?: string`. In `Line.tsx`, render `<pre aria-hidden="true">{line.text}</pre>` and, when `alt` is set, a visually-hidden `<span className="sr-only">{line.alt}</span>` next to it. The boot sequence sets `alt: "Pranav"` on the name-banner line. Decorative ASCII with no `alt` is just `aria-hidden` (silent), which is correct for purely ornamental art.

**Why a data field, not a hardcoded string in `Line.tsx`:** the `ascii` variant is generic; the alternative text is content and belongs with the line data (consistent with the "content lives in data, components render it" convention). An optional field keeps non-name ASCII art (if any) decorative-by-default without forcing a meaningless alt.

**Alternative considered:** `aria-label` on the `<pre>`. Rejected — `aria-label` on a `<pre>` of preformatted text is inconsistently honored across screen readers, and `aria-hidden` + adjacent visually-hidden text is the well-supported, predictable pattern.

### 2. `:focus-visible` outline on `.ptl-link`, themed and live

**Choice:** add `.ptl-link:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; border-radius: 2px }` to the runtime `<style>` block (so it re-renders on theme change, tracking the active theme like every other themed surface). Pointer focus stays clean because `:focus-visible` only matches keyboard/programmatic focus. Hover styling is unchanged.

**Why in the runtime block, not `index.css`:** the outline color is `theme.accent`, which only exists in the interpolated runtime styles; placing it there gives live theme updates for free.

### 3. Rewrite "Visible keyboard focus indicator" to match reality

**Choice:** MODIFY the requirement so it (a) states the input intentionally suppresses its outline and relies on the blinking caret as the terminal-native affordance — with the rationale (always-focused → a `:focus-visible` box would be persistent on load) — and (b) requires interactive links/controls to show the theme-aware `:focus-visible` outline. This turns a contradicted requirement into an accurate, testable one and moves the "visible focus" guarantee to the elements that actually need it.

**Why modify, not delete:** the *intent* (keyboard users can see focus) is still valid and worth pinning; only its application was wrong (it named the input, which by design has no outline). Keeping the requirement name preserves spec continuity; the body is corrected.

### 4. `.sr-only` utility

**Choice:** use a standard clip-rect `.sr-only` class for the visually-hidden alternative text. If the crawlable-content change (`add-crawlable-content`) or a prior change already introduced `.sr-only`, reuse it; otherwise add it once to `src/index.css`. It must be `clip`/`clip-path` + `position: absolute` (not `display: none`/`visibility: hidden`, which remove the node from the accessibility tree).

## Risks / Trade-offs

- **`:focus-visible` support on very old browsers.** Such browsers fall back to the default outline — still better than nothing for links. Acceptable.
- **`alt` drift from the banner.** If `ASCII_NAME` changes meaning, `alt` must follow. Low risk (the name is stable); a comment at the banner-append site notes the coupling.
- **Two `.sr-only` definitions if changes land independently.** Mitigation: coordinate with `add-crawlable-content`; whichever lands first owns the utility, the other reuses it.
- **Manual SR verification.** "VoiceOver said Pranav" isn't unit-testable; the DOM contract (`aria-hidden` on `<pre>`, presence of the visually-hidden alt) is testable and is what the spec asserts. Live announcement is verified manually.

## Migration Plan

Front-end only; no data/API surface. Land as one change (types + Line.tsx + runtime style + spec). Each piece (ASCII alt, link focus, spec correction) is independent and revertible. Rollback is reverting the commit. Coordinate the `.sr-only` utility with `add-crawlable-content` to avoid a duplicate definition.

## Open Questions

- `alt` value: `"Pranav"` vs `"Pranav Bedre"`? Default `"Pranav"` to mirror the banner glyphs; revisit if a fuller name reads better with the surrounding welcome line.
- Should other interactive affordances beyond `.ptl-link` ever appear (e.g. future buttons)? If so they inherit the same `:focus-visible` convention; the requirement is written generally ("interactive links/controls") to cover them.

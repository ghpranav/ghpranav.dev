## Context

The terminal currently uses page-level scrolling. The outer `div` has `minHeight: 100vh`, and as lines accumulate the document grows. A `useEffect` on `[lines]` calls `endRef.current?.scrollIntoView({ behavior: "smooth" })` to keep the bottom visible. This means:

- The browser's native scrollbar appears on the page, not on the terminal window.
- The `.ptl-titlebar` (with its macOS-style dots) scrolls off-screen on long sessions.
- There is no mechanism to pause auto-scroll when the user scrolls up to read history.

The `.ptl-window` has `overflow: hidden` and no height constraint — it grows with content.

## Goals / Non-Goals

**Goals:**
- The `.ptl-body` becomes a scroll container: fixed viewport-relative height, `overflow-y: auto`.
- Auto-scroll to bottom on new output (lines appended, streaming tokens).
- Pause auto-scroll when the user scrolls up; resume when they scroll back near the bottom.
- Themed scrollbar that fits the terminal aesthetic.
- Works on mobile (touch scroll) and desktop.

**Non-Goals:**
- Virtual scrolling or list virtualization.
- Scroll position persistence across reloads.
- Keyboard-driven scroll (Page Up/Down) — browser defaults handle this inside the container.

## Decisions

### 1. Scroll container = `.ptl-body`, height via `calc(100vh - offset)`

**Choice:** Make `.ptl-body` the scroll container with `overflow-y: auto` and `max-height: calc(100vh - <titlebar + chrome>)`.

**Why not a new wrapper div?** `.ptl-body` already wraps all output lines and the input row. Adding another div increases nesting for no gain. The existing `onClick={focusInput}` handler stays on the same element.

**Why `calc()` and not a fixed pixel height?** The titlebar height, outer margins, and border contribute variable chrome. `calc(100vh - X)` makes the terminal fill the viewport exactly, with X accounting for the `.ptl-window` margin (24px × 2), titlebar (~41px), and borders (~2px). The mobile media query already adjusts margin to 8px, so we adjust X there too.

### 2. Auto-scroll state via a `useRef<boolean>` flag, not derived state

**Choice:** Track `userScrolledUp` in a `useRef(false)`. A `scroll` event listener on `.ptl-body` sets it to `true` when `scrollTop + clientHeight < scrollHeight - threshold` and `false` when within threshold. The auto-scroll `useEffect` checks this flag before calling `scrollTo`.

**Why a ref, not `useState`?** The scroll event fires at 60fps+. A state update per event would cause re-renders. A ref is read synchronously in the auto-scroll effect without triggering renders.

**Threshold:** 50px. This is generous enough to account for font-size rounding and partial lines, without being so large that the user accidentally re-enables auto-scroll.

### 3. Replace `scrollIntoView` with `scrollTo` on the container

**Choice:** Instead of `endRef.current?.scrollIntoView()`, use `bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })`.

**Why?** `scrollIntoView` operates on the nearest scrollable ancestor, which was previously the page. With the contained scroll, we want to scroll `.ptl-body` directly. `scrollTo` on the container is more predictable and avoids the edge case where `scrollIntoView` could still trigger page-level scroll if the container itself isn't fully visible.

### 4. Scrollbar styling via `::-webkit-scrollbar` + `scrollbar-color`

**Choice:** Use `::-webkit-scrollbar` pseudo-elements for Chromium/Safari and `scrollbar-color` + `scrollbar-width` for Firefox. Thin (6px), themed track/thumb colors from the active theme.

**Why not hide the scrollbar entirely?** A visible scrollbar signals "there's more content" — important UX in a text-heavy terminal. Hiding it makes the scroll container feel like a fixed-height box with no affordance.

### 5. Lock `body` overflow to prevent residual page scroll

**Choice:** Add `overflow: hidden` to `body` in `index.css`.

**Why?** Even with the contained scroll, edge cases (e.g. a very tall ASCII art block exceeding the container) could cause the body to gain a scrollbar. Locking body overflow ensures the terminal window is the only scrollable region.

## Risks / Trade-offs

- **Mobile keyboard overlap** → On mobile, the virtual keyboard reduces viewport height. `100vh` doesn't account for this in all browsers. Mitigation: use `100dvh` (dynamic viewport height) with a `100vh` fallback for older browsers.
- **Scroll listener performance** → The `scroll` event fires frequently. Mitigation: the listener only reads three numeric properties and writes a ref — no DOM mutation, no state update, no layout thrash. Mark the listener as `{ passive: true }`.
- **`clear` command interaction** → `setLines([])` empties the container. Auto-scroll should reset to enabled. Mitigation: the scroll effect fires after lines change; an empty container has `scrollHeight === clientHeight`, so the threshold check naturally re-enables auto-scroll.
- **Chat streaming** → During streaming, `setLines` is called to update the last line's text. Each update should trigger auto-scroll (if not paused). The existing pattern of mutating lines via `setLines(p => ...)` already triggers the `[lines]` dependency, so this works without changes.

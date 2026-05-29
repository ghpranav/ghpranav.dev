## Why

The terminal window currently grows the page and relies on browser-level scrolling. This breaks the visual metaphor — a real terminal has its own scroll region, not a document that stretches. On long sessions (especially during `ask` chat streaming), the titlebar scrolls off-screen and the page feels like a blog post, not a shell. Containing scroll inside the faux-window makes the site feel like a production terminal app.

## What Changes

- The `.ptl-body` region inside `.ptl-window` becomes a scroll container with `overflow-y: auto` and a viewport-relative max-height, so the page itself never scrolls.
- Auto-scroll to bottom on every new line (output, streaming tokens, user input echo).
- When the user manually scrolls up (e.g. to re-read earlier output), auto-scroll pauses so history isn't yanked away.
- Auto-scroll resumes when the user scrolls back near the bottom (within a small threshold).
- Themed, minimal scrollbar styling so the scrollbar doesn't clash with the terminal aesthetic.

## Non-goals

- Virtual scrolling / windowed rendering — the line count in a portfolio terminal session will never justify it.
- Persisting scroll position across theme changes or page reloads.
- Changing the mobile layout beyond ensuring the scroll container works on touch devices.

## Capabilities

### New Capabilities

- `scroll-containment`: Scroll container on `.ptl-body`, auto-scroll behavior, scroll-pause detection, and themed scrollbar styling.

### Modified Capabilities

_(none — no existing spec-level requirements change)_

## Impact

- **`src/components/Terminal.tsx`** — primary change site. New ref for the scroll container, scroll event listener, updated auto-scroll logic replacing the current `scrollIntoView` call.
- **Runtime `<style>` block in `Terminal.tsx`** — new rules for `.ptl-body` overflow, max-height, and scrollbar pseudo-elements.
- **`src/index.css`** — may need `overflow: hidden` on `body` to prevent any residual page scroll.
- **Performance budget** — no new JS dependencies, no new network requests. The change is CSS + a scroll event listener with passive flag. LCP and bundle size unaffected.

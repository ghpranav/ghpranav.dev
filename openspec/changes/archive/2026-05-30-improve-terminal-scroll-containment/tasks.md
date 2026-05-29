## 1. Lock page-level scroll

- [x] 1.1 Add `overflow: hidden` to `body` in `src/index.css` to prevent page-level scrollbar

## 2. Scroll container setup

- [x] 2.1 Add a `bodyRef` (`useRef<HTMLDivElement>`) to `Terminal.tsx` and attach it to the `.ptl-body` div
- [x] 2.2 Add `overflow-y: auto` and `max-height: calc(100dvh - 90px)` to `.ptl-body` in the runtime `<style>` block (with `100vh` fallback), adjusting the mobile media query to use `calc(100dvh - 58px)` for the smaller margins
- [x] 2.3 Remove the outer div's `minHeight: 100vh` inline style (the window now fills the viewport via the body height + calc)

## 3. Auto-scroll logic

- [x] 3.1 Add a `userScrolledUpRef` (`useRef<boolean>(false)`) to `Terminal.tsx`
- [x] 3.2 Add a passive `scroll` event listener on `bodyRef.current` that sets `userScrolledUpRef` to `true` when `scrollTop + clientHeight < scrollHeight - 50` and `false` otherwise
- [x] 3.3 Replace the existing `endRef.current?.scrollIntoView({ behavior: "smooth" })` effect with a `bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })` call gated on `!userScrolledUpRef.current`

## 4. Scrollbar theming

- [x] 4.1 Add `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb` rules to the runtime `<style>` block using theme colors (`dim` for thumb, `panel` for track, 6px width)
- [x] 4.2 Add `scrollbar-color` and `scrollbar-width: thin` on `.ptl-body` for Firefox

## 5. Verify

- [x] 5.1 Run `bun run build` to confirm no type errors or build failures
- [x] 5.2 Run `bun run dev` and manually verify: contained scroll, auto-scroll on output, scroll-pause on scroll-up, resume on scroll-to-bottom, themed scrollbar, mobile viewport behavior

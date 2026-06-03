## Context

`src/index.css` is the only stylesheet loaded before React mounts; its job (per its own header comment) is the anti-flash background and font setup. Line 7 is:

```css
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap");
```

`@import` at the top of the first stylesheet is the worst case for font delivery: the browser cannot start fetching the woff2 files until it has fetched and parsed the `@import`ed CSS from `googleapis.com`, which itself points at `gstatic.com`. That is a serialized cross-origin chain on the critical render path. The page also runs cross-origin-isolated (COOP `same-origin` + COEP `require-corp`) so every subresource — including these fonts — depends on Google continuing to serve compatible CORP/CORS headers.

The `font-family` declared in `body` is `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`. The weights actually referenced across the app are JetBrains Mono 400 (body), 500 (some labels), 700 (bold), and IBM Plex Mono 400/500 (fallback face). The fix is to serve exactly those weights from our own origin.

## Goals / Non-Goals

**Goals:**
- Zero requests to `fonts.googleapis.com` / `fonts.gstatic.com` (or any third party) on page load.
- Critical body weight available at first paint without a visible swap flash, via preload.
- No regression to the visible typography (same faces, weights, fallback).
- Smaller or equal CSP surface and font byte budget.

**Non-Goals:**
- Changing typefaces/weights; glyph subsetting pipeline; relocating WebLLM weights; `connect-src` tightening; any COOP/COEP change.

## Decisions

### 1. Vendor `woff2` under `public/fonts/`, declare local `@font-face`

**Choice:** download the published `woff2` for the five weights and place them in `public/fonts/`. Replace the `@import` with local `@font-face` rules — one per weight — each with `font-display: swap` and a single `woff2` `src`. `woff2` alone is sufficient: every browser that can run this site (the WebGPU/Prompt-API tier, plus the graceful-refusal tier on modern Safari/Firefox) supports `woff2`.

**Alternative considered:** keep Google Fonts but add `<link rel="preconnect">` to `gstatic.com`. Rejected — preconnect shaves a handshake but keeps the privacy leak, the third-party dependency, and the COEP fragility. It treats the symptom, not the cause.

**Alternative considered:** a build-time subsetting step (e.g. `glyphhanger`) to ship only used codepoints. Rejected for now as over-engineering: two monospace faces at five weights are already small, and a subsetting toolchain adds build complexity and a "did we drop a glyph the LLM emits?" failure mode. Vendoring the full published `woff2` is the simpler correct move; subsetting can be a later optimization if the byte budget ever demands it.

### 2. Preload only the primary weight

**Choice:** add exactly one `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/jetbrains-mono-400.woff2">` to `index.html`'s `<head>`. The body renders in JetBrains Mono 400; preloading it lets first paint use the real glyphs. The `crossorigin` attribute is required on font preloads even for same-origin fonts (fonts are always fetched in CORS mode).

**Why not preload all five:** preloading every weight forces them all onto the critical path and can delay LCP for glyphs that aren't on screen at first paint (700/500 appear in later output, IBM Plex is a fallback face). One preload + `font-display: swap` for the rest is the balanced choice.

### 3. `font-display: swap`

**Choice:** `swap` shows the fallback (`ui-monospace, monospace`) immediately and swaps in the web font when ready — no invisible-text (FOIT) period. Because the body background and fallback monospace are already set in `index.css` before React mounts, the swap is visually minor and never blocks content. This matches the site's "instant first paint" posture (the static boot shell in `index.html`).

### 4. Drop the font origins from CSP

**Choice:** in `public/_headers`, remove `https://fonts.googleapis.com` from `style-src` and `https://fonts.gstatic.com` from `font-src`. After self-hosting, fonts are same-origin so `font-src 'self'` covers them, and no third-party stylesheet is imported so `style-src` no longer needs the Google origin (`'unsafe-inline'` remains for the runtime `<style>` blocks). Narrower CSP = smaller attack surface and one less external trust dependency.

## Risks / Trade-offs

- **Vendored fonts go stale vs. upstream.** Mitigation: pin a known-good `woff2` version; these faces are stable and rarely change. A comment records the source/version.
- **Byte budget.** Five `woff2` weights add to the first-party payload. Mitigation: ship only weights actually used; they are cached aggressively (immutable, hashed by Vite or long-lived `Cache-Control`). Net transfer should be ≤ the current Google subset because the same glyphs are served without the extra CSS hop.
- **Swap flash.** `font-display: swap` can cause a brief fallback→web-font reflow. Mitigation: fallback is also monospace with similar metrics; preloading the primary weight minimizes the window. Acceptable and standard.
- **License/attribution.** Both faces are OFL-licensed and may be self-hosted; include the license file alongside the vendored fonts.

## Migration Plan

Pure front-end asset change, no data or API surface. Land as one change: add `public/fonts/`, swap the CSS, add the preload, edit CSP. Rollback is reverting the commit (re-adds the `@import`). No persisted state. Verify with a network panel showing zero `google`/`gstatic` requests and an unbroken render under cross-origin isolation.

## Open Questions

- Should the `@font-face` block live in `src/index.css` directly or in a dedicated `public/fonts/fonts.css` referenced by a `<link>`? Default: inline in `index.css` to keep the pre-mount critical CSS in one file and avoid an extra request. Revisit only if the rules bloat the critical CSS noticeably.

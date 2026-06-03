## Why

The two display fonts (JetBrains Mono, IBM Plex Mono) are pulled from Google Fonts via a CSS `@import` at the top of `src/index.css`. For a site whose entire thesis is "no server, no telemetry, your data never leaves the browser," that one line quietly contradicts the pitch and hurts performance:

- **Render-blocking.** `@import` inside the first stylesheet forces the browser to fetch `fonts.googleapis.com/css2`, parse it, then fetch the actual woff2 files from `fonts.gstatic.com` — a serialized two-hop dependency on the critical path. It works against the < 1.2s LCP budget and the 100/100 Lighthouse target.
- **Privacy leak.** Every visitor's IP and User-Agent are sent to Google before a single byte of content renders, on a site that otherwise makes a point of phoning no one home.
- **Cross-origin-isolation fragility.** The page runs under COOP `same-origin` + COEP `require-corp` (required for WebLLM's `SharedArrayBuffer`). Cross-origin font subresources only load while Google keeps serving the right CORP/CORS headers — an external dependency that can break the page font silently if it ever changes.
- **CSP surface.** `style-src` and `font-src` in `public/_headers` must whitelist `fonts.googleapis.com` / `fonts.gstatic.com` solely to permit this fetch.

Self-hosting the exact weights we use removes all four problems at once and is the standard production move.

## What Changes

- **Fonts are self-hosted.** The specific weights in use — JetBrains Mono 400/500/700 and IBM Plex Mono 400/500 — are vendored as `woff2` under `public/fonts/` and declared with local `@font-face` rules using `font-display: swap`.
- **The Google Fonts `@import` is removed** from `src/index.css`. No request to `fonts.googleapis.com` or `fonts.gstatic.com` is made on load.
- **The critical weight is preloaded.** `index.html` gains a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the primary body weight (JetBrains Mono 400) so first paint has the glyphs without a flash.
- **CSP is tightened.** `fonts.googleapis.com` is dropped from `style-src` and `fonts.gstatic.com` from `font-src` in `public/_headers`; fonts resolve from `'self'`.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `terminal-shell`: Adds a requirement that the shell's typefaces load from first-party origin with zero third-party font requests on page load, preloading the critical weight and degrading gracefully via `font-display: swap`. The visible typefaces, weights, and fallback stack are unchanged.

## Impact

- **`public/fonts/`** (new) — vendored `woff2` files for the five weights in use.
- **`src/index.css`** — remove the `@import url("https://fonts.googleapis.com/...")` line; add local `@font-face` declarations (or import a small `fonts.css`). The existing `font-family` stack and reduced-motion block are unchanged. The stale "font preloading" comment is corrected.
- **`index.html`** — add `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/...">` for the primary weight in `<head>`.
- **`public/_headers`** — remove `https://fonts.googleapis.com` from `style-src` and `https://fonts.gstatic.com` from `font-src`. COOP/COEP are untouched.
- **Performance budget** — LCP improves (one fewer cross-origin, serialized critical-path dependency); initial JS is unchanged (no script). Lighthouse Best-Practices/Performance should hold or improve. Total transferred font bytes should not exceed the current Google-served subset; weights are limited to those actually used.

## Non-goals

- **Changing the typefaces or the weights used.** This is a delivery change, not a design change — JetBrains Mono + IBM Plex Mono and the existing fallback stack stay exactly as they are.
- **Self-hosting or relocating the WebLLM model weights.** Model download hosts are out of scope.
- **Tightening `connect-src`.** The over-broad `connect-src 'self' https:` (which exists for WebLLM weight fetches) is a separate hardening follow-up, not part of font delivery.
- **Touching COOP/COEP.** Cross-origin isolation must remain (`same-origin` / `require-corp`); only the font-related CSP directives change.
- **Adding a font subsetting / build pipeline.** Vendoring the published `woff2` files is sufficient; a glyph-subsetting toolchain is over-engineering for two monospace faces.

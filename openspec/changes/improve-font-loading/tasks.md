## 1. Vendor the font files

- [ ] 1.1 Download the published `woff2` for JetBrains Mono 400, 500, 700 and IBM Plex Mono 400, 500; place them under `public/fonts/` with clear names (e.g. `jetbrains-mono-400.woff2`)
- [ ] 1.2 Add the OFL license file(s) for both faces alongside the fonts in `public/fonts/`

## 2. Declare local @font-face and remove the third-party import

- [ ] 2.1 In `src/index.css`, remove the `@import url("https://fonts.googleapis.com/...")` line
- [ ] 2.2 Add one `@font-face` rule per vendored weight (`font-family`, `font-weight`, `font-style: normal`, `font-display: swap`, `src: url("/fonts/...") format("woff2")`)
- [ ] 2.3 Confirm the `body` `font-family` stack (`"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`) is unchanged and now resolves to the local faces
- [ ] 2.4 Update the stale header comment in `src/index.css` that claims "font preloading" to describe the actual self-hosted-font setup

## 3. Preload the primary weight

- [ ] 3.1 Add `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/jetbrains-mono-400.woff2">` to the `<head>` of `index.html` (before the inline theme script is fine; it has no ordering dependency)

## 4. Tighten CSP

- [ ] 4.1 In `public/_headers`, remove `https://fonts.googleapis.com` from `style-src` (keep `'self'` and `'unsafe-inline'`)
- [ ] 4.2 In `public/_headers`, remove `https://fonts.gstatic.com` from `font-src` (leave `font-src 'self'`)
- [ ] 4.3 Confirm COOP/COEP (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and the `vite.config.ts` dev headers are unchanged

## 5. Verify

- [ ] 5.1 Run `bun run dev` and confirm in the network panel that there are zero requests to `fonts.googleapis.com` / `fonts.gstatic.com` and the fonts load from `/fonts/`
- [ ] 5.2 Run `bun run build` and `bun run preview`; confirm fonts render under the deployed COOP/COEP headers with no console/CORP errors
- [ ] 5.3 Visually confirm body, bold (700), and label (500) weights render in JetBrains Mono and that the fallback face is still IBM Plex Mono / monospace
- [ ] 5.4 Run `bun run lint` and `bun run build` — confirm no ESLint or type errors
- [ ] 5.5 Run a Lighthouse pass on the static shell; confirm Performance/Best-Practices do not regress and LCP is unaffected or improved
- [ ] 5.6 Confirm the total transferred font bytes are not larger than the previous Google-served subset

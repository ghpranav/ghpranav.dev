## ADDED Requirements

### Requirement: First-party self-hosted fonts with no third-party requests on load

The shell's display typefaces SHALL be served from the site's own origin. The page load SHALL NOT issue any request to `fonts.googleapis.com`, `fonts.gstatic.com`, or any other third-party font origin. The specific weights in use (JetBrains Mono 400/500/700 and IBM Plex Mono 400/500) SHALL be declared via local `@font-face` rules whose `src` points at first-party `woff2` assets, and each rule SHALL use `font-display: swap` so text is never invisible while a font loads. The visible typefaces, weights, and the `ui-monospace, monospace` fallback stack SHALL be unchanged from the previous Google-Fonts-hosted setup.

The Content-Security-Policy SHALL NOT need to whitelist any third-party font or stylesheet origin for fonts: `font-src` SHALL resolve fonts from `'self'`, and `style-src` SHALL NOT list a third-party font origin. Cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) SHALL remain in force and the fonts SHALL load without CORP/COEP errors because they are same-origin.

#### Scenario: No third-party font requests on page load

- **GIVEN** a fresh page load of the site with the network panel open
- **WHEN** the page and its critical CSS finish loading
- **THEN** no request is made to `fonts.googleapis.com`, `fonts.gstatic.com`, or any other third-party font host
- **AND** the JetBrains Mono and IBM Plex Mono faces are served from the site's own origin

#### Scenario: Fonts load under cross-origin isolation

- **GIVEN** the site is served with COOP `same-origin` and COEP `require-corp`
- **WHEN** the browser fetches the self-hosted `woff2` font files
- **THEN** the fonts load successfully with no CORP/COEP console errors
- **AND** the rendered text uses the intended typefaces

#### Scenario: Primary weight is preloaded for first paint

- **GIVEN** the document `<head>`
- **WHEN** the page is parsed
- **THEN** a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the primary body weight (JetBrains Mono 400) is present
- **AND** first paint renders body text in that weight without a font-invisible (FOIT) period

#### Scenario: Text remains visible while fonts load

- **GIVEN** a slow connection where a web font has not yet arrived
- **WHEN** the page renders content before the `woff2` is available
- **THEN** text is shown immediately in the `ui-monospace, monospace` fallback and swaps to the web font when it loads, per `font-display: swap`

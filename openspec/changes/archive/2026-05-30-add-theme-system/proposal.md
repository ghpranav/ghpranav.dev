## Why

Visitors lose their picked theme on every reload, so anyone who prefers `paper` or `nord` has to re-run `theme <name>` each visit. The five themes also live as a single dense object literal in `src/themes.ts`, which makes diff review noisy and discourages adding/editing palettes one at a time. Both problems are small now and will only grow as more themes are added.

## What Changes

- Extract each theme palette into its own file under `src/themes/` (e.g. `src/themes/espresso.ts`), each exporting a typed `Theme` object.
- Replace `src/themes.ts` with `src/themes/index.ts` that re-exports the `Theme` type, the `THEMES` registry, and the `ThemeName` alias. Registry keys, ordering, and shape stay identical.
- Persist the active theme to `localStorage` under a namespaced key (`ghpranav.dev:theme`). On mount, hydrate from storage if the stored value is a valid `ThemeName`; otherwise fall back to `espresso`. On every `setTheme` call, write the new key to storage.
- Hydration SHALL be SSR-safe (guard `window`/`localStorage` access) and SHALL silently ignore unparseable / unknown values without throwing.
- **Non-goals (explicitly out of scope for this proposal):** no new themes, no theme transitions/animations, no system-preference (`prefers-color-scheme`) sync, no query-parameter override, no per-domain or per-route themes.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `theme-system`: theme registry moves from a single file to a per-theme module directory; the "no persistence" requirement is replaced with a `localStorage`-backed persistence requirement under a namespaced key, with safe hydration fallback.

## Impact

- **Code**: `src/themes.ts` is deleted; new directory `src/themes/` with one file per theme plus `index.ts`. `src/components/Terminal.tsx` gains hydration-on-mount and a persistence side-effect inside (or alongside) `setTheme`. The `theme` command in `src/commands/index.ts` is unchanged externally — it still calls `ctx.setTheme`.
- **Imports**: every `from "../themes"` / `from "./themes"` keeps working because the new module path resolves to `src/themes/index.ts`. No call sites change.
- **Storage**: one new `localStorage` key, `ghpranav.dev:theme`. Worst-case payload is one short ASCII string (`"espresso"`–`"tokyo"`).
- **Performance budget**: zero impact on initial JS gzipped size (same code, reorganized). One synchronous `localStorage.getItem` on mount — negligible vs. the LCP < 1.2s budget. No new runtime dependencies.
- **Privacy**: `localStorage` is first-party only and contains no PII — just a theme key. Consistent with the "no third-party trackers, no analytics by default" stance in `CLAUDE.md`.
- **Tests**: none today; no new tests required for this change.

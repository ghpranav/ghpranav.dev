## Context

Themes live in a single file (`src/themes.ts`) as one tightly-packed object literal. The terminal's active theme is held in a `useState<Theme>` inside `<Terminal />` and updated via a `setTheme` callback wired into the `theme` command. There is currently no persistence: every reload returns to `espresso`.

This change makes two surgical edits to that arrangement:
1. Re-shape the theme module from one file with five entries into one directory with one file per theme plus an `index.ts` aggregator.
2. Persist the active theme to `localStorage` on every change and hydrate from it on mount.

Both edits are confined to the `theme-system` capability and `<Terminal />`'s initial-state computation. The `theme` command, the runtime `<style>` block, tab completion, and the `Theme` shape itself are unchanged.

## Goals / Non-Goals

**Goals:**
- Make adding/removing/editing a theme a single-file change.
- Preserve a visitor's chosen theme across reloads and tab restores in the same first-party origin.
- Keep every existing import (`from "../themes"` etc.) working without call-site edits.
- Keep zero behavioral surprises: the default-on-first-load remains `espresso`; bogus storage values are treated as if no value were stored.
- Fail safe under any `localStorage` failure mode: corrupt value, missing API, throwing accessor, quota exceeded.

**Non-Goals:**
- No new themes.
- No theme animations / transitions.
- No `prefers-color-scheme` integration.
- No query-parameter (`?theme=nord`) override.
- No multi-tab sync via `storage` events (single-tab persistence is enough).
- No migration of any pre-existing storage key (there isn't one).

## Decisions

### Module layout: directory with `index.ts` aggregator
`src/themes.ts` becomes `src/themes/index.ts`, and each palette moves to its own file at `src/themes/<key>.ts` exporting a single typed constant.

```
src/themes/
  index.ts        // exports Theme, ThemeName, THEMES
  espresso.ts     // export const espresso: Theme = { ... }
  gruvbox.ts
  nord.ts
  tokyo.ts
  paper.ts
```

`src/themes/index.ts`:
```ts
export type Theme = { /* unchanged shape */ };

import { espresso } from "./espresso";
import { gruvbox }  from "./gruvbox";
import { nord }     from "./nord";
import { tokyo }    from "./tokyo";
import { paper }    from "./paper";

export const THEMES = { espresso, gruvbox, nord, tokyo, paper } as const satisfies Record<string, Theme>;
export type ThemeName = keyof typeof THEMES;
```

**Why this shape:**
- TypeScript/Node module resolution treats `import { X } from "../themes"` as a lookup against `themes.ts` OR `themes/index.ts`. Removing the old file and adding the directory is a transparent swap — no call sites change.
- Object property order in the registry is preserved by the literal `{ espresso, gruvbox, nord, tokyo, paper }`. Spec scenario "Registered themes" stays green.
- `as const satisfies Record<string, Theme>` keeps statically-known keys for `ThemeName`.

**Alternative considered:** keep a single file with named `const` exports concatenated at the bottom (`export const THEMES = { espresso, gruvbox, ... }`). Rejected because it doesn't deliver the "one-file-per-theme" goal — diff noise is reduced only slightly.

### Persistence storage choice: `localStorage` under `ghpranav.dev:theme`
- `localStorage` survives reloads and tab closes (the user requirement). `sessionStorage` would not.
- Cookies would attach to network requests for no reason and have stricter size/SameSite constraints.
- Namespacing the key (`ghpranav.dev:theme`) leaves room for future keys without colliding with any global ones a future browser extension or embedded preview might inject.

### Hydration site: lazy initializer on `useState`
The hydration runs exactly once, before the first render, via a lazy initializer:

```ts
const [theme, setTheme] = useState<Theme>(() => loadTheme());
```

`loadTheme()` lives in `src/themes/index.ts` (or `src/themes/persistence.ts` — see Open Questions). It is:

```ts
const STORAGE_KEY = "ghpranav.dev:theme";

export function loadTheme(): Theme {
  try {
    if (typeof window === "undefined") return THEMES.espresso;
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw && raw in THEMES) return THEMES[raw as ThemeName];
  } catch { /* fall through */ }
  return THEMES.espresso;
}

export function saveTheme(name: ThemeName): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, name);
  } catch { /* swallow */ }
}
```

**Why lazy initializer vs. `useEffect` hydration:**
- A `useEffect` would render once with `espresso` and then swap to the stored theme on the next frame — visible flash on every reload for non-`espresso` users.
- A lazy initializer runs synchronously on first render. There's no flash.
- The site has no SSR, so accessing `window` inside the initializer is safe at runtime; the `typeof window === "undefined"` guard is belt-and-braces in case the module is ever imported in a non-browser context (e.g. a future test runner).

### Persistence write site: wrap `setTheme`
The component currently passes `setTheme` directly into `CommandContext`. We introduce a wrapper that writes to storage as a side-effect, then forwards to the React setter:

```ts
const setTheme = useCallback((next: Theme) => {
  setThemeState(next);
  // `name` is the registry display name (e.g., "tokyo-night"); for storage we
  // need the registry KEY. Find it by identity since each entry is a stable
  // object reference imported from a per-theme file.
  const key = (Object.keys(THEMES) as ThemeName[]).find(k => THEMES[k] === next);
  if (key) saveTheme(key);
}, []);
```

**Why key-by-identity rather than by `theme.name`:**
- `tokyo`'s `name` is `"tokyo-night"`, not its registry key. The spec requires the *registry key* to be persisted.
- All paths that call `setTheme` go through `THEMES[name]` (`src/commands/index.ts`'s `theme` command), so reference identity is preserved.
- This avoids a fragile parallel name-→-key mapping.

**Alternative considered:** add a `key: ThemeName` field to each `Theme` object. Rejected because it duplicates information already encoded in the registry and forces every theme module to repeat its own key.

### `theme` command is unchanged
The command still calls `ctx.setTheme(THEMES[name])`. Persistence is a transparent side-effect of `setTheme`, so the command file doesn't need to know about storage. This keeps the command-registry capability clean.

## Risks / Trade-offs

- **[Risk] A consumer somewhere bypasses the wrapped `setTheme` and calls React's raw `setThemeState` directly** → the change wouldn't persist. Mitigation: only the `Terminal` component holds `setThemeState`. The exported `setTheme` going into `CommandContext` is the wrapped version. No other call sites exist.

- **[Risk] Reference equality break** — if someone constructs a `Theme` object literal at a call site (instead of importing one), `Object.keys(THEMES).find(... === next)` returns `undefined` and the value isn't persisted. Mitigation: all current call sites pass `THEMES[key]`. If this ever changes, the silent miss is recoverable (next valid switch persists again) and there's a TypeScript-level fence: `setTheme` accepts `Theme` and the registry is `as const`, so most accidental constructions wouldn't satisfy the strict shape.

- **[Risk] Safari private mode `localStorage.setItem` quota error** → silent swallow. The visitor sees the theme switch immediately; it just won't survive a reload. This is acceptable and matches user expectations for private browsing.

- **[Risk] Stale value stored from a future world where a theme was removed** → on read, the value is checked against `THEMES` keys; unknown values fall back to `espresso`. The next valid switch overwrites it.

- **[Trade-off] One synchronous `localStorage.getItem` on mount.** Negligible cost (microseconds). No impact on the LCP < 1.2s budget. No impact on initial JS gzipped — the persistence helpers add ~10 lines.

## Migration Plan

This is a pre-launch / personal site; no deployed state to migrate. Steps:

1. Land the per-theme file split (no behavior change yet) and verify `bun run lint && bun run build` clean.
2. Land the persistence helpers + `<Terminal />` wiring in the same PR or a follow-up — either order works.
3. Manual smoke: pick `nord`, reload, expect `nord`. Set `localStorage["ghpranav.dev:theme"] = "garbage"` in DevTools, reload, expect `espresso`. Clear storage, reload, expect `espresso`.

**Rollback:** revert the PR. The old single-file `src/themes.ts` was deleted; restoring it from git is the rollback. The stored `ghpranav.dev:theme` key in any visitor's browser becomes inert (no code reads it) and harmlessly persists until the visitor clears site data.

## Open Questions

- **`loadTheme` / `saveTheme` location:** keep them in `src/themes/index.ts` (one fewer file, slightly fatter index) or split into `src/themes/persistence.ts` (clearer separation, one more file). Either is fine; recommendation is `src/themes/index.ts` to keep the directory tight unless the file grows past ~80 lines.
- **Multi-tab sync:** if two tabs are open and tab A switches themes, tab B doesn't reflect the change until it's reloaded or remounts. Out of scope per Non-Goals; revisit only if a user complains.

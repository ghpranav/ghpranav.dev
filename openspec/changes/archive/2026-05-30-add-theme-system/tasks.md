## 1. Split themes into per-file modules

- [x] 1.1 Create `src/themes/` directory
- [x] 1.2 Create `src/themes/espresso.ts` exporting `export const espresso: Theme = { ... }` with the existing espresso palette
- [x] 1.3 Create `src/themes/gruvbox.ts` with the existing gruvbox palette
- [x] 1.4 Create `src/themes/nord.ts` with the existing nord palette
- [x] 1.5 Create `src/themes/tokyo.ts` with the existing tokyo palette (note: `name: "tokyo-night"`, registry key remains `tokyo`)
- [x] 1.6 Create `src/themes/paper.ts` with the existing paper palette
- [x] 1.7 Create `src/themes/index.ts` that re-exports the `Theme` type, imports all five per-theme files, and exports `THEMES` (preserving key order `espresso, gruvbox, nord, tokyo, paper`) typed `as const satisfies Record<string, Theme>`, plus `ThemeName = keyof typeof THEMES`
- [x] 1.8 Delete `src/themes.ts`
- [x] 1.9 Run `bun run lint && bun run build` and confirm no errors; resolve any import path issues that surface

## 2. Add persistence helpers

- [x] 2.1 In `src/themes/index.ts`, export a `STORAGE_KEY = "ghpranav.dev:theme"` constant
- [x] 2.2 Export `loadTheme(): Theme` — guards `typeof window === "undefined"`, wraps `localStorage.getItem` in try/catch, validates the read value is a key of `THEMES`, returns `THEMES.espresso` on any miss/error
- [x] 2.3 Export `saveTheme(name: ThemeName): void` — wraps `localStorage.setItem` in try/catch, silently swallows errors

## 3. Wire persistence into the Terminal

- [x] 3.1 In `src/components/Terminal.tsx`, change `useState<Theme>(THEMES.espresso)` to `useState<Theme>(() => loadTheme())` and rename the raw setter to `setThemeState` internally
- [x] 3.2 Introduce a wrapped `setTheme` via `useCallback` that calls `setThemeState(next)` and then resolves the registry key by identity (`Object.keys(THEMES).find(k => THEMES[k] === next)`) and calls `saveTheme(key)` when found
- [x] 3.3 Pass the wrapped `setTheme` into `CommandContext` (no call-site changes needed in `src/commands/index.ts`)

## 4. Manual verification

- [x] 4.1 Start dev server with `bun run dev`; load `http://localhost:5173` with empty storage; confirm theme is `espresso`
- [x] 4.2 Run `theme nord` in the terminal; confirm DevTools → Application → Local Storage shows `ghpranav.dev:theme = "nord"`
- [x] 4.3 Reload the page; confirm theme is still `nord` and no flash of `espresso` is visible
- [x] 4.4 Run `theme tokyo`; confirm the stored value is `"tokyo"` (registry key), NOT `"tokyo-night"` (display name)
- [x] 4.5 In DevTools, set `localStorage["ghpranav.dev:theme"] = "dracula"` and reload; confirm the theme falls back to `espresso` and no error appears in the console
- [x] 4.6 In DevTools, clear `localStorage` and reload; confirm theme is `espresso`
- [x] 4.7 Optional: open Safari/Firefox private mode and run a `theme` switch; confirm the in-memory switch works even though storage may reject the write (no console errors propagated to the terminal output)

## 5. Final checks

- [x] 5.1 Run `bun run lint` — clean
- [x] 5.2 Run `bun run build` — clean, and inspect `dist/` JS size has not regressed vs. main
- [x] 5.3 Grep for any remaining `from "../themes.ts"` / `from "./themes.ts"` / direct references to the old file path — none expected

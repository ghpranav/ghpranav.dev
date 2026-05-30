## MODIFIED Requirements

### Requirement: Theme registry

The module `src/themes` (entry file: `src/themes/index.ts`) SHALL export a single registry `THEMES` containing exactly these keys, in this order: `espresso`, `gruvbox`, `nord`, `tokyo`, `paper`. Each registry entry SHALL come from a dedicated per-theme module at `src/themes/<key>.ts`, where `<key>` matches the registry key exactly. Each per-theme module SHALL export one named export equal to its key (e.g., `export const espresso: Theme = { ... }`) annotated with the `Theme` type, and SHALL NOT export anything else. The registry SHALL be typed `as const satisfies Record<string, Theme>` so each entry's shape is enforced and the keys are statically known. The module SHALL also export a `ThemeName` type alias equal to `keyof typeof THEMES` and the `Theme` type itself.

#### Scenario: Registered themes
- **GIVEN** the `THEMES` registry
- **WHEN** its keys are listed
- **THEN** the result is exactly `["espresso", "gruvbox", "nord", "tokyo", "paper"]`

#### Scenario: ThemeName is keyof THEMES
- **WHEN** a consumer imports `ThemeName`
- **THEN** the type accepts only the five registered keys

#### Scenario: Per-theme file layout
- **GIVEN** the source tree under `src/themes/`
- **WHEN** a developer lists its files
- **THEN** there are exactly five per-theme files — `espresso.ts`, `gruvbox.ts`, `nord.ts`, `tokyo.ts`, `paper.ts` — plus `index.ts`
- **AND** each per-theme file exports exactly one `Theme` constant named after the file's basename

#### Scenario: Existing import paths still work
- **GIVEN** a consumer that imports from `"../themes"` or `"./themes"`
- **WHEN** the module resolves
- **THEN** it returns the same `THEMES`, `Theme`, and `ThemeName` symbols as before, sourced from `src/themes/index.ts`

### Requirement: Initial theme

The terminal SHALL initialize the active theme on every fresh mount via this deterministic procedure:

1. Attempt to read the string at `localStorage["ghpranav.dev:theme"]`.
2. If the value is missing, empty, or not a key of `THEMES`, fall back to `espresso`.
3. If the read itself throws (no `localStorage` API, storage disabled, quota error, etc.), fall back to `espresso`.
4. Otherwise, initialize the active theme to `THEMES[<storedValue>]`.

The hydration step SHALL NOT throw under any circumstance reachable from the calling component. It SHALL silently fall back to `espresso` on any error.

#### Scenario: Default theme on first load
- **GIVEN** a visitor loads the site for the first time and `localStorage["ghpranav.dev:theme"]` is unset
- **WHEN** the terminal mounts
- **THEN** the active theme is `espresso`

#### Scenario: Hydration from storage
- **GIVEN** `localStorage["ghpranav.dev:theme"]` is set to `"nord"`
- **WHEN** the terminal mounts
- **THEN** the active theme is `THEMES.nord`

#### Scenario: Persistence across reloads
- **GIVEN** the visitor runs `theme gruvbox` and reloads the page
- **WHEN** the terminal mounts after reload
- **THEN** the active theme is `gruvbox`

#### Scenario: Corrupt or unknown stored value
- **GIVEN** `localStorage["ghpranav.dev:theme"]` is set to `"dracula"` (or any non-key string)
- **WHEN** the terminal mounts
- **THEN** the active theme is `espresso`
- **AND** no error is thrown

#### Scenario: localStorage unavailable
- **GIVEN** `localStorage` access throws (e.g., disabled storage, sandboxed iframe)
- **WHEN** the terminal mounts
- **THEN** the active theme is `espresso`
- **AND** no error is thrown to the caller

## ADDED Requirements

### Requirement: Theme persistence

Every time the active theme changes via the `setTheme` callback (including via the `theme <name>` command), the terminal SHALL write the new theme's registry key (a `ThemeName` string) to `localStorage` under the key `ghpranav.dev:theme`. The write SHALL be performed best-effort: if `localStorage` is unavailable or the write throws (private browsing quota, sandboxed iframe, etc.), the error SHALL be silently swallowed and the in-memory theme change SHALL still take effect.

The storage key SHALL be the exact literal `ghpranav.dev:theme`. This namespace SHALL NOT be shared with any other state.

#### Scenario: setTheme writes the new key
- **GIVEN** the active theme is `espresso`
- **WHEN** `setTheme(THEMES.nord)` is invoked
- **THEN** `localStorage["ghpranav.dev:theme"]` becomes `"nord"`

#### Scenario: Persisted value matches the registry key
- **GIVEN** the user runs `theme tokyo`
- **WHEN** the active theme switches
- **THEN** `localStorage["ghpranav.dev:theme"]` is `"tokyo"` (the registry key), not `"tokyo-night"` (the display `name`)

#### Scenario: Storage write failure is silent
- **GIVEN** `localStorage.setItem` throws (e.g., Safari private mode quota error)
- **WHEN** `setTheme(THEMES.nord)` is invoked
- **THEN** the active in-memory theme still becomes `nord`
- **AND** no error propagates to the caller or appears in the terminal output

#### Scenario: Namespaced key
- **WHEN** the persistence layer reads or writes the stored theme
- **THEN** it SHALL use the exact key `ghpranav.dev:theme`


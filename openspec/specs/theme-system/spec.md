# theme-system Specification

## Purpose

Defines how terminal colors are organized, switched, and propagated through the UI. The theme system is intentionally tiny — a single typed registry of theme objects, a single `setTheme` callback owned by `<Terminal />`, and a runtime `<style>` block whose values are interpolated from the active theme so theme switches happen live without a reload.
## Requirements
### Requirement: Theme shape

A theme SHALL be an object matching this exact shape (declared in `src/themes.ts`):

```
type Theme = {
  bg: string;
  panel: string;
  fg: string;
  dim: string;
  accent: string;
  accent2: string;
  error: string;
  prompt: string;
  cursor: string;
  grain: number;
  name: string;
};
```

All color fields SHALL be CSS color strings (typically 6-digit hex). The `grain` field SHALL be a number in `[0, 1]` representing the opacity of the SVG noise grain overlay. The `name` field SHALL be a human-readable display name that may differ from the registry key (for example, the `tokyo` key uses `name: "tokyo-night"`).

#### Scenario: Adding a new theme requires every field
- **WHEN** a developer adds a new theme to `THEMES`
- **THEN** TypeScript fails to compile if any required `Theme` field is missing or has the wrong type

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

### Requirement: `theme` command

The shell SHALL register a `theme` command that switches the active theme:

- `theme` with no argument SHALL return a `text` line of the form:
  ```
  usage: theme <name>
  available: <key1> · <key2> · ... · <keyN>
  current: <ctx.theme.name>
  ```
  listing the registry keys (not display names) separated by ` · ` and the current theme's `name` field.
- `theme <name>` where `<name>` is a key of `THEMES` SHALL call `ctx.setTheme(THEMES[name])` and return a `text` line `theme → <name>`.
- `theme <name>` where `<name>` is not a key of `THEMES` SHALL return an `error` line `theme: '<name>' not found`.

#### Scenario: Usage line
- **GIVEN** the terminal is in shell mode
- **WHEN** the user runs `theme`
- **THEN** a `text` line is appended showing usage, the five available keys separated by ` · `, and the current theme's name

#### Scenario: Valid switch
- **GIVEN** the active theme is `espresso`
- **WHEN** the user runs `theme nord`
- **THEN** `ctx.setTheme(THEMES.nord)` is invoked
- **AND** a `text` line `theme → nord` is appended

#### Scenario: Unknown theme
- **GIVEN** the active theme is `espresso`
- **WHEN** the user runs `theme dracula`
- **THEN** an `error` line `theme: 'dracula' not found` is appended
- **AND** `ctx.setTheme` is not invoked

### Requirement: Live theme switching

The terminal SHALL apply theme values via a runtime `<style>` block inside the `<Terminal />` render. Every theme-dependent CSS rule (window border, body padding/scrollbar, prompt color, cursor, link, grain, etc.) SHALL be interpolated from the active `Theme` object at render time. Theme changes SHALL apply to every theme-dependent surface (titlebar, body, scrollbar, cursor, links, grain overlay, prompt) without a page reload.

#### Scenario: Theme change re-renders the style block
- **GIVEN** the active theme is `espresso`
- **WHEN** `setTheme(THEMES.nord)` is invoked
- **THEN** the runtime `<style>` block re-renders with `nord` color values
- **AND** the page is not reloaded

#### Scenario: Scrollbar updates
- **GIVEN** the user switches themes while `.ptl-body` has overflow
- **WHEN** the runtime `<style>` block re-renders
- **THEN** the scrollbar thumb and track colors update to the new theme's `dim` and `panel` values

#### Scenario: Titlebar reflects active theme name
- **GIVEN** the user switches themes
- **WHEN** the titlebar re-renders
- **THEN** its subtitle ends with the new theme's `name` field

### Requirement: Tab completion for theme names

When the user's input begins with `theme ` followed by a (possibly empty) prefix, pressing Tab SHALL complete the prefix against the keys of `THEMES`. If exactly one key matches, the input SHALL become `theme <name>`. If zero or multiple keys match, the input SHALL be unchanged.

#### Scenario: Unique theme prefix
- **GIVEN** the input is `theme g`
- **WHEN** the user presses Tab
- **THEN** the input becomes `theme gruvbox`

#### Scenario: Empty theme argument lists nothing
- **GIVEN** the input is `theme `
- **WHEN** the user presses Tab
- **THEN** the input is unchanged (five themes share the empty prefix, no unique completion)

### Requirement: No CSS files for theming

Theme-dependent styles SHALL NOT live in a static CSS file. They SHALL be interpolated inside the `<Terminal />` component's runtime `<style>` block so they re-render on theme change. Static, theme-independent utility styles MAY live in `src/index.css`.

#### Scenario: Theming lives inside the component
- **GIVEN** the source tree under `src/`
- **WHEN** a developer searches for `theme.accent` (or any other theme field) in `.css` files
- **THEN** no matches are found
- **AND** the matches in `.tsx` files are all inside `<style>` blocks or inline `style` props

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

### Requirement: Theme text meets WCAG AA contrast

Every registered theme SHALL render text-bearing color roles at a contrast ratio of at least **4.5:1** against the background that role is actually drawn on. The role→background pairs that SHALL be enforced are:

- `fg` on `panel` — body output and input text
- `prompt` on `panel` — the shell prompt
- `accent2` on `panel` — the chat prompt
- `accent` on `panel` — links
- `error` on `panel` — error lines
- `dim` on `bg` — the titlebar subtitle
- `dim` on `panel` — tag chips and completion-candidate text
- `bg` on `accent` — the highlighted active completion candidate

Contrast SHALL be computed with the WCAG 2.x relative-luminance formula (sRGB). This requirement SHALL hold for `espresso`, `gruvbox`, `nord`, `tokyo`, and `paper`, and for any theme added later.

#### Scenario: Every theme passes AA for text roles
- **GIVEN** the `THEMES` registry
- **WHEN** each enforced role→background pair is evaluated for every theme
- **THEN** each computed contrast ratio is at least 4.5:1

#### Scenario: A new sub-AA theme fails the guardrail
- **GIVEN** a developer adds a new theme whose `dim` color is 3.0:1 against its `bg`
- **WHEN** the contrast test runs
- **THEN** the test fails and identifies the theme and the failing role→background pair

#### Scenario: Adjusted colors preserve hue
- **GIVEN** a color value is changed to meet the threshold
- **WHEN** the new value is compared to the old
- **THEN** only its lightness is materially changed and its hue keeps the theme recognizable (a legibility nudge, not a restyle)

### Requirement: Non-text UI contrast floor

Color roles used only for non-text UI affordances — the block `cursor`, the streaming cursor (`accent`), the scrollbar thumb (`dim`), window/panel borders, and the grain overlay — are exempt from the 4.5:1 text rule but SHALL meet at least the **3:1** contrast floor for UI components against their adjacent background where they convey state or boundary. Purely decorative overlays (the grain) MAY fall below 3:1.

#### Scenario: Cursor is distinguishable
- **GIVEN** any registered theme
- **WHEN** the block cursor or streaming cursor is drawn on its background
- **THEN** its contrast against that background is at least 3:1

#### Scenario: Decorative grain is exempt
- **GIVEN** the grain overlay rendered at the theme's `grain` opacity
- **WHEN** contrast is evaluated
- **THEN** the grain is treated as decorative and is not required to meet 3:1

### Requirement: Contrast-ratio utility and guardrail test

The theme module SHALL provide a pure, exported `contrastRatio(fg: string, bg: string): number` (with a supporting relative-luminance helper) implementing the WCAG sRGB formula, accepting hex color strings. A deterministic test SHALL iterate the `THEMES` registry against the enforced role→background→threshold table and assert each ratio, so a regression or a sub-threshold new theme fails the build. Because the utility is pure and side-effect-free, the test SHALL run by default (it SHALL NOT be gated behind the `E2E` flag).

#### Scenario: Utility computes a known ratio
- **GIVEN** `contrastRatio("#000000", "#ffffff")`
- **WHEN** it is evaluated
- **THEN** it returns 21 (the maximum), within a small floating-point tolerance

#### Scenario: Utility is symmetric
- **GIVEN** any two colors `a` and `b`
- **WHEN** `contrastRatio(a, b)` and `contrastRatio(b, a)` are compared
- **THEN** they are equal (order-independent)

#### Scenario: Guardrail runs in the default suite
- **GIVEN** the repository test command `bun run test`
- **WHEN** it runs without `E2E` set
- **THEN** the contrast guardrail test executes and reports pass/fail per theme

### Requirement: Static shell theme table stays in sync with THEMES registry

The `index.html` pre-loader script SHALL embed a theme table whose values mirror the `THEMES` registry: every color role present in both (`bg`, `panel`, `fg`, `dim`, `accent2`, `grain`) SHALL be identical, the derived RGB triplets (`bgRgb` for `bg`, `dimRgb` for `dim`) SHALL equal their decimal R, G, B decomposition, and every theme present in `THEMES` SHALL have a matching entry in the table. When any synced color role changes in `src/themes/<name>.ts`, the corresponding entry in `index.html` SHALL be updated in the same commit. When a new theme is added to `THEMES`, a matching entry SHALL be added to the static shell table. A guardrail test SHALL verify this sync so that drift is caught before it ships.

#### Scenario: Static shell matches THEMES registry
- **GIVEN** the `THEMES` registry and the static shell theme table in `index.html`
- **WHEN** the sync guardrail runs
- **THEN** every synced color field in the static shell matches the corresponding `THEMES` value for every registered theme, and every RGB triplet matches the hex decomposition

#### Scenario: Drift is caught
- **GIVEN** a developer changes `dim` in `src/themes/nord.ts` but forgets to update `index.html`
- **WHEN** `bun run test` runs
- **THEN** the sync guardrail fails, naming the theme and the mismatched field


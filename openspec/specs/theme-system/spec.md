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

The module `src/themes.ts` SHALL export a single registry `THEMES` containing exactly these keys, in this order: `espresso`, `gruvbox`, `nord`, `tokyo`, `paper`. The registry SHALL be typed `as const satisfies Record<string, Theme>` so each entry's shape is enforced and the keys are statically known. The module SHALL also export a `ThemeName` type alias equal to `keyof typeof THEMES`.

#### Scenario: Registered themes
- **GIVEN** the `THEMES` registry
- **WHEN** its keys are listed
- **THEN** the result is exactly `["espresso", "gruvbox", "nord", "tokyo", "paper"]`

#### Scenario: ThemeName is keyof THEMES
- **WHEN** a consumer imports `ThemeName`
- **THEN** the type accepts only the five registered keys

### Requirement: Initial theme

The terminal SHALL initialize the active theme to `THEMES.espresso` on every fresh mount. There SHALL NOT be a persistence layer (no `localStorage`, `sessionStorage`, cookie, or query parameter) that restores a previously-selected theme across reloads.

#### Scenario: Default theme on first load
- **GIVEN** a visitor loads the site for the first time
- **WHEN** the terminal mounts
- **THEN** the active theme is `espresso`

#### Scenario: No persistence across reloads
- **GIVEN** the visitor switches to `gruvbox` and reloads the page
- **WHEN** the terminal mounts after reload
- **THEN** the active theme is `espresso` again

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

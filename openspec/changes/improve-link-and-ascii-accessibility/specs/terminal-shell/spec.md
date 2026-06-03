## MODIFIED Requirements

### Requirement: Visible keyboard focus indicator

The terminal SHALL provide a visible focus indicator appropriate to each kind of focusable element. The guarantee is that a keyboard user can always tell what is focused — implemented differently for the always-focused command input than for interactive controls.

The command **input** SHALL use its blinking block caret (via `caret-color`) as its focus affordance and SHALL NOT draw a focus outline. This is intentional: the terminal auto-focuses the input on mount and refocuses it on window click, so the input is effectively always focused; a `:focus-visible` outline would therefore render as a persistent box on page load and break the terminal aesthetic. The caret is the terminal-native focus indicator and is retained.

Interactive **links and other actionable controls** (e.g. the `.ptl-link` contact links) SHALL show a visible, theme-aware `:focus-visible` outline derived from `theme.accent` when focused via keyboard, and SHALL NOT draw an intrusive outline for pointer focus. This indicator SHALL update live on theme change, consistent with the rest of the runtime `<style>` block.

#### Scenario: Input focus is shown by the caret, not an outline

- **GIVEN** the command input is focused (including the auto-focus on load)
- **WHEN** the input has focus
- **THEN** no focus outline box is drawn around the input
- **AND** the blinking caret indicates the active input target

#### Scenario: Keyboard focus on a link shows a themed outline

- **GIVEN** a keyboard user tabs to an interactive link (e.g. a contact link)
- **WHEN** the link receives keyboard focus
- **THEN** a visible `:focus-visible` outline derived from the active theme's accent color is shown around the link

#### Scenario: Pointer focus on a link stays clean

- **GIVEN** a pointer user
- **WHEN** the user clicks a link
- **THEN** the intrusive `:focus-visible` outline is not drawn for the pointer interaction

#### Scenario: Link focus indicator follows the theme

- **GIVEN** a link is focused via keyboard
- **WHEN** the user switches themes
- **THEN** the focus outline color updates to the new theme's accent without a page reload

## ADDED Requirements

### Requirement: Decorative ASCII banner has a text alternative

ASCII art rendered by the `ascii` line variant SHALL NOT be exposed to assistive technology as raw characters. The `<pre>` element that renders the art SHALL carry `aria-hidden="true"` so screen readers do not announce the individual glyphs.

When the art represents meaningful text (notably the `ASCII_NAME` banner, which spells the name), the `ascii` line SHALL carry a text alternative (an optional `alt` field) that is rendered as visually-hidden text adjacent to the `<pre>`, so a screen reader announces the meaningful text (e.g. "Pranav") instead of the ASCII glyphs. The visually-hidden text SHALL use a technique that keeps it in the accessibility tree (e.g. clip-rect `.sr-only`), not `display:none`/`visibility:hidden`.

Purely decorative ASCII art with no text alternative SHALL be `aria-hidden` with no spoken alternative. The visible rendering of all ASCII art SHALL be unchanged.

#### Scenario: Name banner is announced as text

- **GIVEN** a screen reader is active during the boot sequence
- **WHEN** the `ASCII_NAME` banner line is rendered
- **THEN** the screen reader announces the text alternative (e.g. "Pranav")
- **AND** it does not announce the individual ASCII glyphs

#### Scenario: The pre element is hidden from assistive tech

- **GIVEN** any `ascii` line is rendered
- **WHEN** the `<pre>` containing the art is inspected
- **THEN** it carries `aria-hidden="true"`

#### Scenario: Decorative art without an alternative is silent

- **GIVEN** an `ascii` line with no `alt` text alternative
- **WHEN** a screen reader reaches it
- **THEN** nothing is announced for the decorative art

#### Scenario: Visible rendering is unchanged

- **GIVEN** any viewport and theme
- **WHEN** an `ascii` line renders
- **THEN** its visible appearance is identical to before the text alternative was added

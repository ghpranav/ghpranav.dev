## ADDED Requirements

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

## ADDED Requirements

### Requirement: Screen-reader live region over output

The scrollable terminal body (`.ptl-body`) SHALL be exposed as a polite live region so assistive technology announces output as it appears. The element SHALL carry `role="log"`, `aria-live="polite"`, and `aria-relevant="additions"`. Newly appended lines — including command output, error lines, and the `ask` consent/choice prompts — SHALL be announced without requiring the user to navigate to them.

For the streamed `chat-assistant` line, the terminal SHALL NOT cause a per-character announcement. The streaming text SHALL be announced as coherent chunks: while tokens are still arriving the in-progress line MAY be withheld from the live-region announcement, and the completed answer SHALL be announced once the stream finalizes. The visual token-by-token rendering SHALL be unchanged.

#### Scenario: New output line is announced
- **GIVEN** a screen reader is active and the terminal is in shell mode
- **WHEN** the user runs a command that appends an output line
- **THEN** the appended line is announced via the polite live region without the user moving focus

#### Scenario: Streamed answer is announced as coherent text
- **GIVEN** a screen reader is active and the user has submitted a question in chat mode
- **WHEN** the model streams its answer token by token
- **THEN** the live region does not announce each individual token
- **AND** the finalized answer is announced once streaming completes

#### Scenario: Consent prompt is announced
- **GIVEN** a screen reader is active and `ask` shows a download consent or engine-choice prompt
- **WHEN** the prompt line is appended
- **THEN** it is announced via the live region

### Requirement: Input does not trigger mobile zoom

The terminal input (`input.ptl-input`) SHALL render with a computed `font-size` of at least 16px so that focusing it on iOS Safari does not zoom the viewport or shift the layout. This font-size SHALL be decoupled from the 14px root/output font-size, which remains unchanged for output density.

#### Scenario: Focusing the input on iOS does not zoom
- **GIVEN** the site is open in mobile Safari
- **WHEN** the user taps the terminal input to focus it
- **THEN** the viewport does not zoom in and the layout does not shift
- **AND** the input's computed font-size is at least 16px

#### Scenario: Output text density is preserved
- **GIVEN** any viewport
- **WHEN** the terminal renders output lines
- **THEN** output text continues to use the 14px root font-size, unaffected by the input's font-size

### Requirement: Input avoids mobile auto-mangling

The terminal input SHALL disable mobile text assistance that would corrupt shell commands. The input element SHALL set `autoCapitalize="off"`, `autoCorrect="off"`, `autoComplete="off"`, and `spellCheck={false}`, and SHALL declare an `inputMode` appropriate for command/text entry. Typing a lowercase command on a mobile keyboard SHALL NOT auto-capitalize its first letter or autocorrect it to a different word.

#### Scenario: Lowercase command is not capitalized
- **GIVEN** the site is open on a mobile browser with auto-capitalization enabled by default
- **WHEN** the user types `whoami` into the input
- **THEN** the value remains `whoami` and is not transformed to `Whoami`

#### Scenario: Command is not autocorrected
- **GIVEN** the site is open on a mobile browser with autocorrect enabled by default
- **WHEN** the user types a command token that resembles a misspelled word
- **THEN** the value is not silently replaced by an autocorrected word

### Requirement: Visible keyboard focus indicator

The terminal input SHALL present a visible focus indicator to keyboard users. The input SHALL NOT suppress its focus indicator unconditionally; instead it SHALL show a theme-aware `:focus-visible` outline (derived from `theme.accent`) when focused via keyboard, while not drawing an intrusive outline for pointer focus. The indicator SHALL update live on theme change, consistent with the rest of the runtime `<style>` block.

#### Scenario: Keyboard focus shows an outline
- **GIVEN** a keyboard user tabs to or otherwise focuses the input via keyboard
- **WHEN** the input receives focus
- **THEN** a visible focus outline derived from the active theme's accent color is shown

#### Scenario: Focus indicator follows the theme
- **GIVEN** the input is focused via keyboard
- **WHEN** the user switches themes
- **THEN** the focus outline color updates to the new theme's accent without a page reload

### Requirement: Reduced-motion is respected across animation and scrolling

When the user's system requests reduced motion (`prefers-reduced-motion: reduce`), the terminal SHALL suppress non-essential motion. The decorative keyframe animations (`blink` cursor, `fadeIn` line entrance, `pulse` streaming cursor) SHALL be neutralized via the global reduced-motion reset, and the auto-scroll behavior that follows new output SHALL use instant (`behavior: "auto"`) scrolling instead of smooth scrolling. Content and command behavior SHALL be unchanged; only the motion is removed.

#### Scenario: Animations are neutralized under reduced motion
- **GIVEN** the OS is set to reduce motion
- **WHEN** the terminal renders the cursor, appends a line, or streams a response
- **THEN** the `blink`, `fadeIn`, and `pulse` animations do not visibly animate

#### Scenario: Auto-scroll is instant under reduced motion
- **GIVEN** the OS is set to reduce motion and the user is at the bottom of the scroll region
- **WHEN** new output is appended
- **THEN** the scroll position jumps to the newest line instantly rather than smooth-scrolling

#### Scenario: Smooth scrolling retained without the preference
- **GIVEN** the OS does not request reduced motion and the user is at the bottom of the scroll region
- **WHEN** new output is appended
- **THEN** the scroll position moves with smooth behavior, as before

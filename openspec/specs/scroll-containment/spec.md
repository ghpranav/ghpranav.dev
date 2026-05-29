## ADDED Requirements

### Requirement: Terminal body is a contained scroll region
The `.ptl-body` element SHALL be a scroll container with `overflow-y: auto` and a viewport-relative max-height. The page body SHALL NOT scroll — only the terminal body region scrolls.

#### Scenario: Content exceeds viewport height
- **GIVEN** the terminal has output lines that exceed the visible height of `.ptl-body`
- **WHEN** the content is rendered
- **THEN** `.ptl-body` displays a vertical scrollbar and the page (`document.body`) has no scrollbar

#### Scenario: Content fits within viewport
- **GIVEN** the terminal has few lines that fit within `.ptl-body`
- **WHEN** the content is rendered
- **THEN** no scrollbar appears on `.ptl-body` and the page has no scrollbar

#### Scenario: Terminal fills viewport
- **GIVEN** the page is loaded at any viewport size
- **WHEN** the terminal renders
- **THEN** the `.ptl-window` (titlebar + body) fills the viewport height minus outer margins, with no content clipped

### Requirement: Auto-scroll to bottom on new output
The terminal SHALL automatically scroll `.ptl-body` to the bottom whenever new content is appended (new lines, streaming token updates, user input echo).

#### Scenario: Command produces output
- **GIVEN** the user is at the bottom of the scroll region
- **WHEN** a command appends output lines
- **THEN** the scroll position moves to show the newest line at the bottom

#### Scenario: Streaming chat tokens
- **GIVEN** the user is in chat mode and auto-scroll is active
- **WHEN** the LLM streams tokens that update the last line
- **THEN** the scroll position follows the growing content to stay at the bottom

#### Scenario: Boot sequence
- **GIVEN** the terminal is loading
- **WHEN** the boot sequence appends lines with staggered delays
- **THEN** the scroll position follows each new line to the bottom

### Requirement: Pause auto-scroll when user scrolls up
The terminal SHALL stop auto-scrolling when the user manually scrolls away from the bottom, so they can read earlier output without it being pulled away.

#### Scenario: User scrolls up during output
- **GIVEN** the terminal is producing output (e.g. streaming a chat response)
- **WHEN** the user scrolls up more than 50px from the bottom
- **THEN** auto-scroll pauses and new output does NOT move the scroll position

#### Scenario: User scrolls back to bottom
- **GIVEN** auto-scroll is paused because the user scrolled up
- **WHEN** the user scrolls back to within 50px of the bottom
- **THEN** auto-scroll resumes and new output moves the scroll position to the bottom

#### Scenario: Clear command resets scroll state
- **GIVEN** auto-scroll is paused and the user runs `clear`
- **WHEN** lines are emptied
- **THEN** auto-scroll re-enables (the container has no overflow, so the threshold check naturally passes)

### Requirement: Themed scrollbar styling
The scrollbar within `.ptl-body` SHALL be styled to match the active terminal theme.

#### Scenario: Scrollbar matches theme colors
- **GIVEN** the user is on any theme (espresso, gruvbox, nord, tokyo, paper)
- **WHEN** `.ptl-body` has overflow content
- **THEN** the scrollbar thumb uses the theme's `dim` color and the track uses the theme's `panel` color

#### Scenario: Scrollbar is narrow
- **GIVEN** the terminal has overflow content
- **WHEN** the scrollbar is visible
- **THEN** the scrollbar width is 6px (thin) to minimize visual intrusion

#### Scenario: Theme switch updates scrollbar
- **GIVEN** the user switches themes via the `theme` command
- **WHEN** the runtime `<style>` block re-renders
- **THEN** scrollbar colors update to match the new theme without a page reload

### Requirement: Mobile scroll behavior
The scroll container SHALL work correctly on mobile viewports with touch scrolling.

#### Scenario: Touch scroll on mobile
- **GIVEN** a user on a mobile device with a viewport under 600px wide
- **WHEN** they touch-drag up within `.ptl-body`
- **THEN** the terminal body scrolls and auto-scroll pauses, same as desktop

#### Scenario: Mobile viewport height
- **GIVEN** a mobile viewport
- **WHEN** the terminal renders
- **THEN** the `.ptl-body` height adjusts for the reduced margins (8px instead of 24px) and the scroll container fills available space

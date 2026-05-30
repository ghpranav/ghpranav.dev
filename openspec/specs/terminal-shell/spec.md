# terminal-shell Specification

## Purpose

Defines the core terminal UI of ghpranav.dev. The terminal shell owns all session state and is the single host for: the boot sequence, the two prompts (shell and chat), keyboard input handling, command history, output line rendering, scroll-region behavior, and mobile layout. Every other piece of the site is composed inside it.

## Requirements

### Requirement: Single-component shell

The site SHALL mount exactly one `<Terminal />` component from `src/App.tsx`. That component SHALL own all terminal session state: the rendered lines, the in-memory command history, the current input value, the history-cursor index, the active theme, the chat-mode flag, the active chat session, and the streaming flag. No other component SHALL hold terminal session state.

#### Scenario: App renders one terminal
- **GIVEN** the site is loading
- **WHEN** `App.tsx` renders
- **THEN** exactly one `<Terminal />` element is mounted and no other terminal-bearing components are rendered

### Requirement: Boot sequence

On first mount, the terminal SHALL render a staggered boot sequence consisting of:

- five `boot`-type lines whose text begins with `[ ok ]`, appended at 100ms, 260ms, 400ms, 560ms, and 720ms after mount
- an `ascii`-type line containing the project's `ASCII_NAME` banner at 880ms
- a `text`-type welcome line at 1020ms

The interactive input prompt SHALL appear only after the boot sequence completes (approximately 1100ms after mount). The boot sequence SHALL run at most once per mount, guarded by a `booted` flag.

#### Scenario: Fresh visit
- **GIVEN** the user navigates to the site for the first time in the session
- **WHEN** the terminal first mounts
- **THEN** five `[ ok ]` boot lines appear in sequence at the documented delays
- **AND** the ASCII name banner appears at 880ms
- **AND** a welcome line referencing `help` and `ask` appears at 1020ms
- **AND** the input prompt becomes interactive at ~1100ms

#### Scenario: Effect re-run does not re-boot
- **GIVEN** the boot sequence has already completed once
- **WHEN** the boot effect re-runs (e.g. React strict mode, hot reload)
- **THEN** the staggered boot lines do not append a second time

### Requirement: Two prompt modes

The terminal SHALL render one of two prompts at any time:

- **Shell mode**: `pranav@dev:~$`, colored with `theme.prompt`
- **Chat mode**: `pranav-chat>`, colored with `theme.accent2`

The titlebar subtitle SHALL read `zsh` in shell mode and `ai (on-device)` in chat mode, both followed by the active theme name.

The terminal SHALL enter chat mode when a command invokes `ctx.enterChat(...)`. The terminal SHALL return to shell mode when the user submits `/exit` or `exit` while in chat mode.

#### Scenario: Default prompt after boot
- **GIVEN** the terminal has finished booting and no chat session is active
- **WHEN** the input prompt is rendered
- **THEN** the prompt text is `pranav@dev:~$`
- **AND** the titlebar reads `pranav@dev — zsh — <theme>`

#### Scenario: Entering chat mode
- **GIVEN** the terminal is in shell mode
- **WHEN** a command calls `ctx.enterChat(...)` (e.g. the user runs `ask`)
- **THEN** the prompt becomes `pranav-chat>`
- **AND** the titlebar subtitle becomes `ai (on-device)`

#### Scenario: Leaving chat mode
- **GIVEN** the terminal is in chat mode
- **WHEN** the user submits `/exit` or `exit`
- **THEN** the prompt returns to `pranav@dev:~$`
- **AND** a `→ exited chat. back to shell.` text line is appended

### Requirement: Input submission

When the user presses Enter, the terminal SHALL:

1. Append an `input`-type line containing the raw text, the current prompt string, and the current chat-mode flag.
2. If the trimmed input is non-empty, push it onto the in-memory history list and reset the history cursor to `-1`.
3. Dispatch the trimmed input — in chat mode to the chat handler, in shell mode to the command registry.

Empty or whitespace-only input SHALL be echoed as an `input` line but produce no further action.

#### Scenario: Successful shell command
- **GIVEN** the terminal is in shell mode
- **WHEN** the user types `whoami` and presses Enter
- **THEN** an `input` line with prompt `pranav@dev:~$` and text `whoami` is appended
- **AND** `whoami` is appended to history
- **AND** the registered `whoami` command runs and its returned line is appended

#### Scenario: Empty submission
- **GIVEN** the terminal is in shell mode
- **WHEN** the user presses Enter with only whitespace in the input
- **THEN** an `input` line is appended showing only the prompt
- **AND** history is unchanged
- **AND** no command runs

### Requirement: History navigation

The terminal SHALL maintain an in-memory list of every non-empty trimmed command submitted in the current session. The list SHALL NOT be persisted across reloads.

When ArrowUp is pressed:

- if history is empty, nothing happens
- if the cursor is `-1`, it moves to the last index and the input is set to that entry
- otherwise the cursor decrements (clamped at 0) and the input is set to the entry at the new cursor

When ArrowDown is pressed:

- if the cursor is `-1`, nothing happens
- if incrementing the cursor moves past the last entry, the cursor resets to `-1` and the input is cleared
- otherwise the cursor increments and the input is set to the entry at the new cursor

#### Scenario: ArrowUp recalls most-recent entry
- **GIVEN** the user has submitted `whoami` then `skills`
- **WHEN** the user presses ArrowUp with the input empty
- **THEN** the input becomes `skills`

#### Scenario: ArrowUp twice walks further back
- **GIVEN** the same history
- **WHEN** the user presses ArrowUp a second time
- **THEN** the input becomes `whoami`

#### Scenario: ArrowDown past end resets
- **GIVEN** the input shows the most-recent history entry
- **WHEN** the user presses ArrowDown
- **THEN** the input is cleared
- **AND** the history cursor resets to `-1`

#### Scenario: History is session-scoped
- **GIVEN** the user has submitted several commands
- **WHEN** the page is reloaded
- **THEN** the new session's history list is empty

### Requirement: Tab completion

In shell mode, when the user presses Tab the terminal SHALL prevent the default Tab behavior and:

- if the input is a single token, find all keys of the dispatch table (primary names and aliases) starting with that token. If exactly one matches, replace the input with that name followed by a space. If multiple match, echo the partial input as an `input` line then append a `text` line listing the matches separated by three spaces.
- if the input begins with the token `theme`, complete the second token against the keys of `THEMES`. If exactly one matches, replace the input with `theme <name>`.

Tab SHALL be a no-op in chat mode.

#### Scenario: Unique command completion
- **GIVEN** the input is `the`
- **WHEN** the user presses Tab
- **THEN** the input becomes `theme ` (trailing space)

#### Scenario: Multiple completion candidates
- **GIVEN** the input is `s`
- **WHEN** the user presses Tab
- **THEN** an `input` line echoes the partial input
- **AND** a `text` line lists all command names whose key starts with `s`, separated by whitespace

#### Scenario: Theme-name completion
- **GIVEN** the input is `theme g`
- **WHEN** the user presses Tab
- **THEN** the input becomes `theme gruvbox`

#### Scenario: Tab in chat mode is inert
- **GIVEN** the terminal is in chat mode
- **WHEN** the user presses Tab
- **THEN** the input is unchanged and no lines are appended

### Requirement: Keyboard shortcuts

The terminal SHALL handle the following keyboard shortcuts in addition to Enter / Tab / ArrowUp / ArrowDown:

- **Ctrl+L**: clears all rendered lines.
- **Ctrl+C while an LLM stream is in flight**: invokes `abort()` on the active stream's `AbortController`.
- **Ctrl+C otherwise**: appends an `input` line whose text is the current input with `^C` appended, then clears the input field.

#### Scenario: Ctrl+L clears
- **GIVEN** the terminal has many lines of output
- **WHEN** the user presses Ctrl+L
- **THEN** all rendered lines are removed

#### Scenario: Ctrl+C cancels a running stream
- **GIVEN** an LLM response is currently streaming tokens
- **WHEN** the user presses Ctrl+C
- **THEN** the shared `AbortController` is aborted
- **AND** the stream loop ends with an `AbortError`
- **AND** a `  (cancelled)` text line is appended

#### Scenario: Ctrl+C with pending input
- **GIVEN** the user has typed `whoa` but not pressed Enter, and no stream is active
- **WHEN** the user presses Ctrl+C
- **THEN** an `input` line is appended showing the current prompt followed by `whoa^C`
- **AND** the input field clears

### Requirement: Click-to-focus

The terminal SHALL keep keyboard focus on the input element. A click anywhere on `window` SHALL refocus the input.

#### Scenario: Click outside the input refocuses it
- **GIVEN** the input has lost focus (the user clicked elsewhere on the page)
- **WHEN** the user clicks anywhere within the terminal or page background
- **THEN** the input regains focus

### Requirement: Output line variants

Every terminal output SHALL be a value of the `TerminalLine` discriminated union, with `type` as the discriminator. The `Line` component (`src/components/Line.tsx`) SHALL switch on `type` to render the appropriate layout. The union SHALL include exactly the following variants: `boot`, `text`, `error`, `ascii`, `segments`, `input`, `chat-assistant`, `help`, `skills`, `projects`, `contact`, `history`.

#### Scenario: Every variant renders
- **GIVEN** a line of any supported variant is appended
- **WHEN** `Line` renders it
- **THEN** the corresponding `case` arm produces the layout described in `Line.tsx` (colored prompt, ASCII pre block, tag chips, etc.)

#### Scenario: Adding a new line kind requires both type and renderer
- **WHEN** a developer adds a new variant `foo` to `TerminalLine`
- **THEN** they also add a matching `case "foo":` arm to `Line.tsx`
- **AND** TypeScript exhaustiveness checking flags the missing arm otherwise

### Requirement: Terminal body is a contained scroll region

The `.ptl-body` element SHALL be the only scroll container in the page. It SHALL set `overflow-y: auto`, `flex: 1`, and `min-height: 0` so it grows to fill the window minus the titlebar. The page body SHALL NOT scroll.

The outer `.ptl-window` element SHALL be sized to `min(calc(100vh - 48px), 800px)` (also using `100dvh` for mobile) with width `min(1024px, 100vw - 48px)`, centered in the viewport.

#### Scenario: Content exceeds viewport
- **GIVEN** the terminal has output lines that exceed the visible height of `.ptl-body`
- **WHEN** the content is rendered
- **THEN** `.ptl-body` displays a vertical scrollbar
- **AND** `document.body` does not scroll

#### Scenario: Content fits within viewport
- **GIVEN** the terminal has few lines that fit
- **WHEN** the content is rendered
- **THEN** no scrollbar appears on `.ptl-body`
- **AND** no scrollbar appears on the page

#### Scenario: Window fills the viewport
- **GIVEN** the page is loaded at any supported viewport size
- **WHEN** the terminal renders
- **THEN** `.ptl-window` fills the viewport height minus the configured outer margin
- **AND** no rendered content is clipped outside the window

### Requirement: Auto-scroll follows new output

The terminal SHALL scroll `.ptl-body` to the bottom whenever its `lines` state changes, using smooth scroll behavior — unless the user has manually scrolled away from the bottom.

The terminal SHALL consider the user "scrolled away" when `scrollTop + clientHeight < scrollHeight - 50` (i.e. more than 50px above the bottom). While scrolled away, auto-scroll SHALL be suppressed. Once the user scrolls back to within 50px of the bottom, auto-scroll SHALL resume.

#### Scenario: New output scrolls into view
- **GIVEN** the user is at the bottom of the scroll region
- **WHEN** a command appends output lines
- **THEN** the scroll position smoothly moves so the newest line is visible at the bottom

#### Scenario: Streaming tokens follow the bottom
- **GIVEN** the user is in chat mode and auto-scroll is active
- **WHEN** the LLM streams tokens that mutate the last `chat-assistant` line
- **THEN** the scroll position follows the growing content

#### Scenario: User scrolls up
- **GIVEN** auto-scroll is active and content is streaming
- **WHEN** the user scrolls more than 50px above the bottom
- **THEN** auto-scroll pauses
- **AND** subsequent new lines do not change the scroll position

#### Scenario: User scrolls back to bottom
- **GIVEN** auto-scroll is paused because the user scrolled up
- **WHEN** the user scrolls back to within 50px of the bottom
- **THEN** auto-scroll resumes and subsequent new lines scroll into view

#### Scenario: Clear resets scroll state
- **GIVEN** auto-scroll is paused and the user runs `clear` (or presses Ctrl+L)
- **WHEN** the lines list is emptied
- **THEN** the scroll container has no overflow, the threshold check naturally passes, and auto-scroll is effectively re-enabled

### Requirement: Themed scrollbar

The scrollbar within `.ptl-body` SHALL be styled to match the active terminal theme. The thumb SHALL use `theme.dim` and the track SHALL use `theme.panel`. The scrollbar SHALL be visually narrow (6px wide in WebKit) to minimize visual intrusion. Theme switches SHALL update scrollbar colors live, without a page reload.

#### Scenario: Scrollbar uses theme colors
- **GIVEN** the user is on any of the registered themes
- **WHEN** `.ptl-body` has overflow content
- **THEN** the scrollbar thumb is `theme.dim` and the track is `theme.panel`

#### Scenario: Narrow scrollbar
- **GIVEN** the terminal has overflow content
- **WHEN** the scrollbar is visible in a WebKit browser
- **THEN** its width is 6px

#### Scenario: Theme switch updates scrollbar
- **GIVEN** the user switches themes via the `theme` command
- **WHEN** the runtime `<style>` block re-renders
- **THEN** the scrollbar thumb and track colors update to match the new theme without a page reload

### Requirement: Mobile responsiveness

For viewports under 600px wide, the terminal SHALL reduce the window's outer margin so `.ptl-window` is sized to `calc(100vw - 16px)` and `calc(100dvh - 16px)`, reduce `.ptl-body` padding to `14px 14px 60px`, and reduce the window's border radius to 6px. All other interactive behavior SHALL be identical to desktop.

#### Scenario: Mobile window sizing
- **GIVEN** a viewport width below 600px
- **WHEN** the terminal renders
- **THEN** `.ptl-window` is sized with 8px outer margins on each side
- **AND** `.ptl-body` padding is reduced
- **AND** the window border radius is 6px

#### Scenario: Touch-scroll matches desktop
- **GIVEN** a mobile user touch-drags up within `.ptl-body`
- **WHEN** the drag exceeds 50px from the bottom
- **THEN** auto-scroll pauses, identical to desktop scroll behavior

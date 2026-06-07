## MODIFIED Requirements

### Requirement: Two prompt modes

The terminal SHALL render one of two prompts at any time:

- **Shell mode**: `ghpranav@dev:<cwd>$`, colored with `theme.prompt`, where `<cwd>` is the current working directory abbreviated so the home directory renders as `~` (e.g. `ghpranav@dev:~$` at home, `ghpranav@dev:~/projects$` inside `projects/`). The displayed path SHALL update live as the `cd` command changes the working directory.
- **Chat mode**: `pranav-chat>`, colored with `theme.accent2`

The titlebar subtitle SHALL read `zsh` in shell mode and `ai (on-device)` in chat mode, both followed by the active theme name.

The terminal SHALL enter chat mode when a command invokes `ctx.enterChat(...)`. The terminal SHALL return to shell mode when the user submits `/exit` or `exit` while in chat mode. Returning to shell mode SHALL NOT reset the working directory.

#### Scenario: Default prompt after boot
- **GIVEN** the terminal has finished booting and no chat session is active
- **WHEN** the input prompt is rendered
- **THEN** the prompt text is `ghpranav@dev:~$`
- **AND** the titlebar reads `ghpranav@dev — zsh — <theme>`

#### Scenario: Prompt reflects the working directory
- **GIVEN** the terminal is in shell mode at the home directory
- **WHEN** the user runs `cd projects`
- **THEN** the prompt becomes `ghpranav@dev:~/projects$`
- **AND** running `cd ~` (or `cd` with no argument) returns the prompt to `ghpranav@dev:~$`

#### Scenario: Entering chat mode
- **GIVEN** the terminal is in shell mode
- **WHEN** a command calls `ctx.enterChat(...)` (e.g. the user runs `ask`)
- **THEN** the prompt becomes `pranav-chat>`
- **AND** the titlebar subtitle becomes `ai (on-device)`

#### Scenario: Leaving chat mode
- **GIVEN** the terminal is in chat mode
- **WHEN** the user submits `/exit` or `exit`
- **THEN** the prompt returns to the shell-mode prompt for the current working directory
- **AND** a `→ exited chat. back to shell.` text line is appended

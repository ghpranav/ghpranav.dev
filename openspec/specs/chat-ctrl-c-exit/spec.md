# chat-ctrl-c-exit Specification

## Purpose

Defines the double-Ctrl+C gesture for exiting chat mode. In chat mode, pressing Ctrl+C when the model is idle does nothing useful — this spec codifies the familiar two-press exit pattern (as seen in Claude Code, `python3` REPL, etc.) so chat mode behaves like a real interactive session. Applies to all chat-entry phases: idle chat, consent prompt, and model-loading phase.

## Requirements

### Requirement: First Ctrl+C arms exit countdown
While in chat mode and the model is not streaming, pressing Ctrl+C SHALL clear the current input, show an ephemeral hint `(ctrl-c again to exit)` in a muted color below the input row (not written to scrollback history), and start a 2-second countdown. If no second Ctrl+C arrives within 2 seconds, the hint SHALL disappear silently with no history entry added.

#### Scenario: First press shows ephemeral hint
- **WHEN** the user presses Ctrl+C in chat mode while the model is idle
- **THEN** the input is cleared, and a muted hint `(ctrl-c again to exit)` appears below the input row without adding any line to the scrollback history

#### Scenario: Countdown resets after 2 seconds
- **WHEN** the user presses Ctrl+C once and waits more than 2 seconds
- **THEN** the hint disappears and a subsequent Ctrl+C shows the hint again rather than exiting

### Requirement: Second Ctrl+C within window exits chat
If Ctrl+C is pressed a second time while the countdown is active (within 2 seconds of the first press), the terminal SHALL call `leaveChat()`, append `^C` to the terminal, and return to the shell prompt.

#### Scenario: Double press exits
- **WHEN** the user presses Ctrl+C twice within 2 seconds while in idle chat mode
- **THEN** chat mode ends and the shell prompt is restored

#### Scenario: Only second press writes to history
- **WHEN** the user presses Ctrl+C twice within 2 seconds
- **THEN** exactly one `^C` input line is added to scrollback (on the second press), and the first press leaves no history entry

### Requirement: Streaming Ctrl+C is unaffected
While the model is actively streaming a response, Ctrl+C SHALL cancel the stream (existing behavior). The pending-exit countdown SHALL be cleared if it happens to be armed at the time.

#### Scenario: Stream cancel clears pending exit
- **WHEN** a pending-exit countdown is active and the user presses Ctrl+C while streaming starts
- **THEN** the stream is cancelled and the pending-exit countdown is cleared

### Requirement: leaveChat clears pending exit timer
Calling `leaveChat()` by any means (double Ctrl+C, `/exit` command, or programmatic) SHALL clear any active pending-exit countdown timer.

#### Scenario: /exit clears timer
- **WHEN** a pending-exit countdown is active and the user types `/exit`
- **THEN** chat mode ends and no dangling timeout fires

### Requirement: Loading-phase Ctrl+C follows the same two-press pattern
During model detection or download (when the text input is unmounted), pressing Ctrl+C SHALL arm the same 2-second countdown and show the same hint. A second press within 2 seconds SHALL abort the load and call `leaveChat()` explicitly.

#### Scenario: Double press during loading aborts and exits
- **WHEN** the model is loading and the user presses Ctrl+C twice within 2 seconds
- **THEN** the load is aborted and chat mode ends cleanly

### Requirement: Consent-phase Ctrl+C follows the same two-press pattern
During the consent prompt (before the model session starts), pressing Ctrl+C SHALL behave identically to idle chat mode: first press shows the hint, second press within 2 seconds calls `leaveChat()`.

#### Scenario: Double press during consent exits
- **WHEN** the consent prompt is active and the user presses Ctrl+C twice within 2 seconds
- **THEN** chat mode ends and the shell prompt is restored

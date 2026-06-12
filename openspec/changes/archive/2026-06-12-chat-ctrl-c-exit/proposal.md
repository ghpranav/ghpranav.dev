## Why

In chat mode, pressing Ctrl+C when the model is idle does nothing useful — it echoes `^C` and clears the input, leaving the user with no obvious escape hatch unless they know about `/exit`. This adds the familiar double-Ctrl+C exit pattern (as seen in Claude Code, `python3` REPL, etc.) so chat mode behaves like a real interactive session.

## What Changes

- First Ctrl+C while idle in chat mode (not streaming) prints `^C` and shows a hint: `  (press ctrl-c again to exit)`, then starts a 2-second countdown.
- Second Ctrl+C within that window calls `leaveChat()` and returns to the shell prompt.
- If 2 seconds elapse without a second press, the pending-exit state resets silently.
- Streaming Ctrl+C behavior is unchanged: a single press cancels the in-flight response.
- Applies to all chat-entry phases: idle chat, consent prompt, and model-loading phase.
- `leaveChat()` clears the pending-exit timer, so `/exit` and any other programmatic exit path never leave a dangling timeout.

## Non-goals

- Not changing shell-mode Ctrl+C behavior (no session to exit there).
- Not adding a configurable timeout — 2 seconds is hardcoded.
- Not adding a visual countdown indicator.

## Capabilities

### New Capabilities

- `chat-ctrl-c-exit`: Double-Ctrl+C gesture to exit chat mode across all chat phases (idle, consent, loading), with a 2-second grace window and hint text on first press.

### Modified Capabilities

<!-- none — no existing spec-level requirements are changing -->

## Impact

- **Code**: `src/components/Terminal.tsx` only. One new `useRef`, a branch in the input `keydown` handler, and a one-liner in `leaveChat()` and the window-level loading handler.
- **Performance budget**: No new dependencies, no bundle size impact. Negligible runtime overhead (a single `setTimeout` per gesture).
- **Tests**: The gesture is UI-interaction logic; existing test suite coverage is light, so no new tests are strictly required, but a note in tasks.md will flag the opportunity.

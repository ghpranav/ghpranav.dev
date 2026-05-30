## Why

Users in the terminal today have to type each command in full and remember exact spellings — there is no Tab feedback, only post-hoc "did you mean" suggestions after a mistake. This makes the prompt feel like a glorified text input rather than a real shell, and discourages exploration of the available commands. Real terminals complete on Tab; matching that expectation is high-value, low-cost, and reinforces the site's core conceit.

## What Changes

- Tab key in shell mode completes the current input token against `COMMAND_REGISTRY` keys (primary names + aliases).
- Single match: complete in place and append a trailing space so the user can continue typing arguments.
- Multiple matches: cycle-from-first-Tab with an **ephemeral** candidate listing rendered below the live prompt.
  - **1st Tab** — fill the live prompt's in-progress token with the **first** candidate, AND render the candidate list as a dim, ephemeral block **below** the live prompt row (anchored beneath the input, not inserted into scrollback). The live prompt stays put — it does not move down.
  - **2nd, 3rd, … consecutive Tabs** — cycle to the next candidate, wrapping at the end. The ephemeral listing stays put; only the live prompt's input value changes.
  - Any non-Tab keypress (typing, backspace, Enter, arrows, etc.) resets the cycle state, **dismisses the ephemeral listing**, and never leaves residue in scrollback.
- No match: do nothing (no error, no bell).
- Argument completion for commands that declare an enumerable argument set. Initially: `theme <name>` completes against registered theme keys. The cycle-from-first-Tab behavior applies to arguments too.
- A new optional `complete` field on the `Command` type — `(args: string[], ctx: CommandContext) => string[]` — returns candidate completions for the current argument position. Absence means "no argument completion."
- Hidden commands (`help`, `sudo`, `echo`, `date`) participate in completion so power users discover them, matching the same rule as "did you mean."
- Tab is a no-op in chat mode (no completion inside a streaming chat session).

## Capabilities

### New Capabilities
<!-- none — this extends an existing capability -->

### Modified Capabilities
- `command-registry`: adds requirements for Tab autocompletion behavior (command-name and argument completion) and extends the `Command` type with an optional `complete` field.

## Impact

- **Code:**
  - `src/types.ts` — extend `Command` with optional `complete?: (args, ctx) => string[]`.
  - `src/commands/theme.ts` — add `complete` returning theme keys.
  - `src/commands/index.ts` — expose the registry's keys and a helper to resolve completions for a given input.
  - `src/lib/completion.ts` — pure completion helper.
  - `src/components/Terminal.tsx` — handle `Tab` keydown in shell-mode input, suppress browser default focus behavior, dispatch to the completion helper, fill the live prompt with the first candidate (or single match), and render the ephemeral candidate listing below the live prompt while a cycle is active. Holds the cycle state in `useState` (so the ephemeral listing re-renders when the cycle starts / advances / resets); resets it on any non-Tab keypress before processing.
- **APIs / dependencies:** none added.
- **Performance budget:** no runtime additions to dispatch; Tab handler is a pure function over already-loaded registry data. No new dynamic imports. Initial JS budget unaffected.
- **Non-goals:**
  - History search (`Ctrl+R`) — separate change.
  - Fuzzy completion / substring matches — prefix-only.
  - Completion for free-form arguments like `echo` text.
  - Common-prefix expansion (filling in as much as is unambiguous before listing).
  - Showing a per-candidate description column in the listing (just names).

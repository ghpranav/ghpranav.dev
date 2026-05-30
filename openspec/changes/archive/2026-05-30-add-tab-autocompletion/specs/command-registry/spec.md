## MODIFIED Requirements

### Requirement: Per-command file convention

The codebase SHALL define every shell command as its own file under `src/commands/<name>.ts`, exporting a single `Command` object as a named export matching the command's primary name. The `Command` type SHALL have the shape `{ name: string; help: string; aliases?: readonly string[]; hidden?: boolean; complete?: (args: string[], ctx: CommandContext) => string[]; run: (args: string[], ctx: CommandContext) => TerminalLine | null }`.

The optional `complete` field SHALL return the universe of valid completion candidates for the **current** argument position (i.e. for the in-progress final token after the command name). Prefix filtering of the returned list is performed by the completion helper, not by `complete`. Returning `[]` SHALL mean "this command offers no argument completion at this position."

#### Scenario: Adding a new command requires exactly one new file
- **WHEN** a developer adds a new shell command `foo`
- **THEN** they create `src/commands/foo.ts` exporting `export const foo: Command = { name: "foo", help: "...", run: ... }` and add one import + one entry to the registry's `ALL` array in `src/commands/index.ts`
- **AND** no other file in the repository needs to be edited

#### Scenario: Each command file is self-describing
- **WHEN** a reader opens any `src/commands/<name>.ts` file
- **THEN** they can read the command's primary name, help text, optional aliases, optional `complete` advertiser, and `run` implementation in that single file without consulting the registry

#### Scenario: Command without complete is valid
- **GIVEN** a command declares no `complete` field
- **WHEN** the completion helper is asked for argument completions on that command
- **THEN** the helper SHALL treat it as offering no completions and SHALL return `{ kind: "none" }`

## ADDED Requirements

### Requirement: Tab completes the command name in shell mode

When the terminal is in shell mode and the user's input contains no whitespace, pressing `Tab` SHALL trigger command-name completion against the keys of the `CommandTable` (primary names and aliases, including hidden commands). The browser default for `Tab` SHALL be suppressed (`event.preventDefault()`) so focus does not leave the input.

Matching SHALL be **prefix** matching against the trimmed input, case-sensitive (commands are lowercase by convention).

- If **zero** candidates match, the handler SHALL be a no-op (no input change, no line appended).
- If **exactly one** candidate matches, the input SHALL be replaced with that candidate followed by a single space (so the user can continue typing arguments).
- If **two or more** candidates match, the cycle-from-first-Tab behavior described in "Tab cycles through candidates on repeated presses" SHALL apply.

#### Scenario: Tab completes a unique prefix
- **GIVEN** the registry contains `projects` (and no other command starting with `pro`)
- **AND** the input field contains `pro`
- **WHEN** the user presses `Tab`
- **THEN** the browser default is suppressed
- **AND** the input field becomes `projects ` (with trailing space)
- **AND** no line is appended to the transcript

#### Scenario: First Tab on an ambiguous prefix shows ephemeral list and fills the first candidate
- **GIVEN** the registry contains `skills`, `sudo` (hidden), and no other command starting with `s`
- **AND** the input field contains `s`
- **AND** no cycle is in progress
- **WHEN** the user presses `Tab`
- **THEN** the live prompt's input field becomes `skills` (the first candidate, no trailing space)
- **AND** an ephemeral candidate listing is rendered **below** the live prompt row showing `skills` and `sudo` in registry order
- **AND** the live prompt row's position does NOT shift upward (no scrollback line is inserted above it)
- **AND** the scrollback transcript is unchanged (no new `text` or `input` line is appended to it)
- **AND** cycle state is captured at index `0` for subsequent consecutive Tab presses

#### Scenario: Tab on an unmatched prefix does nothing
- **GIVEN** no command in the registry starts with `qzx`
- **AND** the input field contains `qzx`
- **WHEN** the user presses `Tab`
- **THEN** the input field is unchanged
- **AND** no line is appended

#### Scenario: Tab on empty input shows ephemeral list and fills the first command
- **GIVEN** the input field is empty
- **WHEN** the user presses `Tab`
- **THEN** the live prompt's input field becomes the first command name in registry order (e.g. `ask`)
- **AND** an ephemeral listing of every registry entry's primary name (in registry order) is rendered below the live prompt row
- **AND** nothing is appended to the scrollback transcript

#### Scenario: Aliases participate but do not duplicate
- **GIVEN** `cls` is registered as an alias of `clear`
- **AND** the input is `c`
- **WHEN** the user presses `Tab`
- **THEN** the candidates list includes `clear` and `cls` as separate entries (both are valid invocation keys)
- **AND** the listing contains no duplicate entry of either name

#### Scenario: Tab does not move focus
- **WHEN** the user presses `Tab` while the input field is focused in shell mode
- **THEN** the input field remains focused
- **AND** focus does not advance to the next focusable element

### Requirement: Tab cycles through candidates on repeated presses

When a Tab press produces two or more candidates, the terminal SHALL on the same press fill the in-progress token with the first candidate AND capture a cycle state containing the candidate list (registry order), the current candidate index (initially `0`, meaning "first candidate now visible in the input"), the input substring before the in-progress token (`prefix`), and the in-progress token's start position in the input (`tokenStart`).

While cycle state is non-null, the terminal SHALL render the candidate list as an **ephemeral** block immediately below the live prompt row (NOT appended to the scrollback transcript). The block SHALL show the candidate names joined by two spaces, in registry order, styled dim (`theme.dim` foreground) to distinguish it from active input. When cycle state becomes `null`, the ephemeral block SHALL unmount and leave no residue in the transcript.

Subsequent **consecutive** Tab presses (no intervening keypress) SHALL operate on this cycle state:

- Each consecutive Tab SHALL advance the index by 1 modulo `candidates.length` and replace the in-progress token of the live prompt with the candidate at the new index. The replacement SHALL NOT include a trailing space — the user is still selecting.
- Consecutive cycling Tabs SHALL NOT append any scrollback transcript lines. The ephemeral listing below the prompt SHALL remain visible (its contents unchanged) throughout the cycle.

Any **non-Tab keypress** received by the input — including character input, `Backspace`, `Delete`, `Enter`, arrow keys, `Ctrl+C`, paste, etc. — SHALL clear the cycle state **before** that keypress's own logic executes. Clearing cycle state SHALL dismiss the ephemeral listing (it unmounts immediately and is NOT preserved in scrollback). The next Tab after a reset SHALL behave as a 1st-Tab press (fresh fill + fresh ephemeral listing against the new input).

This rule SHALL apply identically to command-name completion and to argument completion through `command.complete`.

#### Scenario: Second consecutive Tab advances to the next candidate
- **GIVEN** the input is `s` and the registry contains `skills` and `sudo` (registry order)
- **AND** the user has just pressed Tab once; the live prompt was filled with `skills` and the ephemeral listing is visible below it (cycle index `0`)
- **WHEN** the user presses `Tab` again with no intervening keypress
- **THEN** the live prompt's input field becomes `sudo` (cycle index `1`)
- **AND** the ephemeral listing below the prompt is unchanged (same `skills  sudo`)
- **AND** nothing is appended to the scrollback transcript

#### Scenario: Cycling wraps around
- **GIVEN** a cycle of two candidates `[skills, sudo]` with `index = 1` and live prompt showing `sudo`
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `skills` (index wraps to `0`)
- **AND** the ephemeral listing is still visible and unchanged
- **AND** nothing is appended to scrollback

#### Scenario: Non-Tab keypress dismisses the ephemeral listing
- **GIVEN** the user is mid-cycle with live prompt `skills`, cycle index `0`, and the ephemeral listing visible
- **WHEN** the user presses any key other than `Tab` (e.g. a letter, `Backspace`, `Enter`, an arrow key)
- **THEN** the cycle state is cleared before the keypress's normal handling
- **AND** the ephemeral listing unmounts (no transcript residue)
- **AND** the next `Tab` press is treated as a fresh first Tab (fresh fill + fresh ephemeral listing, against the new input)

#### Scenario: Enter mid-cycle submits the currently-visible candidate
- **GIVEN** the user is mid-cycle with live prompt `skills` (the visible candidate) and the ephemeral listing visible below
- **WHEN** the user presses `Enter`
- **THEN** the cycle state is cleared and the ephemeral listing unmounts
- **AND** the dispatcher receives `skills` as the command line (the value visible in the input is what runs)
- **AND** the scrollback receives the standard committed-command `input` echo, but not the listing

#### Scenario: Cycling on arguments works the same way
- **GIVEN** the input is `theme ` (trailing space) and the registered themes are `espresso`, `gruvbox`, `nord`, `tokyo`, `paper`
- **WHEN** the user presses `Tab`
- **THEN** the live prompt becomes `theme espresso` (cycle index `0`)
- **AND** an ephemeral listing of all five theme keys is rendered below the live prompt (registry order, dim)
- **AND** nothing is appended to scrollback
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `theme gruvbox` (cycle index `1`)
- **AND** the ephemeral listing is unchanged
- **AND** nothing is appended to scrollback

### Requirement: Tab completes arguments via the command's complete hook

When the terminal is in shell mode and the user's input contains at least one whitespace character, pressing `Tab` SHALL invoke argument completion. The handler SHALL split the input on whitespace, take the first token as the command name, resolve it through the `CommandTable`, and:

- If no command matches the first token, the handler SHALL be a no-op.
- If the matched command has no `complete` field, the handler SHALL be a no-op.
- Otherwise, the handler SHALL call `command.complete(args, ctx)` where `args` is every token after the command name (including the in-progress final token, which may be `""` when the user just typed a space and pressed `Tab`).
- The handler SHALL filter the returned candidates by `candidate.startsWith(currentToken)` where `currentToken` is the last token of the input (possibly empty).

Single-match, multi-match, and zero-match behavior SHALL match the rules for command-name completion: single-match replaces the in-progress argument with the candidate + trailing space; multi-match invokes the cycle-from-first-Tab behavior (first Tab fills the first candidate AND shows the ephemeral listing below the live prompt, subsequent consecutive Tabs cycle); zero-match is a no-op.

If `command.complete` throws, the handler SHALL degrade to a no-op and SHOULD emit a `console.warn` for the developer; no error line SHALL be shown to the user.

A command's `complete` function SHALL be responsible for respecting its own argument arity. Returning `[]` for argument positions the command does not accept SHALL be the mechanism by which a command suppresses Tab beyond its supported positional arguments. The completion helper SHALL treat `[]` as `{ kind: "none" }` — no input mutation, no ephemeral listing, no cycle state captured.

#### Scenario: theme nor<Tab> completes to theme nord
- **GIVEN** the registered themes include `nord` (and no other theme starting with `nor`)
- **AND** the input is `theme nor`
- **WHEN** the user presses `Tab`
- **THEN** the input becomes `theme nord ` (with trailing space)

#### Scenario: theme <space><Tab> shows ephemeral list and fills first
- **GIVEN** the registered themes are `espresso`, `gruvbox`, `nord`, `tokyo`, `paper`
- **AND** the input is `theme ` (with trailing space)
- **WHEN** the user presses `Tab`
- **THEN** the live prompt's input field becomes `theme espresso` (first theme key, cycle index `0`)
- **AND** an ephemeral listing of the five theme keys is rendered below the live prompt
- **AND** nothing is appended to the scrollback transcript

#### Scenario: Completing on a command without a complete hook is a no-op
- **GIVEN** the command `whoami` declares no `complete` field
- **AND** the input is `whoami foo`
- **WHEN** the user presses `Tab`
- **THEN** the input is unchanged
- **AND** no line is appended

#### Scenario: Tab after a committed positional argument is a no-op
- **GIVEN** the input is `theme espresso ` (with trailing space — the user committed a theme argument and pressed space)
- **AND** `theme` accepts exactly one positional argument and its `complete` returns `[]` for arg positions beyond the first
- **WHEN** the user presses `Tab`
- **THEN** the input is unchanged
- **AND** no ephemeral candidate listing appears
- **AND** no cycle state is captured
- **AND** nothing is appended to scrollback

#### Scenario: A command's complete enforces its own arity
- **GIVEN** a command `foo` whose `complete` returns `[]` when `args.slice(0, -1).filter((t) => t.length > 0).length > 0` (i.e. there are committed non-empty positional args before the in-progress token)
- **WHEN** the user has input `foo bar ` (one committed arg, space, fresh in-progress token) and presses `Tab`
- **THEN** the helper receives `[]` from `foo.complete` and treats the result as `{ kind: "none" }`
- **AND** the Tab press is a no-op

#### Scenario: A throwing complete function degrades gracefully
- **GIVEN** a command whose `complete` throws on the current arguments
- **WHEN** the user presses `Tab`
- **THEN** the input is unchanged
- **AND** no error line is added to the transcript
- **AND** the developer console receives a warning

### Requirement: Completion helper is registry-driven and pure

The completion logic SHALL live in `src/lib/completion.ts` as a pure function `complete(input: string, registry, ctx): CompletionResult` where `CompletionResult` is the discriminated union `{ kind: "none" } | { kind: "single"; replacement: string } | { kind: "many"; candidates: readonly string[] }`. The helper SHALL NOT touch the DOM, React state, or any shared module-level mutable state. It SHALL derive every command-name candidate by reading the registry — no parallel command list SHALL be introduced.

#### Scenario: Completion helper is unit-testable without a DOM
- **WHEN** a developer imports `complete` from `src/lib/completion.ts` in a test environment with no `window`
- **THEN** the function executes and returns a `CompletionResult` without throwing

#### Scenario: No parallel command list
- **WHEN** a developer searches `src/lib/completion.ts` and `src/components/Terminal.tsx` for the literal string of any command name (e.g. `"whoami"`)
- **THEN** no match exists outside of comments / display strings — both files rely on `COMMAND_REGISTRY` / `CommandTable` for candidate names

### Requirement: Tab is inert in chat mode

When the terminal is in chat mode (`pranav-chat>` prompt active), pressing `Tab` SHALL NOT invoke any completion logic. The browser's default behavior for `Tab` SHALL NOT be suppressed in chat mode, so keyboard users retain normal focus traversal during a chat session.

#### Scenario: Tab in chat mode performs no completion
- **GIVEN** the terminal is in chat mode
- **AND** the user has typed partial text into the chat input
- **WHEN** the user presses `Tab`
- **THEN** no completion runs
- **AND** no line is appended to the transcript
- **AND** the input is unchanged by the completion handler

#### Scenario: Tab in chat mode allows native focus traversal
- **GIVEN** the terminal is in chat mode
- **WHEN** the user presses `Tab`
- **THEN** the browser's default focus traversal behavior is not suppressed by the terminal

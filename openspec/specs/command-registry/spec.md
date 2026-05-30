# command-registry Specification

## Purpose

Defines the modular, single-source registry of terminal shell commands. The registry is the authority for command dispatch, alias resolution, `help` enumeration, and the "did you mean" suggestion shown when an unknown command is entered. Every command lives in its own file and is wired in exactly once.

## Requirements

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

### Requirement: Single-source command registry

The system SHALL expose a single registry, `COMMAND_REGISTRY`, that is the canonical list of all commands. The factory `buildCommands(ctx: CommandContext): CommandTable` SHALL assemble its returned `CommandTable` by iterating `COMMAND_REGISTRY` and binding each command's `run` to the provided `ctx`. No hand-maintained parallel list of commands SHALL exist anywhere in the codebase.

#### Scenario: Registry order drives help and enumeration
- **WHEN** code needs to enumerate available commands (e.g. for `help` output)
- **THEN** it iterates `COMMAND_REGISTRY` directly, in the registry's declared order

#### Scenario: Terminal uses the factory
- **WHEN** `Terminal.tsx` calls `buildCommands(ctx)`
- **THEN** it receives a `CommandTable` whose keys cover every primary name and every alias declared in the registry

### Requirement: Declarative aliases

A command SHALL declare alternate invocation names via the optional `aliases` field on its `Command` object. The registry SHALL register each alias as an additional key in the returned `CommandTable` pointing to the same handler entry as the primary name. Aliases SHALL NOT duplicate the `run` implementation.

#### Scenario: `cls` is an alias of `clear`
- **GIVEN** the `clear` command declares `aliases: ["cls"]`
- **WHEN** `buildCommands(ctx)` runs
- **THEN** both `clear` and `cls` are keys in the returned `CommandTable`
- **AND** invoking either runs the same handler function and produces identical observable behavior

### Requirement: Help output derives from the registry

The `help` command SHALL produce its rows by iterating `COMMAND_REGISTRY` and emitting one `[name, help]` row per command, in registry order, skipping any command whose `hidden` field is `true`. There SHALL NOT be a hand-maintained list of help rows separate from the registry.

The `help` command itself SHALL be marked `hidden: true` so it is invocable but does not appear in its own output.

#### Scenario: A newly added command appears in `help` without a second edit
- **GIVEN** a developer adds a new command `foo` to the registry with `help: "frob the bar"` and no `hidden` flag
- **WHEN** the user runs `help`
- **THEN** the rendered help table includes a row `["foo", "frob the bar"]`
- **AND** no other code change is required for `foo` to appear in `help`

#### Scenario: Hidden commands are excluded from help
- **GIVEN** a command's `Command` object sets `hidden: true`
- **WHEN** the user runs `help`
- **THEN** that command does not appear in the rendered rows
- **AND** the command is still invocable by typing its name

### Requirement: Command dispatch

When the user submits a non-empty trimmed line in shell mode, the terminal SHALL split the line on whitespace, take the first token as the command name, and pass the remaining tokens as `args` to the matching `CommandTable` entry's `run`. The returned value SHALL be appended to the terminal's `lines` state unless it is `null`.

A command's `run` SHALL return either a `TerminalLine` (which is appended) or `null` (commands that produced no direct output, e.g. ones that mutated context via callbacks).

#### Scenario: Command with output
- **GIVEN** the user submits `whoami`
- **WHEN** the registered `whoami` handler runs
- **THEN** its returned `segments` line is appended to `lines`

#### Scenario: Command with side-effect only
- **GIVEN** the user submits `clear`
- **WHEN** the registered `clear` handler runs
- **THEN** `ctx.clear()` is invoked and the handler returns `null`
- **AND** no extra line is appended for the command itself

#### Scenario: Command with arguments
- **GIVEN** the user submits `theme nord`
- **WHEN** the dispatcher routes the input
- **THEN** the `theme` handler is invoked with `args = ["nord"]`

### Requirement: "Did you mean" suggestion for unknown commands

When the user submits a name that is not a key in the `CommandTable`, the terminal SHALL append an `error` line of the form:

```
command not found: <name>
  did you mean: <suggestion> ?
```

The `<suggestion>` SHALL be computed by `closest(name, Object.keys(commands))` from `src/lib/levenshtein.ts`. `closest` SHALL:

- compute the Levenshtein distance between the input and every candidate
- return the candidate with the minimum distance if that minimum is `≤ 3`
- otherwise return the string `"help"` as a safe default suggestion

The suggestion list SHALL include both primary names and aliases (i.e. every key of the `CommandTable`).

#### Scenario: Close typo suggests the right command
- **GIVEN** `whoami` is a registered command
- **WHEN** the user submits `whomai`
- **THEN** an `error` line is appended of the form `command not found: whomai\n  did you mean: whoami ?`

#### Scenario: Nonsense input falls back to help
- **GIVEN** no command is within 3 edits of the input
- **WHEN** the user submits `xyzzyqq`
- **THEN** the suggestion in the error line is `help`

#### Scenario: Aliases participate in suggestion ranking
- **GIVEN** `cls` is registered as an alias of `clear`
- **WHEN** the user submits `clz`
- **THEN** the suggestion is `cls` (the closer alias) rather than the more distant `clear`

### Requirement: Command output types

The return type of `Command.run` SHALL be `TerminalLine | null`, where `TerminalLine` is the discriminated union defined in `src/types.ts`. Every command's output type SHALL be one of the variants in that union: `boot`, `text`, `error`, `ascii`, `segments`, `input`, `chat-assistant`, `help`, `skills`, `projects`, `contact`, `history`.

A new output kind SHALL NOT be introduced ad-hoc inside a command file. Adding a new kind SHALL require:

1. adding a new variant to the `TerminalLine` union in `src/types.ts`, and
2. adding a corresponding `case` arm to the renderer in `src/components/Line.tsx`.

Static (presentational) commands such as `whoami`, `about`, `skills`, `projects`, `contact`, and `history` SHALL pull their content from `src/content/site.ts` rather than inlining strings in the command file.

#### Scenario: Each existing command's output type
- **GIVEN** the registered commands
- **WHEN** their `run` return values are inspected
- **THEN** each return is either `null` or a `TerminalLine` whose `type` is one of the listed variants

#### Scenario: Adding a new line kind needs both type and renderer
- **WHEN** a developer wants to introduce a new output kind `foo` for a new command
- **THEN** they add `{ type: "foo"; ... }` to `TerminalLine` in `src/types.ts`
- **AND** they add a `case "foo":` arm to `Line.tsx`
- **AND** TypeScript exhaustiveness checking flags any missing renderer arm

### Requirement: Registered commands

The registry SHALL include exactly the following commands today: `ask`, `whoami`, `about`, `skills`, `projects`, `contact`, `theme`, `history`, `clear` (with alias `cls`), `exit`, `help` (hidden), `sudo` (hidden), `echo` (hidden), `date` (hidden).

Each command's observable behavior SHALL be:

- `ask` — invokes `ctx.enterChat({ flags: args })` and returns `null`
- `whoami` — returns a `segments` line built from `WHOAMI` in `src/content/site.ts`
- `about` — returns a `text` line with `ABOUT`
- `skills` — returns a `skills` line with `SKILLS`
- `projects` — returns a `projects` line with `PROJECTS`
- `contact` — returns a `contact` line with `CONTACTS`
- `theme` — see the theme-system spec
- `history` — returns a `history` line with `ctx.history`
- `clear` / `cls` — invokes `ctx.clear()` and returns `null`
- `exit` — returns a `text` line `you can't leave. there's no door.`
- `help` — returns a `help` line with rows derived from the registry
- `sudo` — returns an `error` line `pranav is not in the sudoers file. This incident will be reported.`
- `echo` — returns a `text` line with `args.join(" ")`
- `date` — returns a `text` line with the current time in `Asia/Kolkata` formatted as `<en-IN locale> IST`

#### Scenario: `theme` with no argument prints usage
- **GIVEN** the terminal is in shell mode
- **WHEN** the user runs `theme` with no arguments
- **THEN** the output is a `text` line listing usage, available theme keys, and the current theme name

#### Scenario: `ask` enters chat mode via the context callback
- **WHEN** the user runs `ask --webllm`
- **THEN** the command invokes `ctx.enterChat({ flags: ["--webllm"] })` and returns `null`

#### Scenario: `clear` and `cls` both clear the screen
- **WHEN** the user runs either `clear` or `cls`
- **THEN** `ctx.clear()` is invoked and the command returns `null`

#### Scenario: Hidden commands stay invocable
- **WHEN** the user runs `sudo`, `echo hello`, `date`, or `help`
- **THEN** each command runs and produces its documented output
- **AND** none of them appear as a row in the `help` table (except by their own output)

### Requirement: Performance budget

Command dispatch SHALL NOT introduce lazy chunks, dynamic imports, or any new runtime work at dispatch time. All command modules SHALL be statically imported by `src/commands/index.ts` so the dispatch table is built synchronously at terminal mount. The only dynamic import in the codebase SHALL be `@mlc-ai/web-llm` (lazy-loaded only when the user runs `ask --webllm`).

#### Scenario: No dynamic imports in command code
- **GIVEN** the source tree under `src/commands/` and `src/types.ts`
- **WHEN** a developer greps for `import(` expressions
- **THEN** no matches are found in command code or registry code
- **AND** the only `import(` in the codebase is the WebLLM lazy load in `src/lib/llm.ts`

#### Scenario: Initial JS bundle stays small
- **GIVEN** a production build
- **WHEN** the gzipped size of the initial JS asset(s) is measured (excluding the lazily-imported WebLLM chunk)
- **THEN** the size is within the project's stated 60 KB budget

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

While cycle state is non-null, the terminal SHALL render the candidate list as an **ephemeral** block immediately below the live prompt row (NOT appended to the scrollback transcript). The block SHALL show the candidates in registry order, separated visually by two spaces of whitespace. Each candidate SHALL be rendered as its own inline element so that the active candidate can be styled independently.

The terminal SHALL visually distinguish the **active candidate** — the candidate at `cycle.index`, i.e. the one currently filled into the live prompt's input field — from the other candidates in the ephemeral listing:

- The active candidate SHALL be rendered with a background color equal to the active theme's `accent` token and a foreground color equal to the active theme's `bg` token.
- The active candidate SHALL have small horizontal padding (e.g. `0 0.25ch`) and a small border-radius (e.g. `2px`) so the highlight reads as a chip rather than as inverted text.
- All non-active candidates SHALL be rendered with the active theme's `dim` token as foreground and no background.
- The active-candidate styling SHALL update synchronously on each Tab press as `cycle.index` advances, including wrap-around.
- The highlight SHALL re-derive its colors from the current theme on every render so live theme switches propagate without a reload.

When cycle state becomes `null`, the ephemeral block SHALL unmount and leave no residue in the transcript.

Subsequent **consecutive** Tab presses (no intervening keypress) SHALL operate on this cycle state:

- Each consecutive Tab SHALL advance the index by 1 modulo `candidates.length` and replace the in-progress token of the live prompt with the candidate at the new index. The replacement SHALL NOT include a trailing space — the user is still selecting.
- The active-candidate highlight in the ephemeral listing SHALL move to the new index on the same press.
- Consecutive cycling Tabs SHALL NOT append any scrollback transcript lines. The ephemeral listing below the prompt SHALL remain visible (its candidate set and order unchanged, only the highlighted index changes) throughout the cycle.

Any **non-Tab keypress** received by the input — including character input, `Backspace`, `Delete`, `Enter`, arrow keys, `Ctrl+C`, paste, etc. — SHALL clear the cycle state **before** that keypress's own logic executes. Clearing cycle state SHALL dismiss the ephemeral listing (it unmounts immediately and is NOT preserved in scrollback). The next Tab after a reset SHALL behave as a 1st-Tab press (fresh fill + fresh ephemeral listing against the new input, with the first candidate highlighted).

This rule SHALL apply identically to command-name completion and to argument completion through `command.complete`.

The highlight SHALL be a visual affordance only. The screen-reader-announced text of the ephemeral region (the candidates joined by two spaces) SHALL be unchanged by the introduction of the highlight; no separate announcement of "active candidate" SHALL be emitted, because the input field above the listing already reflects the active value.

#### Scenario: Second consecutive Tab advances to the next candidate
- **GIVEN** the input is `s` and the registry contains `skills` and `sudo` (registry order)
- **AND** the user has just pressed Tab once; the live prompt was filled with `skills` and the ephemeral listing is visible below it (cycle index `0`)
- **WHEN** the user presses `Tab` again with no intervening keypress
- **THEN** the live prompt's input field becomes `sudo` (cycle index `1`)
- **AND** the ephemeral listing below the prompt is unchanged in content and order (still `skills  sudo`)
- **AND** nothing is appended to the scrollback transcript

#### Scenario: Cycling wraps around
- **GIVEN** a cycle of two candidates `[skills, sudo]` with `index = 1` and live prompt showing `sudo`
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `skills` (index wraps to `0`)
- **AND** the ephemeral listing is still visible and its candidate set/order is unchanged
- **AND** nothing is appended to scrollback

#### Scenario: Non-Tab keypress dismisses the ephemeral listing
- **GIVEN** the user is mid-cycle with live prompt `skills`, cycle index `0`, and the ephemeral listing visible
- **WHEN** the user presses any key other than `Tab` (e.g. a letter, `Backspace`, `Enter`, an arrow key)
- **THEN** the cycle state is cleared before the keypress's normal handling
- **AND** the ephemeral listing unmounts (no transcript residue)
- **AND** the next `Tab` press is treated as a fresh first Tab (fresh fill + fresh ephemeral listing with the first candidate highlighted, against the new input)

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
- **AND** an ephemeral listing of all five theme keys is rendered below the live prompt (registry order)
- **AND** `espresso` is the highlighted candidate in the listing
- **AND** nothing is appended to scrollback
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `theme gruvbox` (cycle index `1`)
- **AND** the ephemeral listing's candidate set is unchanged
- **AND** the highlighted candidate in the listing is now `gruvbox`, not `espresso`
- **AND** nothing is appended to scrollback

#### Scenario: Active candidate is rendered with theme.accent background and theme.bg foreground
- **GIVEN** the active theme is `espresso` (`accent: "#d4915d"`, `bg: "#1a120b"`)
- **AND** the user has pressed Tab on an ambiguous prefix and cycle index is `0`
- **WHEN** the ephemeral listing renders
- **THEN** the span representing the candidate at index `0` has computed background color `#d4915d` and foreground color `#1a120b`
- **AND** every other candidate span has foreground color equal to the theme's `dim` token (`#8a7158`) and no background
- **AND** the highlighted span has non-zero horizontal padding and a non-zero border-radius

#### Scenario: Highlight moves with the cycle index, listing content does not change
- **GIVEN** the user is cycling through candidates `[espresso, gruvbox, nord, tokyo, paper]` at index `0`
- **WHEN** the user presses `Tab` three times (advancing to index `3`)
- **THEN** the ephemeral listing renders the same five candidates in the same order
- **AND** only the candidate at index `3` (`tokyo`) carries the active-style (accent background, bg foreground)
- **AND** the other four carry the inactive-style (dim foreground, no background)

#### Scenario: Highlight uses live theme tokens, not stale ones
- **GIVEN** the active theme is `nord` and an ambiguous Tab cycle is in progress with index `0`
- **AND** the cycle is in some imagined state where the active theme changes mid-cycle to `paper` without dismissing the cycle (a hypothetical, not an interactive user path)
- **WHEN** the listing re-renders
- **THEN** the highlighted candidate's background reflects `paper.accent` (`#a0522d`), not the previous `nord.accent` (`#88c0d0`)
- **AND** the inactive candidates' foreground reflects `paper.dim` (`#8a7558`)

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

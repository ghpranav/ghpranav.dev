# command-registry Specification

## Purpose

Defines the modular, single-source registry of terminal shell commands. The registry is the authority for command dispatch, alias resolution, `help` enumeration, and the "did you mean" suggestion shown when an unknown command is entered. Every command lives in its own file and is wired in exactly once.

## Requirements

### Requirement: Per-command file convention

The codebase SHALL define every shell command as its own file under `src/commands/<name>.ts`, exporting a single `Command` object as a named export matching the command's primary name. The `Command` type SHALL have the shape `{ name: string; help: string; aliases?: readonly string[]; hidden?: boolean; run: (args: string[], ctx: CommandContext) => TerminalLine | null }`.

#### Scenario: Adding a new command requires exactly one new file
- **WHEN** a developer adds a new shell command `foo`
- **THEN** they create `src/commands/foo.ts` exporting `export const foo: Command = { name: "foo", help: "...", run: ... }` and add one import + one entry to the registry's `ALL` array in `src/commands/index.ts`
- **AND** no other file in the repository needs to be edited

#### Scenario: Each command file is self-describing
- **WHEN** a reader opens any `src/commands/<name>.ts` file
- **THEN** they can read the command's primary name, help text, optional aliases, and `run` implementation in that single file without consulting the registry

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

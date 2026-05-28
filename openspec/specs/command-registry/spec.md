# command-registry Specification

## Purpose

Defines the modular, single-source registry for terminal shell commands in the ghpranav.dev site.

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

#### Scenario: Registry order drives help and any future enumeration
- **WHEN** code needs to enumerate available commands (e.g. for `help` output or future tab completion)
- **THEN** it iterates `COMMAND_REGISTRY` directly, in the registry's declared order

#### Scenario: Existing call site is unaffected
- **WHEN** `Terminal.tsx` calls `buildCommands(ctx)`
- **THEN** it receives a `CommandTable` with the same keys and observable behavior as the pre-refactor implementation

### Requirement: Declarative aliases

A command SHALL declare alternate invocation names via the optional `aliases` field on its `Command` object. The registry SHALL register each alias as an additional key in the returned `CommandTable` pointing to the same handler entry as the primary name. Aliases SHALL NOT duplicate the `run` implementation.

#### Scenario: `cls` is an alias of `clear`
- **WHEN** the `clear` command file declares `aliases: ["cls"]`
- **THEN** both `clear` and `cls` are valid keys in the returned `CommandTable`
- **AND** invoking either runs the same handler function and produces identical observable behavior

### Requirement: Help output derives from the registry

The `help` command SHALL produce its rows by iterating `COMMAND_REGISTRY` and emitting one `[name, help]` row per command, in registry order, skipping any command whose `hidden` field is `true`. There SHALL NOT be a hand-maintained list of help rows separate from the registry.

#### Scenario: A newly added command appears in `help` without a second edit
- **WHEN** a developer adds a new command `foo` to the registry with `help: "frob the bar"` and no `hidden` flag
- **THEN** running `help` in the terminal includes a row `["foo", "frob the bar"]`
- **AND** no other code change is required for `foo` to appear in `help`

#### Scenario: Hidden commands are excluded from help
- **WHEN** a command's `Command` object sets `hidden: true`
- **THEN** running `help` does not include that command in its rows
- **AND** the command is still invocable by typing its name

### Requirement: Behavior preservation

The refactor SHALL NOT change the observable behavior of any existing command. For every command currently defined (`help`, `whoami`, `about`, `skills`, `projects`, `contact`, `ask`, `theme`, `history`, `clear`, `cls`, `sudo`, `exit`, `echo`, `date`), the output, side effects, and argument handling after the refactor SHALL match the pre-refactor implementation.

#### Scenario: `theme` with no argument still prints usage
- **WHEN** the user runs `theme` with no arguments
- **THEN** the output is a `text` line listing usage, available theme names, and the current theme — identical to today

#### Scenario: `ask` still enters chat mode via the context callback
- **WHEN** the user runs `ask --webllm`
- **THEN** the command invokes `ctx.enterChat({ flags: ["--webllm"] })` and returns `null`

#### Scenario: `clear` and `cls` both clear the screen
- **WHEN** the user runs either `clear` or `cls`
- **THEN** `ctx.clear()` is invoked and the command returns `null`

#### Scenario: Unknown command path is unchanged
- **WHEN** the user runs a name that is neither a registered command nor an alias
- **THEN** `Terminal.tsx`'s existing unknown-command handling produces the same output it does today

### Requirement: Performance budget preservation

The refactor SHALL NOT introduce lazy chunks, dynamic imports, or any new runtime work at command-dispatch time. The gzipped size of the initial JS bundle after this change SHALL be within +1 KB of the size before this change.

#### Scenario: Bundle size delta is bounded
- **WHEN** `bun run build` is run before and after this change on the same machine
- **THEN** the gzipped size of the produced initial JS asset(s) (excluding the lazily-imported WebLLM chunk) increases by no more than 1 KB

## MODIFIED Requirements

### Requirement: Command output types

The return type of `Command.run` SHALL be `TerminalLine | null`, where `TerminalLine` is the discriminated union defined in `src/types.ts`. Every command's output type SHALL be one of the variants in that union: `boot`, `text`, `error`, `ascii`, `segments`, `input`, `chat-assistant`, `help`, `skills`, `projects`, `contact`, `history`, `neofetch`.

The `neofetch` variant SHALL have the shape `{ type: "neofetch"; logo: string; rows: ReadonlyArray<readonly [string, string]>; accent?: boolean }`, where `logo` is a pre-formatted ASCII mark and `rows` is an ordered list of `[label, value]` pairs rendered with labels colored from the active theme.

A new output kind SHALL NOT be introduced ad-hoc inside a command file. Adding a new kind SHALL require:

1. adding a new variant to the `TerminalLine` union in `src/types.ts`, and
2. adding a corresponding `case` arm to the renderer in `src/components/Line.tsx`.

Static (presentational) commands such as `whoami`, `about`, `skills`, `projects`, `contact`, and `history` SHALL pull their content from `src/content/site.ts` rather than inlining strings in the command file. `neofetch` SHALL source its logo from `src/content/site.ts` (`NEOFETCH_LOGO`) and `fortune` SHALL source its corpus from `src/content/site.ts` (`FORTUNES`).

#### Scenario: Each existing command's output type
- **GIVEN** the registered commands
- **WHEN** their `run` return values are inspected
- **THEN** each return is either `null` or a `TerminalLine` whose `type` is one of the listed variants

#### Scenario: Adding a new line kind needs both type and renderer
- **WHEN** a developer wants to introduce a new output kind `foo` for a new command
- **THEN** they add `{ type: "foo"; ... }` to `TerminalLine` in `src/types.ts`
- **AND** they add a `case "foo":` arm to `Line.tsx`
- **AND** TypeScript exhaustiveness checking flags any missing renderer arm

#### Scenario: neofetch renders a logo and themed rows
- **GIVEN** the user runs `neofetch`
- **WHEN** the output line is rendered
- **THEN** it is a `neofetch` line whose `logo` is `NEOFETCH_LOGO`
- **AND** its `rows` include the labels `os`, `host`, `shell`, `theme`, `uptime`, `packages`, and `resolution`
- **AND** the `theme` row's value equals the active theme's display name

### Requirement: Registered commands

The registry SHALL include the following commands. The original set: `ask`, `whoami`, `about`, `skills`, `projects`, `contact`, `theme`, `history`, `clear` (with alias `cls`), `exit`, `help` (hidden), `sudo` (hidden), `echo` (hidden), `date` (hidden).

In addition, the registry SHALL include the following shell-utility and easter-egg commands:

- `neofetch` — returns a `neofetch` line (logo + system-info rows). Visible in `help`.
- `grep` (visible) — returns a `text` line listing case-insensitive substring matches across `SKILLS` and `PROJECTS`, each match prefixed by its source; multiple arguments are OR-ed; with no argument it returns a `text` usage line; with no matches it returns a `text` line indicating nothing was found.
- `man` (hidden) — returns a `text` line formatted as a manual page (NAME / SYNOPSIS / DESCRIPTION) for the named command, derived from the registry; for an unknown name it returns a `text` line `no manual entry for <name>`; with no argument it returns a `text` usage line. Advertises command-name completion via `complete`.
- `which` (hidden, alias `type`) — returns a `text` line `/usr/bin/<name>` when the name or an alias is a registered command, otherwise a `text` line `<name> not found`. Advertises command-name completion via `complete`.
- `alias` (hidden) — returns a `text` line listing the registry's declared aliases (e.g. `cls='clear'`).
- `pwd` (hidden) — returns a `text` line `/home/pranav`.
- `uname` (hidden) — returns a `text` line with a fake system string; with `-a` it returns the long form.
- `cal` (hidden) — returns a `text` line with the current month rendered as a calendar grid with the current day marked.
- `uptime` (hidden) — returns a `text` line describing the time elapsed since the terminal mounted.
- `cowsay` (hidden) — returns an `ascii` line with the argument text inside a speech bubble drawn above a cow.
- `fortune` (hidden) — returns a `text` line with a randomly chosen entry from `FORTUNES`.
- `vim`, `vi`, `nano`, `emacs` (hidden) — each returns a `text` line with the editor-trap message; `:q`, `:q!`, `:wq`, `:x`, `ZZ` (hidden) each return a `text` line with the in-character reply.
- `rm` (hidden) — returns a `text` (or `error`) line refusing in character; `rm -rf ~` and `rm -rf /` return a distinct refusal.

Hidden commands SHALL NOT appear as rows in the `help` table; visible commands (`neofetch`, `grep`) SHALL appear.

#### Scenario: `grep` matches across skills and projects
- **GIVEN** `SKILLS.backend` contains `Kafka` and a project's stack contains `Kafka`
- **WHEN** the user runs `grep kafka`
- **THEN** the output is a `text` line containing the skills match and the project match, each prefixed by its source
- **AND** the match is case-insensitive

#### Scenario: `man` derives a page from the registry
- **WHEN** the user runs `man theme`
- **THEN** the output is a `text` line containing a NAME section built from `theme`'s registry `help`
- **AND** running `man nonesuch` returns `no manual entry for nonesuch`

#### Scenario: `which` resolves names and aliases
- **WHEN** the user runs `which cls`
- **THEN** the output indicates `cls` resolves to a registered command (`/usr/bin/cls` or the canonical `clear`)
- **AND** running `which nonesuch` returns `nonesuch not found`

#### Scenario: `man` and `which` advertise command-name completion
- **GIVEN** the input is `man th`
- **WHEN** the user presses `Tab`
- **THEN** the completion helper offers `theme` (the `complete` hook returns registry command names, which the helper prefix-filters)

#### Scenario: New visible commands appear in help; eggs stay hidden
- **WHEN** the user runs `help`
- **THEN** `neofetch` and `grep` appear as rows
- **AND** `man`, `which`, `alias`, `pwd`, `uname`, `cal`, `uptime`, `cowsay`, `fortune`, the editor commands, and `rm` do not appear
- **AND** each hidden command still runs and produces its documented output when invoked directly

#### Scenario: `rm -rf` is refused in character
- **WHEN** the user runs `rm -rf ~` or `rm -rf /`
- **THEN** nothing is deleted (there is no filesystem to mutate)
- **AND** the output is an in-character refusal line distinct from the generic `rm` refusal

### Requirement: Performance budget

Command dispatch SHALL NOT introduce lazy chunks or dynamic imports within command modules or registry code. All command modules SHALL be statically imported by `src/commands/index.ts` so the dispatch table is built synchronously at terminal mount. Runtime work that happens after `ask` enters the chat flow MAY lazily import the LLM path, but that SHALL remain outside the command modules and registry.

The shell-utility and easter-egg commands added by this change SHALL be implemented as pure functions over small static data with no new runtime dependency and no animation loop, so the initial JS bundle stays within the project's stated 60 KB gzipped budget.

#### Scenario: No dynamic imports in command code
- **GIVEN** the source tree under `src/commands/` and `src/types.ts`
- **WHEN** a developer greps for `import(` expressions
- **THEN** no matches are found in command code or registry code

#### Scenario: Initial JS bundle stays small
- **GIVEN** a production build
- **WHEN** the gzipped size of the initial JS asset(s) is measured (excluding lazily-imported ask-related LLM chunks)
- **THEN** the size is within the project's stated 60 KB budget

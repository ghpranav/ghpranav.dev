## MODIFIED Requirements

### Requirement: Command output types

The return type of `Command.run` SHALL be `TerminalLine | null`, where `TerminalLine` is the discriminated union defined in `src/types.ts`. Every command's output type SHALL be one of the variants in that union: `boot`, `text`, `error`, `ascii`, `segments`, `input`, `chat-assistant`, `help`, `skills`, `projects`, `contact`, `history`, `listing`.

The `listing` variant SHALL have the shape `{ type: "listing"; entries: ReadonlyArray<{ name: string; kind: "dir" | "file" }>; long?: boolean }` and is produced by `ls`. The `cat` command SHALL reuse existing rich variants depending on the target file (e.g. `text` for `about.txt`, `skills` for `skills.json`, `projects` for a project file) rather than introducing a new variant.

A new output kind SHALL NOT be introduced ad-hoc inside a command file. Adding a new kind SHALL require:

1. adding a new variant to the `TerminalLine` union in `src/types.ts`, and
2. adding a corresponding `case` arm to the renderer in `src/components/Line.tsx`.

Static (presentational) commands such as `whoami`, `about`, `skills`, `projects`, `contact`, and `history` SHALL pull their content from `src/content/site.ts` rather than inlining strings in the command file. Filesystem commands SHALL source file content from the virtual filesystem (`src/lib/vfs.ts`), whose file nodes in turn reference `src/content/site.ts`.

#### Scenario: Each existing command's output type
- **GIVEN** the registered commands
- **WHEN** their `run` return values are inspected
- **THEN** each return is either `null` or a `TerminalLine` whose `type` is one of the listed variants

#### Scenario: Adding a new line kind needs both type and renderer
- **WHEN** a developer wants to introduce a new output kind `foo` for a new command
- **THEN** they add `{ type: "foo"; ... }` to `TerminalLine` in `src/types.ts`
- **AND** they add a `case "foo":` arm to `Line.tsx`
- **AND** TypeScript exhaustiveness checking flags any missing renderer arm

#### Scenario: cat reuses rich variants per file
- **WHEN** the user runs `cat skills.json`
- **THEN** the output is a `skills` line equivalent to the `skills` command's output
- **AND** running `cat about.txt` returns a `text` line and `cat projects/ai-sre-agent.md` returns a `projects` line

### Requirement: Command context exposes the working directory

`CommandContext` SHALL expose the current working directory as `cwd: string` and a setter `setCwd: (path: string) => void`, in addition to the existing `theme`, `setTheme`, `clear`, `history`, and `enterChat` members. Only the `cd` command SHALL call `setCwd`; filesystem commands SHALL read `cwd` to resolve relative paths.

#### Scenario: Filesystem commands read cwd from context
- **GIVEN** `cwd` is `/home/pranav/projects`
- **WHEN** the user runs `ls` with no path argument
- **THEN** the command lists the `projects` directory (resolved from `ctx.cwd`)

#### Scenario: Only cd mutates cwd
- **WHEN** any command other than `cd` runs
- **THEN** it does not call `ctx.setCwd`

### Requirement: Registered commands

The registry SHALL include the following commands. The original set: `ask`, `whoami`, `about`, `skills`, `projects`, `contact`, `theme`, `history`, `clear` (with alias `cls`), `exit`, `help` (hidden), `sudo` (hidden), `echo` (hidden), `date` (hidden).

In addition, the registry SHALL include the following filesystem commands operating over the virtual filesystem (`src/lib/vfs.ts`):

- `ls` (visible) — lists the directory at the resolved path (or `cwd` when no path is given); returns a `listing` line. Supports `-a` (include hidden dotfiles) and `-l` (long form via `listing.long`). Listing a path that resolves to a file SHALL show that single entry; a missing path SHALL return an `error` line `ls: <path>: No such file or directory`. Advertises path completion via `complete`.
- `cat` (visible) — prints a file by returning that file node's rendered line (reusing existing rich variants). `cat <dir>` SHALL return `error` `cat: <name>: Is a directory`; `cat <missing>` SHALL return `error` `cat: <name>: No such file or directory`; `cat resume.pdf` SHALL open the résumé link and return a `text` confirmation. Advertises path completion via `complete`.
- `cd` (visible) — resolves the argument (defaulting to home) and calls `ctx.setCwd` for a directory; returns `null` on success. `cd` into a missing path SHALL return `error` `cd: <path>: No such file or directory`; `cd` into a file SHALL return `error` `cd: <name>: Not a directory`. Advertises directory completion via `complete`.
- `pwd` (visible) — returns a `text` line with the absolute `ctx.cwd`.
- `tree` (visible) — returns a pre-formatted (`ascii`/`text`) recursive view of the tree from the resolved path (or `cwd`).
- `find` (hidden) — returns a `text` line of paths whose basename contains the query argument.
- (Optional, hidden) `file` / `stat` — return `text` metadata for a node.

`cat`, `ls`, and `tree` path completion SHALL offer entries at the relevant directory (directories suffixed `/`); `cd` completion SHALL offer directories only; hidden dotfiles SHALL be offered only when the in-progress fragment begins with `.`.

#### Scenario: ls lists the current directory
- **GIVEN** `cwd` is the home directory
- **WHEN** the user runs `ls`
- **THEN** the output is a `listing` line whose entries include `about.txt`, `skills.json`, `contact.txt`, `resume.pdf`, and `projects` (a directory)
- **AND** the hidden `.secret` is omitted unless `-a` is passed

#### Scenario: cd then relative cat
- **GIVEN** `cwd` is the home directory
- **WHEN** the user runs `cd projects` then `cat ai-sre-agent.md`
- **THEN** `cd` updates `cwd` to `/home/pranav/projects`
- **AND** `cat` returns the project's detail line resolved relative to the new `cwd`

#### Scenario: Filesystem error messages
- **WHEN** the user runs `cat nope.txt`, `cd nope`, or `cat projects`
- **THEN** each returns an `error` line in the conventional `cmd: target: reason` form

#### Scenario: Path completion is directory-aware
- **GIVEN** `cwd` is the home directory and the input is `cat ab`
- **WHEN** the user presses `Tab`
- **THEN** the completion helper offers `about.txt`
- **AND** for input `cd pr` it offers `projects/`

### Requirement: Performance budget

Command dispatch SHALL NOT introduce lazy chunks or dynamic imports within command modules or registry code. All command modules SHALL be statically imported by `src/commands/index.ts` so the dispatch table is built synchronously at terminal mount. Runtime work that happens after `ask` enters the chat flow MAY lazily import the LLM path, but that SHALL remain outside the command modules and registry.

The virtual filesystem module (`src/lib/vfs.ts`) and the filesystem commands SHALL be implemented as a static tree plus pure functions over it, with no new runtime dependency and no dynamic import, keeping the initial JS bundle within the project's stated 60 KB gzipped budget.

#### Scenario: No dynamic imports in command code
- **GIVEN** the source tree under `src/commands/`, `src/lib/vfs.ts`, and `src/types.ts`
- **WHEN** a developer greps for `import(` expressions
- **THEN** no matches are found in command, registry, or vfs code

#### Scenario: Initial JS bundle stays small
- **GIVEN** a production build
- **WHEN** the gzipped size of the initial JS asset(s) is measured (excluding lazily-imported ask-related LLM chunks)
- **THEN** the size is within the project's stated 60 KB budget

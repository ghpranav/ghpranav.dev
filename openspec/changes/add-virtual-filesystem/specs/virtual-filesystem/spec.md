## ADDED Requirements

### Requirement: In-memory virtual filesystem rooted at the home directory

The application SHALL define a read-only, in-memory virtual filesystem in `src/lib/vfs.ts`, rooted at the absolute path `/home/pranav` (the home directory, abbreviated `~`). The tree SHALL consist of directory nodes and file nodes; file nodes SHALL reference content in `src/content/site.ts` rather than duplicating it.

The tree SHALL contain at least: `about.txt`, `skills.json`, `contact.txt`, `resume.pdf`, a hidden `.secret`, and a `projects/` directory with one file per entry in `PROJECTS`. Each file node SHALL expose a `render` thunk returning the `TerminalLine` that `cat` produces for it, so that file content has a single source of truth in `site.ts`.

#### Scenario: Files reference site content, not copies
- **GIVEN** the virtual filesystem
- **WHEN** the `about.txt` node is rendered
- **THEN** its content derives from `ABOUT` in `src/content/site.ts`
- **AND** no portfolio prose is duplicated inside `vfs.ts`

#### Scenario: Projects directory mirrors the PROJECTS data
- **GIVEN** `PROJECTS` has N entries
- **WHEN** the `projects/` directory is listed
- **THEN** it contains exactly N files, one per project entry

#### Scenario: The filesystem is read-only
- **WHEN** any command attempts to create, modify, move, or delete a node
- **THEN** no mutation occurs (the tree is read-only by construction; write commands are out of scope)

### Requirement: Path resolution semantics

The module SHALL provide a pure `resolvePath(cwd, arg)` that returns an absolute, normalized path, and a `lookup(absPath)` that returns the node at a path or `null`. Resolution SHALL support: `~` (expands to the home directory), absolute paths (`/…`), the current directory (`.`), the parent directory (`..`, clamped at root), and relative paths resolved against `cwd`. An empty or omitted argument SHALL resolve to the home directory for `cd` and to `cwd` for `ls`.

#### Scenario: Tilde and absolute paths resolve to the home subtree
- **GIVEN** `cwd` is `/home/pranav/projects`
- **WHEN** `resolvePath` is called with `~` and with `/home/pranav`
- **THEN** both return `/home/pranav`

#### Scenario: Dot-dot is clamped at root
- **GIVEN** `cwd` is `/home/pranav`
- **WHEN** `resolvePath(cwd, "../../..")` is evaluated
- **THEN** the result does not escape above the filesystem root

#### Scenario: Relative paths resolve against cwd
- **GIVEN** `cwd` is `/home/pranav`
- **WHEN** `resolvePath(cwd, "projects/ai-sre-agent.md")` is evaluated
- **THEN** it returns `/home/pranav/projects/ai-sre-agent.md`
- **AND** `lookup` of that path returns the corresponding file node

### Requirement: Working directory is session state read by the prompt and commands

The terminal SHALL hold a current working directory (`cwd`) as session state, initialized to the home directory, and expose it to commands via `CommandContext` as `cwd: string` together with `setCwd: (path: string) => void`. The `cd` command SHALL be the only command that calls `setCwd`. The working directory SHALL NOT persist across reloads (a reload starts at the home directory).

#### Scenario: cd updates the working directory
- **GIVEN** `cwd` is the home directory
- **WHEN** the user runs `cd projects`
- **THEN** `setCwd` is called with `/home/pranav/projects`
- **AND** subsequent relative commands resolve against the new `cwd`

#### Scenario: Working directory resets on reload
- **GIVEN** the user has navigated into a subdirectory
- **WHEN** the page is reloaded
- **THEN** the working directory is the home directory again

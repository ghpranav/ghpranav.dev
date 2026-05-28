## Why

The terminal's command table currently lives as a single consolidated object inside `src/commands/index.ts`. The project's own conventions (CLAUDE.md, openspec/config.yaml) call for "one command per file exporting `{ name, help, run }`," and the consolidated table will become a friction point as soon as we add the next handful of commands (search/did-you-mean, tab completion across categories, per-command flag parsing). Splitting now, while the table is still small, is cheap; doing it after we add 5–10 more commands is not.

## What Changes

- Introduce a `Command` type (`{ name, help, run }`) and a per-command file convention under `src/commands/<name>.ts`.
- Move every existing entry (`help`, `whoami`, `about`, `skills`, `projects`, `contact`, `ask`, `theme`, `history`, `clear`, `cls`, `sudo`, `exit`, `echo`, `date`) into its own file.
- Replace the hand-built table in `src/commands/index.ts` with a registry that imports each command module and assembles the `CommandTable` from `Command.name` keys. Aliases (e.g. `cls` → `clear`) are expressed declaratively, not by duplicating handlers.
- Keep the existing `CommandContext` shape and `buildCommands(ctx)` entry point so `Terminal.tsx` does not change.
- The `help` command derives its rows from the registry instead of a parallel hand-maintained list — there is one source of truth for "what commands exist."
- **Non-goals**: no new commands, no behavior changes, no tab-completion or fuzzy-search work (those land in follow-up changes that this enables), no changes to `Terminal.tsx`, `Line.tsx`, or any rendering code.

## Capabilities

### New Capabilities
- `command-registry`: per-command file convention, the `Command` type, the registry that assembles `CommandTable`, and the rules for declaring aliases and help metadata.

### Modified Capabilities
<!-- none — no existing specs in openspec/specs/ -->

## Impact

- **Code**: `src/commands/index.ts` shrinks to a registry; ~15 new files under `src/commands/`. `Terminal.tsx` unchanged. `src/types.ts` may gain a `Command` type if not already covered.
- **APIs**: `buildCommands(ctx: CommandContext): CommandTable` signature is preserved. `CommandContext` shape unchanged.
- **Dependencies**: none added or removed.
- **Performance budget**: neutral. All command modules are statically imported (same code, same bundle); no new lazy chunks, no new runtime work. Initial JS gzipped size should be within ±0.5KB of current.
- **Tests**: none today; this change does not introduce any. Follow-up changes that add behavior (tab completion, did-you-mean) should add tests at that point.

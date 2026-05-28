## Context

Today, `src/commands/index.ts` is a single 100-line file that holds the entire command table inline inside `buildCommands(ctx)`. Each command is an inline object literal `{ help, run }` keyed by name. The `help` command's row list is a parallel hand-maintained array — adding a new command requires two edits (the table entry plus the help row), and forgetting one is silent.

The project's own conventions (`CLAUDE.md`, `openspec/config.yaml`) say "every command is one file exporting `{ name, help, run }`," and call out the consolidated table as something to fix when it gets split. We're at 15 commands; the next planned features (tab completion, did-you-mean) both want to iterate over the registry, which is the moment to enforce the convention.

## Goals / Non-Goals

**Goals:**
- One file per command under `src/commands/`, each exporting a `Command` object.
- A registry that assembles `CommandTable` from `Command.name` keys — no parallel lists.
- The `help` command derives its rows from the registry, so adding a command auto-extends help.
- Declarative aliases (`cls` → `clear`) without duplicating the handler.
- Zero behavior change. `Terminal.tsx` continues to call `buildCommands(ctx)` and receive an identical `CommandTable`.

**Non-Goals:**
- No new commands.
- No tab completion, fuzzy match, or "did you mean" — those are downstream changes this enables.
- No dynamic / lazy command loading. All commands are statically imported, same bundle.
- No change to `CommandContext`, `TerminalLine`, `Line.tsx`, or any rendering.
- No tests added (the repo has none today; tests land with the behavior changes they protect).

## Decisions

### Decision: `Command` type shape

```ts
export type Command = {
  name: string;                                            // primary key in the registry
  help: string;                                            // one-line help text
  aliases?: readonly string[];                             // optional alternate names
  run: (args: string[], ctx: CommandContext) => TerminalLine | null;
};
```

- `name` lives on the object (not just the registry key) so a command file is self-describing and the registry can be assembled by iterating modules.
- `run` takes `ctx` as a parameter instead of closing over it. This drops the `buildCommands(ctx)` factory closure-per-command pattern and makes each command a static export — easier to test, easier to read.
- `aliases` is declared on the canonical command (e.g. `clear` declares `aliases: ['cls']`) and expanded by the registry. Removes the current `cls: { run: () => { clear(); ... } }` duplication.

**Alternative considered**: keep `run: (args) => ...` and the factory closure. Rejected — it forces `buildCommands` to keep being a factory and prevents commands from being plain static modules.

### Decision: Registry assembly

`src/commands/index.ts` becomes:

```ts
import { about } from "./about";
import { ask } from "./ask";
// ...one import per command
import { help } from "./help";

const ALL: readonly Command[] = [about, ask, clear, contact, date, echo,
  exit, help, history, projects, skills, sudo, theme, whoami];

export function buildCommands(ctx: CommandContext): CommandTable {
  const table: Record<string, TableEntry> = {};
  for (const cmd of ALL) {
    const entry = { help: cmd.help, run: (args: string[]) => cmd.run(args, ctx) };
    table[cmd.name] = entry;
    for (const alias of cmd.aliases ?? []) table[alias] = entry;
  }
  return table;
}

export const COMMAND_REGISTRY = ALL;   // for help, future tab completion, did-you-mean
```

- `ALL` is a hand-maintained static array, not `import.meta.glob`. Vite supports glob but it produces uglier bundles and harder-to-grep code; with ~15 commands a static array is fine.
- The factory still exists and still returns `CommandTable`, so `Terminal.tsx` does not change.
- `COMMAND_REGISTRY` is exported so `help` and future tab-completion code can iterate without re-doing the closure dance.

**Alternative considered**: `import.meta.glob('./*.ts')` for auto-registration. Rejected — implicit, harder to follow, and breaks the "every command is grep-able from a single registry file" property.

### Decision: `help` derives from the registry

Today's `help` command has a parallel array. After this change, `help.run` iterates `COMMAND_REGISTRY` and emits one row per command:

```ts
run: () => ({
  type: "help",
  rows: COMMAND_REGISTRY
    .filter(c => !c.hidden)
    .map(c => [c.name, c.help]),
})
```

A new optional field `hidden?: boolean` lets us keep `sudo` and `cls`-style joke/alias entries out of help if we want; for this change, default behavior is "show everything currently shown by the hand-built list." The current help list orders commands as: ask, whoami, about, skills, projects, contact, theme, history, clear, exit. We preserve this exact order via an explicit `order` field on each command (small integer; ties broken by name) OR by ordering the `ALL` array deliberately. We choose **ordering by the `ALL` array** — simpler, no extra field, and the array is right there to read.

### Decision: File layout

```
src/commands/
  index.ts          # registry + buildCommands
  types.ts          # Command type (or re-exported from src/types.ts)
  about.ts
  ask.ts
  clear.ts          # declares aliases: ['cls']
  contact.ts
  date.ts
  echo.ts
  exit.ts
  help.ts
  history.ts
  projects.ts
  skills.ts
  sudo.ts
  theme.ts
  whoami.ts
```

The `Command` type can live in `src/types.ts` next to `TerminalLine` and `CommandTable`, or in `src/commands/types.ts`. We pick `src/types.ts` to keep all shared types co-located and avoid an extra import path.

## Risks / Trade-offs

- **[Risk]** Bundle size grows from extra module overhead. **Mitigation**: Vite's rollup tree-shakes and inlines small modules; in practice the gzip delta will be < 0.5KB. We will verify by running `bun run build` before/after and comparing the gzipped `dist/assets/*.js` size, with a hard fail threshold of +1KB.
- **[Risk]** The `help` row reordering is silent if the `ALL` array order doesn't match the current list. **Mitigation**: explicit ordering rule (the `ALL` array order *is* the help order), and the implementer manually diffs the rendered help output against the current behavior before merging.
- **[Risk]** Subtle behavior change from `run` no longer closing over `ctx`. **Mitigation**: the registry wraps each `run` so the external `CommandTable` entry still presents `(args) => ...`; `Terminal.tsx` sees no difference. The `theme`, `clear`, and `ask` handlers — the only ones that use `ctx` — are spot-checked manually after the split.
- **[Trade-off]** Static `ALL` array means adding a command requires an import line plus an array entry. We accept this over `import.meta.glob` for readability and grep-ability.

## Migration Plan

This is internal refactor of a static site. No deploy gates, no feature flags.

1. Land the change behind no flag.
2. `bun run lint` and `bun run build` must pass.
3. Manually exercise every command in the dev server (`bun run dev`) before merging: `help`, each listed row, `theme <name>`, `theme` with no args, `theme bogus`, `ask`, `clear`/`cls`, `echo foo bar`, `date`, unknown command.
4. Compare gzipped JS size before/after (see Risks).
5. No rollback strategy needed beyond `git revert` — the change is isolated to `src/commands/` and `src/types.ts`.

## Open Questions

- None blocking. The `hidden` flag on `Command` is introduced *only if needed* to preserve current help output; if `ALL` ordering plus showing every command matches today's list, we skip the field.

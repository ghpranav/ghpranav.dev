## Context

The command registry (`src/commands/index.ts`) builds a `CommandTable` from an `ALL` array of `Command` objects, each `{ name, help, aliases?, hidden?, complete?, run }`. `run` is `(args, ctx) => TerminalLine | null`. `ctx` exposes `theme`, `setTheme`, `clear`, `history`, `enterChat`. Rendering is a single switch in `src/components/Line.tsx` over the `TerminalLine` discriminated union (`src/types.ts`). Static content lives in `src/content/site.ts`.

Adding a command is deliberately cheap: new file → one entry in `ALL`. Adding an output *kind* costs two edits: a union variant + a `Line.tsx` case (TypeScript exhaustiveness enforces the pair). This proposal leans on that grain: many new commands, almost all reusing existing variants, exactly one new variant.

## Goals / Non-Goals

**Goals:**
- Make the shell feel real for the obvious "is this a real terminal?" probes (`pwd`, `man`, `which`, `neofetch`, `grep`).
- Reward the curious with on-brand easter eggs in the established lowercase, deadpan voice.
- Add zero new architecture: no `cwd`, no state, no dependency, no dynamic import.
- Keep `help` clean — only `neofetch` and `grep` are visible; the rest are `hidden`.

**Non-Goals:**
- A virtual filesystem (sibling proposal). Pipes/redirection. Animations or font tables. POSIX fidelity.

## Decisions

### 1. Reuse existing line variants everywhere except `neofetch`

`grep`, `man`, `which`, `alias`, `pwd`, `uname`, `cal`, `uptime`, `fortune`, the editor trap, and `rm` all return `text` (or `error` for `rm`/refusals; `ascii` for `cowsay`'s pre-formatted bubble). Only `neofetch` gets a new variant.

**Why a variant for `neofetch`:** its value is the two-column layout — a logo column beside themed `label: value` rows where labels use `theme.accent`. Encoding that as a pre-built `text` blob would bake colors into a string and lose theme-reactivity; a structured `{ logo, rows }` variant lets `Line.tsx` color labels live off the active theme, exactly like the other themed renderers. This is the same trade the existing `skills`/`contact` variants make.

```
{ type: "neofetch";
  logo: string;                              // NEOFETCH_LOGO
  rows: ReadonlyArray<readonly [string,string]>; // [["os","pranav-os"], …]
  accent?: boolean }
```

**Why `cowsay`/`cal` reuse `ascii`/`text`, not a variant:** they are monochrome pre-formatted blocks; the existing monospace rendering is sufficient, so no union growth is justified.

### 2. `neofetch` content sources

| field | source |
|-------|--------|
| os | constant `pranav-os` |
| host | constant `dev` (matches the prompt) |
| kernel | constant, e.g. `wasm-1.0` |
| shell | `zsh` (matches the footer) |
| theme | `ctx.theme.name` |
| uptime | `performance.now()` since mount, formatted `Xm Ys` |
| packages | count of non-hidden registry commands (or total) |
| resolution | `window.innerWidth × innerHeight` |

The logo is a **new, compact** `NEOFETCH_LOGO` in `site.ts`, not `ASCII_NAME` (too wide to sit beside a table on mobile). On narrow viewports `Line.tsx` may stack logo-above-rows; the data shape is layout-agnostic.

**Why not reuse `ASCII_NAME`:** width. The big banner is ~44 cols; beside an info column it overflows mobile. A dedicated ~20-col mark keeps neofetch readable on phones (mobile-first per the project's honest-limitations note).

### 3. `grep` searches a derived content index, not a filesystem

`grep` flattens `SKILLS` (as `category → terms`) and `PROJECTS` (name + blurb + stack) into searchable rows at call time and returns matching lines as `text`, prefixed by source (e.g. `skills.backend: Kafka`, `projects/ai-sre-agent: …LangGraph…`). Case-insensitive substring; multiple args are OR-ed. No regex engine (avoids catastrophic-regex risk and keeps it tiny).

**Why no regex:** a literal substring covers the real use ("does he know X?") with zero ReDoS surface and near-zero code. If regex is ever wanted, it's an additive flag later.

### 4. `man` / `which` derive from the registry and advertise completion

Both import `COMMAND_REGISTRY`. `man <cmd>` formats NAME (`<cmd> — <help>`), SYNOPSIS (`<cmd> [args]`, plus aliases), DESCRIPTION (help text, expanded for a few key commands). `which <cmd>` returns `/usr/bin/<cmd>` if the name/alias exists, else `<cmd> not found`. Both implement `complete(args)` returning registry command names so `man th⇥` → `man theme`.

**Why reuse the existing `complete` hook:** the completion helper is already registry-driven and prefix-filters the returned list; `man`/`which` only need to advertise the candidate universe. This exercises infrastructure that currently only `theme` uses.

### 5. Easter-egg voice and safety

`rm` never deletes anything (there's nothing to delete) — it refuses in-character, with a special line for `rm -rf ~` / `rm -rf /`. The editor commands (`vim`/`vi`/`nano`/`emacs`) print the "you're trapped" gag; `:q`/`:q!`/`:wq`/`:x`/`ZZ` reply with the wink. All lowercase, deadpan, matching `sudo` and `exit`.

**Why bundle editors in one file:** they share one implementation and a single joke table; per the per-command-file convention each *name* is still a registry entry, but co-locating the family in `editors.ts` (exporting several `Command`s) keeps the joke in one place. (Flag: the spec's "one file per command" is satisfied by exporting each `Command` as a named export; multiple related commands in one file is consistent with how `index.ts` imports them.)

### 6. Visibility split

Visible (`help` rows): `neofetch`, `grep`. Hidden: everything else. Rationale: `help` should stay a tight portfolio menu; discovery of the rest is the reward. `man`/`which` being hidden is itself a small joke (you have to know `man` exists to look things up).

## Risks / Trade-offs

- **`neofetch` on mobile.** A wide logo + table overflows. Mitigation: compact `NEOFETCH_LOGO` + a stacked fallback in `Line.tsx`; verify at 320px.
- **One file exporting several `Command`s (editors).** Slight tension with "one file per command." Accepted: each command is still a named export wired once; the alternative is four near-identical files. Documented in the spec scenario.
- **Scope creep.** The easter-egg list could grow forever (`sl`, `matrix`, `top`…). This proposal fixes a deliberate, budget-safe set; more are additive later.
- **Overlap with `add-virtual-filesystem`.** Both add `pwd` and extend "Registered commands". If both ever land, `pwd` must become the VFS-aware one and the spec deltas reconcile. Called out in the proposal; only one is meant to land first.
- **`uptime`/`resolution` are non-deterministic.** Fine for flavor; tests assert shape (a `neofetch` line with the expected row labels), not exact values.

## Migration Plan

Purely additive, front-end only, no data/API surface. Land as one change: content (`site.ts`) → variant (`types.ts` + `Line.tsx`) → command files → registry wiring → spec delta. Each command is independently revertible; rollback is reverting the commit. No migration of existing commands or saved state.

## Open Questions

- Should `neofetch` count **all** commands or only visible ones for "packages"? Default: total (it's funnier when the easter eggs inflate the count).
- `fortune` corpus: generic dev quotes vs. Pranav-flavored one-liners? Default: a short mixed list in `site.ts`, easy to extend.
- Do we want `clear`-style aliases for any new command (e.g. `ll`)? Deferred — `ll` only makes sense with `ls` (the VFS proposal).

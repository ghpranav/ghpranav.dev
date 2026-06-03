## Why

The site *is* a terminal, but the shell underneath it is thin: fourteen commands, most of them portfolio nouns (`whoami`, `skills`, `projects`). Anyone who actually behaves like they're in a shell — types `pwd`, `man theme`, `grep kafka`, or the near-obligatory `neofetch` — hits `command not found: …` on the first try. That breaks the central conceit at exactly the moment a curious visitor is testing how real the illusion is.

There's a cheap, high-personality win here: a set of **self-contained builtin and easter-egg commands** that make the shell feel real without adding any new architecture. Every one is a pure `args → TerminalLine` function (a couple read `ctx` for theme/registry), so this rides the existing command-registry conventions exactly — one file per command, one registry entry, no new state.

> This is **one of two alternative proposals** exploring how to deepen the command set. The sibling, `add-virtual-filesystem`, commits to a navigable filesystem (`ls`/`cat`/`cd`/`tree`) with a `cwd` and a richer prompt. This proposal stays **flat**: no `cwd`, no filesystem, no path resolution. The two overlap on `pwd` and both extend the `command-registry` "Registered commands" set, so they are not meant to both land unreconciled — pick the thread, or land this first as the low-risk layer and the VFS later.

## What Changes

New commands (each its own `src/commands/<name>.ts`, wired once into `ALL`):

**Utility — make the shell feel real**
- `neofetch` *(visible)* — the flagship: a compact ASCII logo beside a system-info table (os `pranav-os`, host `dev`, shell `zsh`, theme = active theme name, uptime = time since page load, packages = registered command count, resolution = viewport). Ties identity + active theme + ASCII together; the canonical "screenshot this" command.
- `grep <term> [more...]` *(visible)* — case-insensitive substring search across `SKILLS` and `PROJECTS`. `grep kafka` surfaces Kafka in `skills.backend` *and* the two projects that use it. Genuinely useful, not just flavor.
- `man <command>` *(hidden)* — a NAME / SYNOPSIS / DESCRIPTION manual page derived from the registry (`help` text + aliases). Offers command-name tab completion.
- `which <command>` / alias `type` *(hidden)* — prints `/usr/bin/<command>` for a real command, a not-found line otherwise. Offers command-name tab completion.
- `alias` *(hidden)* — lists the declared aliases in the registry (e.g. `cls='clear'`).
- `pwd` *(hidden)* — prints `/home/pranav`.
- `uname [-a]` *(hidden)* — `pranav-os 1.0.0 … wasm`; `-a` for the long form.
- `cal` *(hidden)* — the current month as a calendar grid, today highlighted.
- `uptime` *(hidden)* — "up <Xm Ys>, since this tab opened", from `performance.now()`.

**Easter eggs — personality, matching the existing `sudo` / "there's no door" voice**
- `cowsay <text>` *(hidden)* — the speech-bubble cow around the argument text.
- `fortune` *(hidden)* — a random dev aphorism from a small curated list.
- `vim` / `vi` / `nano` / `emacs` *(hidden)* — the editor trap: "you're trapped in {editor}. try `:q`, `:q!`, `:wq`… (it won't help)". `:q` and friends reply with a wink.
- `rm <args>` *(hidden)* — refuses, cheekily, especially for `rm -rf ~` / `rm -rf /`.

Supporting changes:
- **One new line variant** `neofetch` in `TerminalLine` (logo + themed label/value rows). Every other new command reuses existing `text` / `ascii` / `error` variants — no further union growth.
- **Content additions** to `src/content/site.ts`: `FORTUNES` (string list) and `NEOFETCH_LOGO` (a compact ASCII mark, narrower than `ASCII_NAME` so it sits beside the info table). Content stays in data, per convention.

## Capabilities

### New Capabilities

_(none — no new capability; this extends the existing shell)_

### Modified Capabilities

- `command-registry`: extends the "Registered commands" set with the utility and easter-egg commands above (names, hidden/visible status, aliases, and observable output); extends "Command output types" with the single new `neofetch` variant; specifies that `man` and `which` advertise command-name completion via the existing `complete` hook. No change to dispatch, the "did you mean" suggester, or the help-derivation mechanism (the new visible commands simply appear in `help`).

## Impact

- **`src/commands/*.ts`** — one new file per command: `neofetch.ts`, `grep.ts`, `man.ts`, `which.ts`, `alias.ts`, `pwd.ts`, `uname.ts`, `cal.ts`, `uptime.ts`, `cowsay.ts`, `fortune.ts`, `editors.ts` (exports the `vim`/`vi`/`nano`/`emacs` + `:q` set), `rm.ts`.
- **`src/commands/index.ts`** — import + append each to the `ALL` array (one line each).
- **`src/types.ts`** — add `{ type: "neofetch"; logo: string; rows: ReadonlyArray<readonly [string, string]>; accent?: boolean }` to `TerminalLine`.
- **`src/components/Line.tsx`** — add the `case "neofetch":` renderer (logo column + label/value rows themed off the active theme).
- **`src/content/site.ts`** — add `FORTUNES` and `NEOFETCH_LOGO` exports.
- **`openspec/specs/command-registry/spec.md`** — "Registered commands" and "Command output types" extended.
- **Performance budget** — all new commands are tiny pure functions over small static strings; no dependency, no dynamic import, all statically imported by the registry. Initial JS stays well under the 60 KB gzipped budget; LCP/Lighthouse unaffected. (`neofetch` adds one render arm, not a chunk.)

## Non-goals

- **No virtual filesystem, `cwd`, or path-based commands** (`ls`, `cat`, `cd`, `tree`, `find`) — that is the sibling `add-virtual-filesystem` proposal. `pwd` here prints a constant; it does not track a working directory.
- **No pipes or redirection.** `fortune | cowsay` is tempting but parsing a pipeline is out of scope; each command is invoked standalone.
- **No animation-heavy or font-table commands** (`matrix`/`cmatrix`, `figlet`, `sl`) — they threaten the LCP / <60 KB JS budget and earn a separate decision.
- **No real shell semantics** (env vars, job control, globbing). These are flavor commands, not a POSIX shell.
- **No change to the existing fourteen commands' behavior** — purely additive.

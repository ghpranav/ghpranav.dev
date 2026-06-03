## Why

The prompt already advertises a filesystem — `pranav@dev:~$` names a user, a host, and a home directory — but there's nothing behind the `~`. Type `ls` and you get `command not found`. The terminal's most evocative promise is unredeemed.

This change redeems it: a small **in-memory virtual filesystem** where the portfolio *is* a directory tree you walk. `ls` lists it, `cat about.txt` prints the bio, `cd projects && cat ai-sre-agent.md` opens a project, `tree` shows the whole thing. A portfolio you explore like a disk is memorable in a way a flat command list is not — and it makes a dozen classic commands earn their place at once, because now there is something for them to operate on.

> This is **one of two alternative proposals**. The sibling, `add-shell-builtins`, stays flat — self-contained commands (`neofetch`, `grep`, `man`, easter eggs) with no `cwd` and no architectural change. This proposal is the **signature upgrade**: it introduces a working directory, a richer prompt, path resolution, and path-aware tab completion. It is more code and more state. The two overlap on `pwd` (here it is real, tracking `cwd`) and both extend the `command-registry` "Registered commands" set, so they are not meant to both land unreconciled. The flat set could land first as a low-risk layer and this on top later; or pick this thread directly.

## What Changes

**A virtual filesystem module** (`src/lib/vfs.ts`): a static tree of nodes rooted at `/home/pranav` (`~`). Files don't store duplicated prose — each maps to existing content in `src/content/site.ts`, so the bio has exactly one source of truth.

```
~/
├── about.txt          → ABOUT
├── skills.json        → SKILLS (pretty-printed)
├── contact.txt        → CONTACTS
├── resume.pdf         → opens/downloads the résumé link
├── .secret            → an easter egg
└── projects/
    ├── ai-sre-agent.md
    ├── ai-sre-pipeline.md
    ├── release-platform.md
    └── bigquery-cicd.md      → one per PROJECTS entry
```

**A working directory.** `CommandContext` gains `cwd: string` and `setCwd(path)`. The shell prompt reflects it: `pranav@dev:~$` → `pranav@dev:~/projects$`. The `cwd` lives in `Terminal.tsx` state next to the other session state.

**Filesystem commands** (each its own `src/commands/<name>.ts`):
- `ls [-l] [-a] [path]` *(visible)* — lists a directory (or stats a file); `-a` reveals dotfiles, `-l` adds a long form; directories and files are visually distinguished.
- `cat <file>` *(visible)* — prints a file. Crucially, `cat` dispatches to the **existing rich renderers**: `cat skills.json` returns the `skills` line, `cat projects/ai-sre-agent.md` returns a project detail, `cat about.txt` returns `text`. `cat resume.pdf` opens the résumé.
- `cd [path]` *(visible)* — changes `cwd` (`cd`, `cd ~`, `cd ..`, `cd /home/pranav`, relative paths); errors on a missing dir or on `cd` into a file.
- `pwd` *(visible)* — prints the absolute `cwd`.
- `tree [path]` *(visible)* — recursive view of the tree from a node.
- `find <name>` *(hidden)* — prints paths whose basename contains the query.
- *(stretch, hidden)* `head` / `tail` / `wc` over file content; `file` / `stat` metadata. Included only if they stay trivial.

**Path-aware tab completion.** `cd`, `cat`, `ls`, and `tree` implement the existing `complete` hook to advertise the entries at the relevant directory, so `cat ab⇥` → `cat about.txt` and `cd pr⇥` → `cd projects/`.

**Coexistence.** The flat shortcuts stay: `about`, `skills`, `projects`, `contact` keep working. `cat about.txt` and `about` are two doors to the same content. The VFS is additive, not a replacement.

## Capabilities

### New Capabilities

- `virtual-filesystem`: the in-memory tree model, its mapping to `site.ts` content, path resolution semantics (`~`, `.`, `..`, absolute, relative), and the working-directory concept that filesystem commands and the prompt read.

### Modified Capabilities

- `command-registry`: extends "Registered commands" with `ls`, `cat`, `cd`, `pwd`, `tree`, `find` (+ optional `head`/`tail`/`wc`/`file`/`stat`) and their observable output; extends "Command output types" with a `listing` variant for `ls`; documents that `cat` may return existing rich variants (`skills`/`projects`/`text`) depending on the file; documents path completion via the `complete` hook for `cd`/`cat`/`ls`/`tree`; extends `CommandContext` with `cwd`/`setCwd`.
- `terminal-shell`: extends "Two prompt modes" so the shell-mode prompt encodes the current working directory (with `~` abbreviation for the home dir), updating live as `cd` changes `cwd`.

## Impact

- **`src/lib/vfs.ts`** (new) — the tree definition + `resolvePath(cwd, arg)`, `lookup(path)`, `listDir(path)`, and the content mapping to `site.ts`.
- **`src/types.ts`** — `CommandContext` gains `cwd: string` and `setCwd: (p: string) => void`; `TerminalLine` gains a `listing` variant for `ls` (`{ type: "listing"; entries: ReadonlyArray<{ name: string; kind: "dir" | "file" }>; long?: boolean }`).
- **`src/components/Terminal.tsx`** — add `cwd` state + `setCwd`; pass both into the command context; build the shell prompt from `cwd` (abbreviating the home dir to `~`); reset `cwd` on `clear`? (no — `clear` only clears output).
- **`src/components/Line.tsx`** — add the `case "listing":` renderer (dir/file styling via theme).
- **`src/commands/*.ts`** — `ls.ts`, `cat.ts`, `cd.ts`, `pwd.ts`, `tree.ts`, `find.ts` (+ optional stretch files); wired into `ALL`.
- **`src/content/site.ts`** — possibly a `RESUME_URL` and a `.secret` string; no duplication of existing prose.
- **`openspec/specs/command-registry/spec.md`**, **`openspec/specs/terminal-shell/spec.md`** — modified per above; **`openspec/specs/virtual-filesystem/spec.md`** — new capability spec (created on archive).
- **Performance budget** — the VFS is a small static object + a pure path resolver (~150–250 LOC), statically imported, no dependency, no dynamic import. It adds more JS than the flat proposal but stays well under 60 KB gzipped. No animation; LCP unaffected. Flag in the proposal per the budget rule.

## Non-goals

- **No writes.** `touch`, `mkdir`, `rm`, `mv`, `echo > file` are out of scope — the tree is read-only (it's a portfolio, not a sandbox). `rm` may exist only as the in-character refusal gag (and only if not already owned by the sibling proposal).
- **No real file content beyond the portfolio.** Files map to existing `site.ts` content; this is not a general fake-OS with `/etc`, `/usr`, `/proc`.
- **No pipes, redirection, or globbing** (`cat *.md`, `ls | grep`). Each command takes a single path argument.
- **No persistence.** `cwd` is session state; a reload starts at `~`. (If conversation memory work later wants to persist `cwd`, that's a separate change.)
- **Not replacing the flat commands.** `about`/`skills`/`projects`/`contact` remain as shortcuts.

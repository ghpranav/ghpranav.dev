## Context

`Terminal.tsx` owns session state and builds the prompt string (`ghpranav@dev:~$`, `Terminal.tsx:482/627`) and the `CommandContext` passed to every command. Commands are pure `(args, ctx) => TerminalLine | null`. The `complete?` hook (currently used only by `theme`) advertises completion candidates that a registry-driven helper prefix-filters. Rendering is a switch over the `TerminalLine` union in `Line.tsx`. Rich variants already exist for `skills`, `projects`, `contact` — they render `site.ts` content.

The key insight: the portfolio content already lives as typed exports (`ABOUT`, `SKILLS`, `PROJECTS`, `CONTACTS`). A virtual filesystem doesn't need new content — it needs a **tree that points at that content**, plus path resolution and a working directory. `cat` then *reuses* the existing rich renderers instead of re-printing prose.

## Goals / Non-Goals

**Goals:**
- Make `~` real: a navigable, read-only tree mapping to `site.ts`, with `ls`/`cat`/`cd`/`pwd`/`tree`/`find`.
- One source of truth for content — files reference `site.ts`, never copy it.
- A prompt that tracks `cwd`, and path-aware tab completion, both via existing mechanisms.
- Stay within the JS budget; no dependency, no dynamic import.

**Non-Goals:**
- Writes, persistence, pipes/redirection/globbing, a general fake-OS, or replacing the flat commands.

## Decisions

### 1. The VFS is a static tree of nodes that *reference* content, not copies of it

`src/lib/vfs.ts` defines:

```ts
type VfsFile = {
  type: "file";
  name: string;
  hidden?: boolean;                 // dotfiles
  render: () => TerminalLine;       // what `cat` returns
  preview?: string;                 // plain text for find/wc/grep-like use
};
type VfsDir = { type: "dir"; name: string; children: VfsNode[] };
type VfsNode = VfsFile | VfsDir;
```

The root (`/home/pranav`) holds `about.txt` (`render → { type:"text", text: ABOUT }`), `skills.json` (`render → { type:"skills", data: SKILLS }`), `contact.txt` (`render → { type:"contact", data: CONTACTS }`), `resume.pdf` (`render` opens the résumé link), `.secret` (hidden), and `projects/` with one file per `PROJECTS` entry (`render → { type:"projects", data:[entry] }`).

**Why `render` thunks instead of storing strings:** it keeps a single source of truth (the bio lives only in `site.ts`) and lets `cat skills.json` produce the *same rich table* as the `skills` command rather than a JSON blob. The VFS is a view over content, not a second copy.

### 2. `cat` dispatches to existing rich variants

`cat <file>` resolves the path, then returns `node.render()`. So:
- `cat about.txt` → `text`
- `cat skills.json` → `skills` (the existing table)
- `cat projects/ai-sre-agent.md` → `projects` with a single entry
- `cat resume.pdf` → opens/downloads the résumé (returns a `text` confirmation line)
- `cat <dir>` → `error` `cat: <name>: Is a directory`
- `cat <missing>` → `error` `cat: <name>: No such file or directory`

**Why reuse variants:** zero new rendering for `cat`, and the VFS instantly feels rich (tables, not text dumps). The only new variant this change needs is for `ls`.

### 3. Exactly one new line variant: `listing` (for `ls`)

```
{ type: "listing";
  entries: ReadonlyArray<{ name: string; kind: "dir" | "file" }>;
  long?: boolean }
```

`Line.tsx` colors dirs vs files from the theme (dirs in `accent`, trailing `/`), lays them out in columns, and renders a long form when `long`. `tree` and `find` reuse `ascii`/`text` (pre-formatted). `pwd` reuses `text`.

**Why a variant for `ls` but not `tree`:** `ls` benefits from per-entry styling and responsive columns (structured data → themed render). `tree` is inherently a single pre-formatted block; a `text`/`ascii` line suffices.

### 4. `cwd` lives in `Terminal.tsx`; the prompt is derived from it

Add `const [cwd, setCwd] = useState("/home/pranav")`. Pass `cwd` + `setCwd` into the command context. The shell prompt becomes `ghpranav@dev:${abbrev(cwd)}$` where `abbrev` replaces the home-dir prefix with `~` (`/home/pranav` → `~`, `/home/pranav/projects` → `~/projects`). Chat-mode prompt is unchanged.

**Why in `Terminal.tsx`, not a global store:** the project's convention is "no external state library, just hooks." `cwd` is session state exactly like `lines`/`history`/`theme`, and the prompt already renders there.

### 5. Path resolution is a small pure helper

`resolvePath(cwd, arg): string` handles `~` (→ home), absolute (`/…`), `.`/`..`, and relative segments; normalizes `..` past root to root; returns an absolute path. `lookup(absPath): VfsNode | null` walks the tree. `cd`/`cat`/`ls`/`tree`/`find` all go through these two functions.

**Why centralize:** every command needs identical path semantics; one tested resolver avoids per-command drift and is the natural unit-test seam.

### 6. Path-aware tab completion via the existing `complete` hook

`cd`, `cat`, `ls`, `tree` implement `complete(args, ctx)`: resolve the directory portion of the in-progress argument against `cwd`, return the entries there (dirs suffixed `/`), and let the helper prefix-filter. `cd` returns only directories; `cat` returns files (and dirs, to allow descending). Hidden dotfiles are offered only when the fragment starts with `.`.

**Why this fits:** the helper already prefix-filters whatever `complete` returns; the hook just needs to advertise the right universe for the current `cwd`. This finally exercises argument completion for something content-driven.

### 7. Coexistence with flat commands

`about`/`skills`/`projects`/`contact` stay as top-level shortcuts. The VFS is additive — `cat about.txt` and `about` share the same `render`/content. No flat command is removed or changed.

**Why keep both:** removing the shortcuts would be a gratuitous breaking change to muscle memory and to any `add-crawlable-content` work that may reference them; the doors are cheap.

## Risks / Trade-offs

- **More state and more code than the flat proposal.** A `cwd`, a resolver, a new variant, path completion. Mitigation: the resolver is small and pure (unit-testable); the variant is one arm; `cat` adds no rendering.
- **Overlap with `add-shell-builtins`.** Both add `pwd`; both extend "Registered commands". If both land, `pwd` is the VFS-aware one and the deltas reconcile. Called out in the proposal.
- **Budget.** ~150–250 LOC of VFS + commands. Still no dependency, no dynamic import, no animation — comfortably under 60 KB gzipped, but larger than the flat set; flagged per the budget rule and to be re-measured on build.
- **Mobile UX of `tree`/`ls`.** Wide trees wrap awkwardly on phones. Mitigation: shallow tree (two levels), responsive columns for `listing`, verify at 320px.
- **`cd` confusion vs chat mode.** `cd` is shell-mode only; in chat mode input goes to the model. No conflict, but worth a test that `cd` does nothing special in chat mode.
- **Scope temptation.** `mkdir`/`touch`/`mv` and a full `/etc` are easy to over-build. Held out as non-goals; the tree is read-only and portfolio-shaped.

## Migration Plan

Front-end only, additive. Order: `vfs.ts` (tree + resolver, with unit tests) → `types.ts` (`cwd`/`setCwd` on context, `listing` variant) → `Terminal.tsx` (`cwd` state + prompt) → `Line.tsx` (`listing` arm) → command files → registry wiring → spec deltas. Each command is independently revertible; the prompt change is the only edit to existing render logic and is a pure derivation from `cwd`. Rollback is reverting the commit; with no persistence there's no state to migrate.

## Open Questions

- `resume.pdf`: open in a new tab vs trigger a download vs print a link line? Default: open the existing résumé/contact link in a new tab and print a `text` confirmation (no real binary).
- Should `ls` with no args at `~` also list the flat-command shortcuts somehow? Default: no — `ls` lists files; `help` lists commands. Keep the two mental models distinct.
- Include the stretch `head`/`tail`/`wc`/`file`/`stat`? Default: implement `file`/`stat` (trivial metadata) and defer `head`/`tail`/`wc` unless a file's `preview` makes them one-liners.
- Persist `cwd` across reloads (localStorage)? Default: no; coordinate with `add-webllm-conversation-memory` if session persistence becomes a theme.

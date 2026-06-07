## 1. Virtual filesystem module

- [ ] 1.1 Create `src/lib/vfs.ts`: define `VfsFile` / `VfsDir` / `VfsNode` types and the static tree rooted at `/home/pranav` — `about.txt`, `skills.json`, `contact.txt`, `resume.pdf`, hidden `.secret`, and `projects/` with one file per `PROJECTS` entry. Each file's `render` thunk returns the appropriate `TerminalLine`, referencing `src/content/site.ts` (no prose duplicated).
- [ ] 1.2 Implement `resolvePath(cwd, arg)` — handle `~`, absolute, `.`, `..` (clamped at root), and relative paths; return a normalized absolute path
- [ ] 1.3 Implement `lookup(absPath)` (walk the tree → node | null) and `listDir(absPath)` helpers
- [ ] 1.4 Add `RESUME_URL` (and a `.secret` string) to `src/content/site.ts` if not already present

## 2. Types, context, and the listing variant

- [ ] 2.1 In `src/types.ts`, add `cwd: string` and `setCwd: (path: string) => void` to `CommandContext`
- [ ] 2.2 In `src/types.ts`, add `{ type: "listing"; entries: ReadonlyArray<{ name: string; kind: "dir" | "file" }>; long?: boolean }` to `TerminalLine`
- [ ] 2.3 In `src/components/Line.tsx`, add a `case "listing":` arm — responsive columns, dirs styled with `theme.accent` and a trailing `/`, long form when `long`

## 3. Working directory and prompt

- [ ] 3.1 In `src/components/Terminal.tsx`, add `const [cwd, setCwd] = useState("/home/pranav")` and pass `cwd` + `setCwd` into the command context
- [ ] 3.2 Build the shell-mode prompt from `cwd` via an `abbrev(cwd)` that renders the home dir as `~` (`ghpranav@dev:${abbrev(cwd)}$`); leave the chat-mode prompt unchanged; do not reset `cwd` when leaving chat mode

## 4. Filesystem commands

- [ ] 4.1 `src/commands/cd.ts` — resolve arg (default home); `setCwd` for a dir; `error` for missing path / not-a-directory; return `null` on success; `complete` offers directories at the target dir. Visible.
- [ ] 4.2 `src/commands/ls.ts` — list the resolved dir (or `cwd`); `-a` includes dotfiles, `-l` sets `long`; single entry for a file path; `error` for missing path; return a `listing` line; `complete` offers entries. Visible.
- [ ] 4.3 `src/commands/cat.ts` — resolve file, return `node.render()`; `error` for dir / missing; `resume.pdf` opens `RESUME_URL` and returns a `text` confirmation; `complete` offers files/dirs. Visible.
- [ ] 4.4 `src/commands/pwd.ts` — return a `text` line with `ctx.cwd`. Visible.
- [ ] 4.5 `src/commands/tree.ts` — recursive pre-formatted view from the resolved path (or `cwd`); return `ascii`/`text`. Visible.
- [ ] 4.6 `src/commands/find.ts` — print paths whose basename contains the query; return `text`. Hidden.
- [ ] 4.7 (Optional) `src/commands/file.ts` / `stat` — trivial `text` metadata for a node. Hidden.

## 5. Registry wiring

- [ ] 5.1 In `src/commands/index.ts`, import and append `cd`, `ls`, `cat`, `pwd`, `tree`, `find` (+ optional `file`/`stat`) to `ALL`
- [ ] 5.2 Confirm `help` shows `ls`, `cat`, `cd`, `pwd`, `tree`; `find` (+ optional) stay hidden; flat shortcuts `about`/`skills`/`projects`/`contact` still work

## 6. Spec deltas

- [ ] 6.1 (Captured in the spec delta) ADD the `virtual-filesystem` capability (tree, path resolution, working directory)
- [ ] 6.2 (Captured in the spec delta) MODIFY `command-registry`: "Command output types" (`listing` variant, `cat` reuse), new "Command context exposes the working directory", "Registered commands" (fs commands), "Performance budget"
- [ ] 6.3 (Captured in the spec delta) MODIFY `terminal-shell` "Two prompt modes" so the prompt encodes `cwd`

## 7. Verify

- [ ] 7.1 Unit-test `resolvePath`/`lookup`: `~`, absolute, `.`, `..` clamping, relative resolution, missing nodes (this repo has no tests yet — set up the first test seam around `vfs.ts`)
- [ ] 7.2 Run `bun run lint` and `bun run build` — no ESLint or type errors (incl. `TerminalLine` exhaustiveness for `listing`, and the `CommandContext` shape change threaded through `Terminal.tsx`)
- [ ] 7.3 Confirm no new dependency and no `import(` in command/registry/vfs code; measure initial JS stays < 60 KB gzipped (flag if it moves materially)
- [ ] 7.4 Manually exercise in `bun run dev`: `ls`, `ls -a`, `cd projects`, prompt shows `~/projects`, `cat ai-sre-agent.md` (rich render), `cat ../about.txt`, `cd ..`, `cat skills.json` (skills table), `tree`, `cat resume.pdf` (opens link), `cd nope` (error), `cat projects` (is-a-directory error)
- [ ] 7.5 Verify path tab-completion: `cat ab⇥` → `about.txt`, `cd pr⇥` → `projects/`, dotfiles only offered after `.`
- [ ] 7.6 Verify `ls`/`tree` are readable at 320px width; confirm leaving/returning to chat mode preserves `cwd`

## 1. Type & scaffolding

- [x] 1.1 Add `Command` type to `src/types.ts` matching design: `{ name; help; aliases?; hidden?; run(args, ctx) }`
- [x] 1.2 Capture baseline gzipped JS size: run `bun run build` and record `dist/assets/*.js` gzipped bytes (for the +1KB budget check in task 4.4) — baseline: `index-*.js` gz=**70,318 bytes**

## 2. Per-command files

- [x] 2.1 Create `src/commands/about.ts` exporting `about: Command`
- [x] 2.2 Create `src/commands/whoami.ts` exporting `whoami: Command`
- [x] 2.3 Create `src/commands/skills.ts` exporting `skills: Command`
- [x] 2.4 Create `src/commands/projects.ts` exporting `projects: Command`
- [x] 2.5 Create `src/commands/contact.ts` exporting `contact: Command`
- [x] 2.6 Create `src/commands/ask.ts` exporting `ask: Command` (uses `ctx.enterChat`)
- [x] 2.7 Create `src/commands/theme.ts` exporting `theme: Command` (uses `ctx.theme` + `ctx.setTheme`)
- [x] 2.8 Create `src/commands/history.ts` exporting `history: Command` (uses `ctx.history`)
- [x] 2.9 Create `src/commands/clear.ts` exporting `clear: Command` with `aliases: ["cls"]` (uses `ctx.clear`)
- [x] 2.10 Create `src/commands/sudo.ts` exporting `sudo: Command`
- [x] 2.11 Create `src/commands/exit.ts` exporting `exit: Command`
- [x] 2.12 Create `src/commands/echo.ts` exporting `echo: Command`
- [x] 2.13 Create `src/commands/date.ts` exporting `date: Command`
- [x] 2.14 Create `src/commands/help.ts` exporting `help: Command` — `run` iterates `COMMAND_REGISTRY`, filters `hidden`, returns `{ type: "help", rows }` in registry order

## 3. Registry

- [x] 3.1 Rewrite `src/commands/index.ts`: import every command, declare `ALL: readonly Command[]` in the exact order that reproduces today's `help` rows (ask, whoami, about, skills, projects, contact, theme, history, clear, exit — with the remaining non-help commands `sudo`, `echo`, `date`, `help`, `cls` ordering chosen to keep `help` output identical to current) — `help`/`sudo`/`echo`/`date` marked `hidden: true`; `cls` registered as alias of `clear`
- [x] 3.2 Export `COMMAND_REGISTRY = ALL` for downstream iteration
- [x] 3.3 Implement `buildCommands(ctx)` that walks `ALL`, wraps each `run` to bind `ctx`, registers each command under `name` and every `aliases[]` entry, and returns the assembled `CommandTable`
- [x] 3.4 Verify the removed `CommandContext` re-export still works (or re-export it from the new `index.ts` so `Terminal.tsx`'s import path is unchanged) — `CommandContext` moved to `src/types.ts` and re-exported from `src/commands/index.ts`

## 4. Verification

- [x] 4.1 `bun run lint` passes with zero new warnings
- [x] 4.2 `bun run build` (which runs `tsc -b`) passes — no TS errors
- [x] 4.3 Start `bun run dev` and manually exercise every command: `help`, `whoami`, `about`, `skills`, `projects`, `contact`, `theme` (no arg), `theme espresso`, `theme bogus`, `history`, `clear`, `cls`, `sudo`, `exit`, `echo hello world`, `date`, and a deliberately unknown command — output matches pre-refactor behavior in every case
- [x] 4.4 Re-run `bun run build`, compare gzipped `dist/assets/*.js` size to the baseline from task 1.2 — delta must be ≤ +1 KB; if exceeded, stop and investigate before merging — post-refactor `index-*.js` gz=**70,270 bytes** → delta **−48 bytes**, within budget
- [x] 4.5 Confirm `ask --webllm` still invokes `enterChat({ flags: ["--webllm"] })` (smoke test in dev server: type `ask --webllm` and confirm chat mode entry)

## 5. Cleanup

- [x] 5.1 Confirm no orphaned imports remain in `src/commands/index.ts` (the old inline `THEMES`, content imports should only exist in the per-command files that use them)
- [x] 5.2 `git diff src/components/Terminal.tsx src/components/Line.tsx` shows zero changes (the refactor must not touch rendering code)

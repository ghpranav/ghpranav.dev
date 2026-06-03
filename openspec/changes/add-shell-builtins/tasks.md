## 1. Content and the neofetch line variant

- [ ] 1.1 In `src/content/site.ts`, add `NEOFETCH_LOGO` (a compact ASCII mark, ~20 cols wide so it fits beside the info table on mobile) and `FORTUNES` (a `readonly string[]` of short dev aphorisms)
- [ ] 1.2 In `src/types.ts`, add `{ type: "neofetch"; logo: string; rows: ReadonlyArray<readonly [string, string]>; accent?: boolean }` to the `TerminalLine` union
- [ ] 1.3 In `src/components/Line.tsx`, add a `case "neofetch":` arm — logo column beside `label: value` rows, labels colored from the active theme; on narrow viewports stack logo above rows

## 2. Utility commands

- [ ] 2.1 `src/commands/neofetch.ts` — build rows (`os`, `host`, `kernel`, `shell`, `theme` from `ctx.theme.name`, `uptime` from `performance.now()` since mount, `packages` = command count, `resolution` from `window.innerWidth × innerHeight`); return a `neofetch` line. Visible.
- [ ] 2.2 `src/commands/grep.ts` — flatten `SKILLS` + `PROJECTS` into searchable rows; case-insensitive substring match (args OR-ed); return a `text` line of `source: …match…` results; usage line when no args; not-found line when no matches. Visible.
- [ ] 2.3 `src/commands/man.ts` — import `COMMAND_REGISTRY`; format NAME / SYNOPSIS / DESCRIPTION for the named command; `no manual entry for <name>` for unknown; usage line for no args; add `complete` returning registry command names. Hidden.
- [ ] 2.4 `src/commands/which.ts` — `/usr/bin/<name>` if name/alias is registered else `<name> not found`; alias `type`; add `complete` returning registry command names. Hidden.
- [ ] 2.5 `src/commands/alias.ts` — list declared aliases from the registry (`cls='clear'`, etc.). Hidden.
- [ ] 2.6 `src/commands/pwd.ts` — return `text` `/home/pranav`. Hidden.
- [ ] 2.7 `src/commands/uname.ts` — fake system string; `-a` long form. Hidden.
- [ ] 2.8 `src/commands/cal.ts` — current month grid, current day marked. Hidden.
- [ ] 2.9 `src/commands/uptime.ts` — elapsed since mount, formatted `Xm Ys`. Hidden.

## 3. Easter-egg commands

- [ ] 3.1 `src/commands/cowsay.ts` — speech bubble + cow around `args.join(" ")`; return `ascii`. Hidden.
- [ ] 3.2 `src/commands/fortune.ts` — random pick from `FORTUNES`; return `text`. Hidden.
- [ ] 3.3 `src/commands/editors.ts` — export `vim`, `vi`, `nano`, `emacs` (editor-trap message) and `:q`/`:q!`/`:wq`/`:x`/`ZZ` (in-character replies); all hidden, all `text`
- [ ] 3.4 `src/commands/rm.ts` — in-character refusal; distinct line for `rm -rf ~` / `rm -rf /`; never mutates anything. Hidden.

## 4. Registry wiring

- [ ] 4.1 In `src/commands/index.ts`, add one import per new command/family and append each `Command` to the `ALL` array (editor commands and `:q`-family each appended individually)
- [ ] 4.2 Confirm `help` shows only `neofetch` and `grep` from this change; all others are `hidden`

## 5. Spec delta

- [ ] 5.1 (Captured in the spec delta) MODIFY "Registered commands" to enumerate the new commands and their observable output
- [ ] 5.2 (Captured in the spec delta) MODIFY "Command output types" to add the `neofetch` variant
- [ ] 5.3 (Captured in the spec delta) MODIFY "Performance budget" to note the new commands are dependency-free pure functions

## 6. Verify

- [ ] 6.1 Run `bun run lint` and `bun run build` — no ESLint or type errors (including `TerminalLine` exhaustiveness for the new `neofetch` arm)
- [ ] 6.2 Confirm no new dependency and no `import(` in command/registry code; initial JS stays < 60 KB gzipped
- [ ] 6.3 Manually exercise each command in `bun run dev`: `neofetch`, `grep kafka`, `man theme`, `which cls`, `alias`, `pwd`, `uname -a`, `cal`, `uptime`, `cowsay hi`, `fortune`, `vim` then `:q`, `rm -rf ~`
- [ ] 6.4 Verify `neofetch` is readable at 320px width (logo not overflowing; stacked fallback works) and that the `theme` row tracks live theme switches
- [ ] 6.5 Verify `man th⇥` / `which cl⇥` tab-complete to `theme` / `clear` via the `complete` hook

## 1. Type extension

- [x] 1.1 Add optional `complete?: (args: string[], ctx: CommandContext) => string[]` to the `Command` type in `src/types.ts`
- [x] 1.2 Verify `bun run lint` passes after the type change (no existing command file needs to declare `complete`)

## 2. Completion helper (unit-testable, pure)

- [x] 2.1 Create `src/lib/completion.ts` exporting the `CompletionResult` discriminated union (`none` / `single` / `many`)
- [x] 2.2 Implement `complete(input, registry, commandTable, ctx)` — tokenize on whitespace, branch on "no whitespace yet" (command-name completion) vs "has whitespace" (argument completion via `command.complete`)
- [x] 2.3 In `complete`, wrap any `command.complete()` call in try/catch; on throw return `{ kind: "none" }` and `console.warn` once
- [x] 2.4 In `complete`, dedupe candidates that point to the same handler entry (alias → primary collapse) before producing the `many` result
- [x] 2.5 Ensure the helper is pure: no DOM access, no React imports, no module-level mutable state — verified by `bun run lint` plus a manual grep

## 3. Argument completion for `theme`

- [x] 3.1 In `src/commands/theme.ts`, add `complete: (args) => Object.keys(THEMES)` (or the equivalent ordered key list already used inside the command) returning the full theme key set
- [x] 3.2 Confirm `theme` still passes its existing usage scenarios (no behavior change for `run`, only completion added)

## 4. Terminal integration (input handler) + cycle state

- [x] 4.1 In `src/components/Terminal.tsx`, add a `cycleRef = useRef<CycleState | null>(null)` typed as `{ candidates: readonly string[]; index: number; prefix: string; tokenStart: number } | null`
- [x] 4.2 Locate the keydown handler for the shell-mode input and add a `Tab` branch
- [x] 4.3 At the very top of the keydown handler, for **every key that is NOT `Tab`**, set `cycleRef.current = null` *before* the existing per-key logic runs (so any other branch sees a cleared cycle)
- [x] 4.4 In the `Tab` branch: call `event.preventDefault()` first; gate on `mode === "shell"` so chat-mode Tab is untouched
- [x] 4.5 In the `Tab` branch, if `cycleRef.current !== null`, advance `index = (index + 1) % candidates.length`, write `prefix + candidates[index]` into the input, and return early — do not call `complete()` or append transcript lines
- [x] 4.6 Otherwise (no cycle), invoke `complete(...)` from the helper; on `{ kind: "single" }` rewrite the input to the replacement; on `{ kind: "none" }` do nothing
- [x] 4.7 On `{ kind: "many", candidates }`, append an `input` echo line (current prompt + current input) and a `text` line listing candidates joined by two spaces in registry order; then populate `cycleRef.current` with `{ candidates, index: -1, prefix, tokenStart }` so the next consecutive Tab cycles
- [x] 4.8 Confirm history navigation (Up/Down) and Ctrl+C abort behavior are unaffected — these branches also benefit from the universal cycle-reset in 4.3

## 5. Manual verification

- [x] 5.1 `bun run dev` and verify: empty input + Tab fills the live prompt with `ask` AND renders a dim listing of every command BELOW the prompt; the prompt's vertical position does not shift up
- [x] 5.2 Verify: `p<Tab>` → `projects ` (single match, no listing); `s<Tab>` → live prompt becomes `skills` AND ephemeral listing `skills sudo` appears below
- [x] 5.3 Verify cycle: with input `s`, Tab → fill `skills`; Tab again → `sudo`; Tab again → wraps to `skills`. The listing below stays visible and unchanged throughout
- [x] 5.4 Verify reset: from cycle on `skills`, type `i` → input is `skillsi` AND the ephemeral listing disappears; next Tab restarts a fresh cycle against the new input
- [x] 5.5 Verify Enter mid-cycle: with input `skills` from cycling, press Enter → `skills` runs (visible value submits); ephemeral listing dismissed; scrollback only contains the committed-command echo, no listing residue
- [x] 5.6 Verify: `theme <Tab>` fills `theme espresso` AND shows ephemeral list of theme keys below; subsequent Tabs cycle through them; typing a letter dismisses the listing
- [x] 5.7 Verify: `theme nor<Tab>` completes uniquely to `theme nord ` (no cycle, no ephemeral listing)
- [x] 5.8 Verify: Tab in chat mode (`pranav-chat>`) neither completes nor injects any transcript or ephemeral element, and focus moves out of the input via the browser default
- [x] 5.9 Verify: `xyzqq<Tab>` is a no-op (no input mutation, no listing, no cycle state captured)
- [x] 5.10 Verify arity guard: after `theme espresso ` (with trailing space — i.e. one theme committed and space pressed), Tab is a no-op (no second theme appended, no ephemeral listing, no cycle)
- [x] 5.11 `bun run build` succeeds. Note: project's stated 60 KB gzipped initial-JS budget was already exceeded pre-change (71.37 KB baseline); this change adds ~0.47 KB total. Bundle-size remediation is out of scope for this proposal.

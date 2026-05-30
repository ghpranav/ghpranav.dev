## Context

The shell currently treats Tab as the browser default — meaning it moves focus away from the input field. There is no completion feedback; users only get the post-hoc "did you mean: X ?" hint after submitting an unknown command. The `COMMAND_REGISTRY` in `src/commands/index.ts` is already the single source of truth, so the data needed for command-name completion is in hand; only the input handler and a small completion helper are missing. Argument completion is a step beyond — currently `theme nord` is dispatched as a free-form arg array, and there is no per-command hook for advertising valid argument values.

Stakeholders: visitors using the terminal (primary), and any future contributor adding a command that needs to advertise its argument enum.

## Goals / Non-Goals

**Goals:**

- Tab in shell mode completes the command name from the registered set (primary names + aliases, including hidden commands).
- Single-match completion fills the input and adds a trailing space; multiple-match prints candidates without mutating the input.
- A small, declarative extension to the `Command` type so any command can advertise its own argument completions (`theme` first, others later).
- The Tab handler reuses the registry — no parallel command list.
- Pure, framework-agnostic completion helper that can be unit-tested without a DOM.

**Non-Goals:**

- Tab-twice-to-list bash behavior. One Tab press either completes or lists.
- Cycling through candidates with repeated Tab.
- History search (Ctrl+R) — separate change.
- Fuzzy / substring matching. Prefix-only.
- Argument completion for commands with free-form args (`echo`, `ask`).
- Completion inside chat mode.

## Decisions

### Decision 1: Where the completion helper lives

**Choice:** New file `src/lib/completion.ts` exporting a pure function `complete(input: string, registry: typeof COMMAND_REGISTRY, ctx: CommandContext): CompletionResult`, where:

```ts
type CompletionResult =
  | { kind: "none" }
  | { kind: "single"; replacement: string } // already includes trailing space when appropriate
  | { kind: "many"; candidates: readonly string[]; replacement: null };
```

**Why:** Keeps `Terminal.tsx` thin (it only consumes the result and decides what to render), keeps `src/commands/index.ts` focused on dispatch, and makes the algorithm trivially unit-testable without a React tree.

**Alternatives considered:**
- Inline the logic in `Terminal.tsx`. Rejected — the keydown handler is already crowded with chat-mode branches, history navigation, and Ctrl+C abort.
- Put it in `src/commands/index.ts`. Rejected — that file is the registry/dispatch, and the completion algorithm is orthogonal to dispatch.

### Decision 2: Token boundary detection

**Choice:** Split the input on the first run of whitespace. If there is no whitespace, complete the **command name** against the registry. If there is whitespace, complete the **current argument** by delegating to `command.complete?.(argsSoFar, ctx)` where `argsSoFar` is every token after the command name including any in-progress final token.

The "current argument" is always the last whitespace-delimited token, even if it's empty (the user pressed Tab after a space). This matches bash semantics for single-Tab completion.

**Why:** Matches the existing dispatcher's tokenization (whitespace split), keeps the contract for `complete` simple (the command knows its own argument grammar), and avoids parsing flags vs positional args at the framework level.

**Alternatives considered:**
- Pass the raw input string to `complete`. Rejected — every command would re-implement tokenization.
- Use a real shell-quote parser. Rejected — the rest of the dispatcher uses whitespace split; introducing quote semantics here only is inconsistent and out of scope.

### Decision 3: The `complete` field on `Command`

**Choice:** Add an **optional** field `complete?: (args: string[], ctx: CommandContext) => string[]` to the `Command` type. Returns the list of valid completion candidates for the **current** argument position. Returning `[]` means "no completion offered."

`args` is the tokens **after** the command name, ending with the in-progress token (which may be `""`). The helper filters by `startsWith(currentToken)`; the command does not have to.

**Why:** Optional keeps existing commands untouched. The helper, not the command, handles prefix filtering — commands just enumerate the universe of valid values, which is what they already know.

**Alternatives considered:**
- A static `argEnums?: readonly string[][]` shape. Rejected — too rigid; some completions (e.g. future per-context values) need access to `ctx`.
- A separate `Completer` registry parallel to `COMMAND_REGISTRY`. Rejected — violates "one source of truth, one file per command."

### Decision 4: Multiple-match rendering — cycle from first Tab, with an ephemeral listing below the live prompt

**Choice:** When more than one candidate matches, the terminal renders the candidate list as a dim, **ephemeral** block immediately below the live prompt row (NOT appended to scrollback), and fills the live prompt with the first candidate. Subsequent Tabs cycle the live prompt's value while the ephemeral list stays put; any non-Tab key clears both.

- **1st Tab** (cycle state empty):
  1. Replace the in-progress token in the live prompt's input with `candidates[0]` (no trailing space — the user is still choosing). This is the single source of truth for "what will run on Enter."
  2. Set cycle state to `{ candidates, index: 0, prefix, tokenStart }`, where `prefix` is the input substring before the in-progress token. Setting cycle state causes the ephemeral candidate list to render below the live prompt row.
  3. NO transcript line is appended. The candidate list lives only as a sibling render below the prompt, dismissed when the cycle ends.

- **2nd, 3rd, … consecutive Tabs** (cycle state populated):
  - Advance `index = (index + 1) % candidates.length`.
  - Replace the in-progress token in the live prompt's input with `candidates[index]`. The ephemeral listing below stays put; only the live prompt's value changes.
  - Do not append any transcript lines.

- **Any non-Tab keypress** resets the cycle state to `null` **before** the keypress's own logic runs. Setting cycle to `null` causes the ephemeral listing to unmount — it does not get archived to scrollback.

**Why:** Anchoring the listing below the live prompt (instead of inserting it into scrollback above) keeps the prompt visually stationary: the user's eye is at the prompt where they typed, and the candidate hint appears nearby. Listing-in-scrollback was tried and rejected during manual verification because it visually pushed the live prompt down and felt like the prompt "moved away from" the user's typing location. Making the listing ephemeral also keeps scrollback uncluttered by intermediate Tab states once the user commits a command.

**Alternatives considered:**
- Pure list-then-cycle (1st Tab lists only, 2nd Tab fills first, 3rd+ cycle). Rejected after user testing — adds a Tab press without proportionate value for the small candidate sets in this terminal.
- Pure zsh-style menu cycling (no listing ever). Rejected — the listing is the cheap discoverability hook; suppressing it would force the user to Tab through everything to learn what exists.
- Pure bash style (Tab #1 silent, Tab #2 lists, no cycling). Rejected — adds friction for selection; the user has to either keep typing or click-copy from the list.
- Echo the user's pre-Tab input as a frozen scrollback line before the listing. Rejected after verification — that frozen echo plus the live prompt at the bottom reads visually as "two prompt lines, the first one empty and unused," which is confusing.
- Append the candidate list to scrollback (above the live prompt). Rejected after verification — visually pushes the live prompt downward away from the user's typing location and clutters scrollback with intermediate Tab presses that don't represent committed history.

### Decision 5: Where the cycle state lives

**Choice:** A single `useState<CycleState | null>(null)` inside `Terminal.tsx`, owning the shape `{ candidates: readonly string[]; index: number; prefix: string; tokenStart: number }` (or `null` when not in a cycle).

The keydown handler resets the state to `null` at the top of every non-Tab branch (typing, Backspace, Enter, Arrow keys, Ctrl+C, etc.) **before** that branch runs. The Tab branch reads-then-updates the state to decide between "fresh path" and "cycle path."

**Why:**
- The ephemeral candidate listing must render and unmount in response to cycle changes — it is a `cycle !== null` conditional render. That requires state, not a ref.
- React 19 + the React Compiler memoize aggressively; the per-cycle re-render is cheap and the alternative (separate `useRef` for state plus a sibling `useState` flag just to trigger re-renders) is more complex.
- Co-locating reset logic at the top of the keydown handler is one place to maintain, rather than scattering it across every branch. We guard the reset with `cycle !== null` so a no-op reset (typing while no cycle is active) doesn't trigger a wasted render.
- The completion helper stays pure: it takes the input and registry and returns a `CompletionResult`. The cycle state is a Terminal-level concern (it's about the interaction history of keypresses, not about the algorithm).

**Alternatives considered:**
- `useRef` for cycle state. Rejected — refs don't trigger re-renders, so the ephemeral candidate listing couldn't mount/unmount in response to cycle changes without a parallel state flag.
- Put cycle state inside the helper as module-level state. Rejected — breaks purity, hostile to tests, and makes the helper aware of "consecutive keypresses" which it has no business knowing.

### Decision 6: Hidden commands participate

**Choice:** Tab completion lists hidden commands (`help`, `sudo`, `echo`, `date`) in candidate output. The `help` command's own table-rendering still hides them — only completion exposes them.

**Why:** Mirrors the existing "did you mean" rule (hidden commands participate in suggestion ranking) and gives power users a way to discover them. Doesn't break the "help table stays clean" property.

### Decision 7: Theme-system coupling

**Choice:** `src/commands/theme.ts` imports the theme keys it already uses to validate input, and returns them from its new `complete` function. No spec change is needed in `theme-system` — the theme registry is already public to the `theme` command. The change is contained to `command-registry`.

**Why:** Keeps the spec delta single-domain and matches the conventions file: "Tab completion auto-discovers from the registry — no second list to maintain."

## Risks / Trade-offs

- **[Risk]** Tab is also the browser's focus-cycle key. If `preventDefault()` is missed in any code path, hitting Tab will silently jump focus out of the input. → **Mitigation:** Always `preventDefault()` first thing in the Tab branch of the keydown handler, and gate on `mode === "shell"` so chat mode's Tab still moves focus naturally for accessibility.
- **[Risk]** A future command writes a `complete` function that throws. → **Mitigation:** The helper wraps `command.complete?.()` in a try/catch and degrades to `{ kind: "none" }` on throw. No user-visible error; one `console.warn` for the developer.
- **[Risk]** Cycle state can desynchronize from input if a code path forgets to reset it. Symptom: Tab cycles even though the user typed something in between. → **Mitigation:** Reset cycle state at the top of the keydown handler for every non-Tab key, before that key's branch runs. Single owner (one ref), single reset site.
- **[Risk]** While cycling, the input value changes on every Tab — if the user hits Enter mid-cycle expecting to submit "the candidate they last saw," the cycled value is what's submitted. This is actually the desired behavior (Enter selects the visible candidate), but worth calling out. → **Mitigation:** No code mitigation needed; the visible value is the authoritative one. Document the behavior in a scenario.
- **[Risk]** A user cycling through a long candidate list may want to back up (Shift+Tab). → **Mitigation:** Out of scope for this change; only forward cycling is supported. Captured in open questions.
- **[Trade-off]** Argument completion is opt-in per command. Commands without `complete` get no argument help. Acceptable: most commands today (`whoami`, `about`, `skills`, etc.) take no args at all, so there's nothing to complete.

## Open Questions

- Should `Shift+Tab` cycle backwards? Recommendation: defer — single-direction cycling is enough for the small candidate sets in this terminal (5 themes, ~14 commands). Add only if usage feedback says it's needed.
- Should `ask` complete its flags (`--webllm`)? Recommendation: defer; only flag is `--webllm` today, low value.
- Should the candidates list be sorted alphabetically or registry order? Recommendation: registry order, because that matches `help`. Captured in the spec scenarios.
- Should cycling visually highlight which candidate in the listed line is currently selected (e.g. bold)? Recommendation: defer — the input field itself is the source of truth for "what you'd run on Enter." Adding listing-side highlighting would require coordinating two pieces of UI state.

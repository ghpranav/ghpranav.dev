## Context

`createChatSession(backend, opts)` returns a uniform `ChatSession` (`{ backend, stream(msg, signal), destroy() }`) so `Terminal.sendChat` is backend-agnostic. The two backends diverge in how they handle history:

- **Prompt API (Nano)** — `lm.create({ initialPrompts: [{role:"system", ...}] })` returns a stateful `session`; each turn calls `session.promptStreaming(wrapUserMessage(msg), { signal })`. The session accumulates context internally, so it is already multi-turn (`src/lib/llm.ts:336–357`).
- **WebLLM** — `stream()` calls `engine.chat.completions.create({ messages: [{system}, {user}], ... })` (`src/lib/llm.ts:385–393`). The `engine` is stateless across calls in our usage; we rebuild `messages` every turn and never include prior turns. Result: no memory.

The bug surfaces on any browser that falls through to WebLLM (WebGPU but no Prompt API): follow-up questions lose context. The goal is parity — make WebLLM multi-turn — without touching the interface or the Nano path.

## Goals / Non-Goals

**Goals:**
- WebLLM remembers prior turns within a session, matching Nano.
- The committed history is always a clean alternating sequence (`system, user, assistant, user, assistant, …`) — no dangling user turn after an abort/error.
- History is bounded so the context window and per-turn latency stay sane.
- `<user_question>` wrapping applies to every turn's user content.
- The memory logic is unit-testable without downloading a model.

**Non-Goals:**
- Cross-reload persistence; rolling-summary compression; changing Nano; changing `ChatSession`/`Terminal`; retrieval/grounding.

## Decisions

### 1. Per-session `history` array, seeded with the system message

**Choice:** inside the WebLLM branch, create `const history: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }]` once, captured in the `stream`/`destroy` closure. Each `stream(userMessage, signal)`:

1. builds `const wrapped = wrapUserMessage(userMessage)` and `const messages = [...history, { role: "user", content: wrapped }]`,
2. calls `engine.chat.completions.create({ messages, stream: true, temperature: 0.3 })`,
3. accumulates yielded deltas into `reply`,
4. **only after the loop completes normally**, pushes `{ role: "user", content: wrapped }` then `{ role: "assistant", content: reply }` to `history`, then enforces the bound.

The history holds the **wrapped** user content (the exact text the model saw), so injection-hardening tags are consistent across turns and re-sending history reproduces the same framing.

**Alternative considered:** rely on a WebLLM-internal conversation API instead of managing `messages` ourselves. Rejected — the OpenAI-compatible `chat.completions.create` we already use is explicitly stateless per call; the documented multi-turn pattern *is* to pass the full `messages` array. Managing an explicit array is also what makes the behavior testable and the eviction policy ours to control.

### 2. Commit on success only; never commit a half-turn

**Choice:** the push happens after the `for await` loop exits normally. If the loop throws (`AbortError` when `signal.aborted`, or any engine error), control leaves `stream()` before the push, so **neither** the user turn nor a partial assistant reply enters history.

**Why:** the existing "Streaming and abort" contract says an aborted turn appends a `(cancelled)` line to the UI but the answer is incomplete. If we committed the user turn without an assistant reply (or with a truncated one), the next request's `messages` would either end on a `user` (breaking strict alternation some chat templates assume) or feed the model its own truncated output as if it were a finished answer. Dropping the whole turn keeps history a valid alternating transcript and matches the user's mental model: "I cancelled that, it didn't count."

**Trade-off:** a long answer the user cancels near the end is fully forgotten. Acceptable — a cancelled turn is, by definition, one the user didn't want.

### 3. Bound by oldest-pair eviction; never evict system

**Choice:** after committing a turn, enforce a cap. Keep `history[0]` (system) always. If the number of non-system messages exceeds `2 * MAX_TURNS` (a small constant, e.g. `MAX_TURNS = 6` → 12 messages), `splice` out the oldest **pair** (one user + the following assistant) until within budget. Evicting in pairs preserves alternation.

**Heuristic, not exact tokens:** counting turns (or a coarse character budget) is simpler and good enough; we don't have a cheap tokenizer on the hot path and the small models we target (Phi-3.5-mini, Llama-3.2-1B) favor short contexts for latency anyway. The design pins the *policy* (pairs, keep system, drop oldest) and leaves the exact `MAX_TURNS`/char number as a tunable constant. If a future model wants more, bump the constant.

**Alternative considered:** a character/token budget that trims the oldest pair until under N chars. Equivalent policy, finer-grained; can layer on top of the turn cap if needed. Either way the invariant is the same: system survives, alternation preserved, oldest goes first.

### 4. `/clear` reset comes for free

**Choice:** no new code for reset. The existing "Chat-mode commands" requirement has `/clear` destroy the session and recreate it via `enterChat({ flags: [] })`. A recreated WebLLM session runs the branch again and gets a brand-new `history` seeded with just the system message. So `/clear` wipes memory automatically. The spec scenario simply asserts this still holds.

### 5. Make it testable with a fake engine

**Choice:** structure the WebLLM stream so the `engine` object (specifically `engine.chat.completions.create`) is the only external dependency, and the history mutation is plain array logic. Tests inject a fake `engine` whose `create` returns a canned async-iterable of deltas and records the `messages` it was called with. That lets unit tests assert, with no WebGPU and no download:

- turn 2's `messages` contains turn 1's user and assistant content,
- an aborted turn (fake that throws mid-iteration / pre-aborted signal) leaves `history` unchanged,
- an errored turn leaves `history` unchanged,
- after `MAX_TURNS` exceeded, the oldest pair is gone but `system` remains at index 0 and alternation holds.

These run as normal vitest tests (not gated behind `E2E`, since no real model is involved). If extracting a tiny pure helper (e.g. `commitTurn(history, wrappedUser, reply, cap)`) makes the assertions cleaner, do that — it keeps the eviction invariant in one tested function.

## Risks / Trade-offs

- **Growing prompt latency.** Each turn re-sends history, so inference cost rises with conversation length. Mitigation: the bound caps it; small models keep per-token cost low; this is on-device compute, not network/page weight.
- **Chat-template assumptions.** Some model templates require strict user/assistant alternation starting after system. The commit-on-success-only rule and pair-eviction both protect this invariant; tests assert it.
- **Wrapped vs raw in history.** Storing wrapped user content means history carries `<user_question>` tags on every turn. This is intentional (consistent injection framing) but slightly inflates token count. Accepted — correctness/hardening over a few tokens.
- **Memory vs privacy optics.** History lives only in RAM for the session; nothing is persisted. This must stay true to honor "messages never leave the browser" — the Non-goals pin it.

## Migration Plan

Front-end only, no data/API surface. Land as one change to `src/lib/llm.ts` plus tests. Rollback is reverting the commit (WebLLM returns to stateless single-turn). No persisted state to migrate. The Nano path and the `ChatSession` interface are untouched, so `Terminal.sendChat` needs no change.

## Open Questions

- Final value of `MAX_TURNS` (or the char budget). Default proposal: 6 pairs. Tune against Phi-3.5-mini latency on a mid-range device during implementation; the policy is fixed, the constant is not.
- Should the user be shown when memory was trimmed (e.g. a subtle `(trimmed older context)` note)? Default: no — silent, like a normal chat scrollback. Revisit only if confusion is observed.

## 1. Tests for the memory policy (TDD — write first)

- [ ] 1.1 Add `src/lib/llm.test.ts` with a fake `engine` whose `chat.completions.create(args)` records `args.messages` and returns a canned async-iterable of string deltas
- [ ] 1.2 Test: after a first successful turn, a second `stream(...)` call is invoked with `messages` containing the first turn's `user` and `assistant` content (in order, after `system`)
- [ ] 1.3 Test: a turn aborted mid-stream (pre-aborted signal or fake that throws) leaves `history` unchanged — neither the user turn nor a partial assistant reply is committed
- [ ] 1.4 Test: a turn whose `create` rejects with a non-abort error leaves `history` unchanged
- [ ] 1.5 Test: the committed `history` is always strict alternation `system, user, assistant, user, assistant, …`
- [ ] 1.6 Test: when more than `MAX_TURNS` pairs accumulate, the oldest user+assistant pair is evicted, `system` remains at index 0, and alternation is preserved
- [ ] 1.7 Test: each committed `user` message content is the `wrapUserMessage()`-wrapped form (carries `<user_question>` tags)

## 2. Implement WebLLM conversation memory

- [ ] 2.1 In the WebLLM branch of `createChatSession` (`src/lib/llm.ts`), create a per-session `history` array seeded with `{ role: "system", content: SYSTEM_PROMPT }`, captured in the `stream`/`destroy` closure
- [ ] 2.2 In `stream(userMessage, signal)`, compute `wrapped = wrapUserMessage(userMessage)` and call `engine.chat.completions.create({ messages: [...history, { role: "user", content: wrapped }], stream: true, temperature: 0.3 })`
- [ ] 2.3 Accumulate yielded deltas into a `reply` buffer (preserve the existing per-delta `yield` and the `signal.aborted` → `interruptGenerate()` + `AbortError` behavior)
- [ ] 2.4 After the stream loop completes normally, push `{ role: "user", content: wrapped }` then `{ role: "assistant", content: reply }` onto `history`; ensure the push does NOT run when the loop throws (abort/error)
- [ ] 2.5 Enforce the bound: keep `history[0]` (system); while non-system messages exceed `2 * MAX_TURNS`, splice the oldest user+assistant pair; define `MAX_TURNS` as a named constant near the other model constants
- [ ] 2.6 If it clarifies the eviction/commit logic, extract a small pure helper (e.g. `commitTurn(history, wrapped, reply, maxTurns)`) and have the tests target it
- [ ] 2.7 Confirm the Nano branch is untouched and the returned `ChatSession` shape is unchanged

## 3. Verify

- [ ] 3.1 Run `bun run test` (vitest) — all new memory tests pass and existing tests still pass
- [ ] 3.2 Run `bun run lint` and `bun run build` — no ESLint or type errors
- [ ] 3.3 Confirm no new dependency was added and initial JS (excluding lazily-imported WebLLM) is unchanged
- [ ] 3.4 Manual (WebGPU browser, `ask --webllm`): ask a question, then a context-dependent follow-up (e.g. "what about the second one?"); confirm the model answers using prior context
- [ ] 3.5 Manual: start a stream, press Ctrl+C mid-answer, then send a new message; confirm the cancelled turn was not remembered (model does not reference the aborted content)
- [ ] 3.6 Manual: run `/clear`, then a follow-up referencing earlier turns; confirm memory was reset

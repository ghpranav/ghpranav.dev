## Why

The two on-device backends behave differently in a way visitors will notice. The Gemini Nano path creates one stateful `LanguageModel` session and calls `session.promptStreaming(...)` on it, so it naturally remembers the conversation — a follow-up like "what about the second one?" works. The WebLLM path does not: on every turn its `stream()` rebuilds the request from scratch as `messages: [{system}, {user}]` (`src/lib/llm.ts:386–393`), discarding everything said before. So the same follow-up question, against the WebLLM engine, gets a confused answer because the model never saw the first turn.

This is a latent correctness bug, not a feature request: the two backends are supposed to be interchangeable behind the unified `ChatSession` shape, and right now they are not. A visitor who happens to fall through to WebLLM (any WebGPU browser without the Prompt API) gets a strictly worse, amnesiac chat. The fix is to give the WebLLM session the same multi-turn memory Nano already has, while keeping the `ChatSession` interface and the privacy guarantee ("messages never leave the browser") exactly as they are.

## What Changes

- **WebLLM gains conversation memory.** The WebLLM session keeps an in-memory message history (`system` + the accumulated alternating user/assistant turns). Each `stream(userMessage)` call sends the full history plus the new user turn, so the model sees prior context.
- **History is committed only on a complete turn.** On a successful stream, the user turn and the full assistant reply are appended to history. On abort (Ctrl+C) or error mid-stream, **neither** is appended — preserving a clean alternating `system → user → assistant → user → assistant …` sequence with no dangling half-turn.
- **History is bounded.** To respect the model context window and keep latency reasonable, history is capped: when it exceeds the budget, the oldest complete user+assistant **pair** is evicted first. The `system` message is never evicted.
- **`<user_question>` wrapping is preserved.** Each user turn is still wrapped via `wrapUserMessage()` before being added to history and sent, so prompt-injection hardening holds across every turn — not just the first.
- **`/clear` still resets memory.** `/clear` already destroys and recreates the session; a fresh session starts with a fresh history, so the existing reset behavior continues to wipe conversation memory with no extra code.
- **Memory logic is unit-tested.** The history accumulation, abort/error non-commit, alternation invariant, and pair-eviction are covered by tests against a mock engine (no real model download).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `on-device-llm`: Adds a multi-turn conversation-memory requirement so a chat session remembers prior turns regardless of backend. The Prompt API path already satisfies this via its stateful session; the WebLLM path is brought to parity by maintaining an explicit, bounded message history. The unified `ChatSession` shape, streaming/abort contract, `<user_question>` wrapping, and `/clear` reset behavior are unchanged.

## Impact

- **`src/lib/llm.ts`** — the WebLLM branch of `createChatSession` maintains a `history` array (seeded with the `system` message). `stream()` builds the request from `history` + the new wrapped user turn; on successful completion it commits both turns; on abort/error it commits neither; a bound is enforced by evicting the oldest user/assistant pair. The Nano branch is unchanged (already stateful).
- **`src/lib/llm.test.ts`** (new or extended) — unit tests for: history grows across turns, aborted/errored turns are not committed, alternation is preserved, the system message survives eviction, and the oldest pair is dropped when the bound is exceeded. Tests use a fake engine so they run without a model download (not gated behind `E2E`).
- **`openspec/specs/on-device-llm/spec.md`** — a new "Conversation memory across turns" requirement is added.
- **Performance budget** — no new dependency, no initial-JS impact (logic lives in the already-lazily-imported WebLLM path). Per-turn prompt size grows with history, bounded by the eviction cap; this is inference-time cost on the user's device, not page weight.

## Non-goals

- **Persisting conversation across page reloads or sessions.** Memory is in-RAM for the life of the chat session only; nothing is written to `localStorage`/`IndexedDB`. A reload or `/clear` starts fresh — consistent with the privacy posture.
- **Summarizing or compressing evicted history.** When the bound is hit, old turns are dropped, not summarized. A rolling-summary memory is out of scope.
- **Changing the Nano path.** It already has memory; this change does not alter its session handling.
- **Changing the `ChatSession` interface or `Terminal.sendChat`.** Memory is internal to the WebLLM session closure; callers are unaffected.
- **Retrieval / grounding over the bio.** The model's knowledge still comes only from `SYSTEM_PROMPT`; this change is about turn-to-turn memory, not adding a knowledge base.

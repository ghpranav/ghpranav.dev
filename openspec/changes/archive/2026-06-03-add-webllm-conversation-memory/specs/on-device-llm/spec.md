## ADDED Requirements

### Requirement: Conversation memory across turns

A chat session SHALL be multi-turn: within the life of a single session, the model SHALL be given the prior turns of the conversation so that follow-up messages are answered in context. This behavior SHALL hold regardless of which backend produced the session, so the unified `ChatSession` is genuinely interchangeable.

- For the **Prompt API (Gemini Nano)** backend, multi-turn memory is provided by reusing the single stateful `LanguageModel` session across turns (its existing behavior).
- For the **WebLLM** backend, the session SHALL maintain an in-memory message history seeded with the `system` message. Each `stream(userMessage, signal)` call SHALL send the accumulated history plus the new user turn to `engine.chat.completions.create({ messages, ... })`.

The history SHALL be committed only on a fully completed turn. When a turn completes normally, the wrapped user message and the complete assistant reply SHALL both be appended to the history. When a turn ends via abort (`AbortError`) or any error before completion, **neither** the user turn nor any partial assistant text SHALL be appended — so the retained history is always a clean alternating sequence beginning with the `system` message (`system, user, assistant, user, assistant, …`) with no dangling half-turn.

Each user turn added to history SHALL be the `wrapUserMessage()`-wrapped form, so the `<user_question>` injection-hardening framing is preserved on every turn, not just the first.

The history SHALL be bounded. When it grows beyond a fixed budget (a small constant number of user/assistant pairs), the oldest complete user+assistant pair SHALL be evicted first, and eviction SHALL continue pair-by-pair until within budget. The `system` message SHALL never be evicted. Conversation memory SHALL live only in memory for the duration of the session and SHALL NOT be persisted to `localStorage`, `IndexedDB`, or any other store; it never leaves the browser.

#### Scenario: WebLLM remembers a prior turn

- **GIVEN** an active WebLLM chat session and the user has asked one question that completed
- **WHEN** the user submits a follow-up that depends on the first answer
- **THEN** the `messages` sent to `engine.chat.completions.create(...)` include the first turn's `user` and `assistant` messages before the new user turn
- **AND** the model's answer reflects the earlier context

#### Scenario: Both backends are multi-turn

- **GIVEN** a chat session from either the Prompt API or the WebLLM backend
- **WHEN** the user has a multi-message conversation
- **THEN** each backend answers later messages with awareness of earlier ones, so the `ChatSession` is interchangeable with respect to memory

#### Scenario: Aborted turn is not remembered

- **GIVEN** an active WebLLM session with some prior history
- **WHEN** the user submits a message and aborts the stream (Ctrl+C) before it completes
- **THEN** neither the aborted user turn nor any partial assistant text is appended to the history
- **AND** a subsequent turn sends history that does not contain the aborted content

#### Scenario: Errored turn is not remembered

- **GIVEN** an active WebLLM session
- **WHEN** a turn fails with a non-abort error before completing
- **THEN** the history is left unchanged (no user or assistant message from the failed turn is committed)

#### Scenario: History stays a valid alternating transcript

- **GIVEN** a WebLLM session after several completed turns
- **WHEN** the retained history is inspected
- **THEN** it is `system` followed by strictly alternating `user`/`assistant` messages with no consecutive same-role messages and no trailing unanswered `user` message

#### Scenario: Oldest pair is evicted when the bound is exceeded

- **GIVEN** a WebLLM session whose completed turns exceed the history bound
- **WHEN** a new turn is committed
- **THEN** the oldest user+assistant pair is removed
- **AND** the `system` message remains at the start of the history
- **AND** the result is still a valid alternating transcript

#### Scenario: /clear resets conversation memory

- **GIVEN** a WebLLM session with accumulated history
- **WHEN** the user submits `/clear` (which destroys and recreates the session via `enterChat({ flags: [] })`)
- **THEN** the new session starts with a history containing only the `system` message
- **AND** a subsequent follow-up is answered without any memory of pre-`/clear` turns

#### Scenario: Memory is not persisted across reloads

- **GIVEN** a chat session with conversation history
- **WHEN** the page is reloaded
- **THEN** no prior conversation is restored and nothing was written to `localStorage`/`IndexedDB` for chat content

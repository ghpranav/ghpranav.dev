## 1. Capability detection

- [x] 1.1 Write unit tests for `detectCapability()` profile assembly: Chromium (memory + connection populated), Safari/Firefox (fields `undefined`, no throw), tier ordering, and independent per-engine reporting (Nano `downloadable` + WebGPU `usable` both surface, not just the single winner)
- [x] 1.2 Add `detectCapability(): Promise<Capability>` to `src/lib/llm.ts` returning `{ llmTier, nanoStatus, webgpu, deviceClass, memoryGB?, saveData?, effectiveType? }` — report Gemini Nano (`nanoStatus: "available" | "downloadable" | "downloading" | "unavailable"`) and WebGPU (`webgpu: { usable }`) readiness independently, and read `navigator.deviceMemory` / `navigator.connection` best-effort (undefined when absent)
- [x] 1.3 Add the `requestAdapter()` probe to WebGPU classification — only classify `webgpu` when `await navigator.gpu.requestAdapter()` is non-null; on null/throw fall through to `none`. Keep the `console.warn`-and-continue behavior for a failed Prompt API check
- [x] 1.4 Compute `deviceClass` via a coarse heuristic (`matchMedia("(pointer: coarse)")` / UA), used only to bias model choice and messaging
- [x] 1.5 Retire `detectBackend()` (or reduce it to an internal helper used by `detectCapability`); update its callers

## 2. Adaptive WebLLM model selection

- [x] 2.1 Write unit tests for the model picker: `memoryGB ≥ 8` (or unknown desktop) → standard, `4 ≤ memoryGB < 8` → lighter, known `< MIN_GB` → "unsupported", `--webllm` override forces WebLLM
- [x] 2.2 Implement a model picker in `src/lib/llm.ts` mapping a `Capability` to a WebLLM model ID (or an "insufficient memory / unsupported" result), with `MIN_GB` and the tier→model map in one place; validate the chosen ID against `@mlc-ai/web-llm`'s `prebuiltAppConfig.model_list` and fall back to the largest listed model that fits
- [x] 2.3 Add a size-disclosure helper that reads the selected model's size from `prebuiltAppConfig` metadata, falling back to a static approximate string when the field is absent
- [x] 2.4 Add a WebLLM readiness check that calls `@mlc-ai/web-llm`'s `hasModelInCache(modelId)` for the adaptively-selected model — imports the runtime bundle but not the weights; used only when the resolution decision depends on it (Decision 6 cost-aware probing)

## 3. Consent gate in createChatSession / Terminal

- [x] 3.1 Ensure `createChatSession` (and thus `lm.create()`, the `@mlc-ai/web-llm` dynamic import, and weight fetch) is reached only after consent — remove the auto-download path on the `webgpu` tier
- [x] 3.2 Add a `pendingConsent` state to `src/components/Terminal.tsx` holding the chosen capability + model + size between showing the consent prompt and the user's confirmation
- [x] 3.3 In the chat-mode input handler, when `pendingConsent` is set, interpret the next submitted line as the confirm: affirmative (`y`/`yes`) → create the session (download with the existing in-place progress updater) → clear `pendingConsent`; `/exit` or negative → leave chat, download nothing

## 4. enterChat flow + unsupported messaging

- [x] 4.1 Rework `enterChat` in `src/components/Terminal.tsx` to `await detectCapability()` first, then apply the Decision 6 resolution order: (1) a ready engine (Nano `available`, or selected WebLLM model in cache) → start session immediately, no consent — preference among ready engines is persisted choice, else Nano, else WebLLM; (2) both engines need a download → first-run two-engine choice prompt (§5); (3) exactly one engine needs a download → single-engine consent prompt (model name, size, runs-offline-after, how to decline); (4) unsupported → print message and stay in shell
- [x] 4.1a Implement cost-aware probing in the resolution: check Nano first and short-circuit when it's the ready/preferred engine, so the `@mlc-ai/web-llm` bundle (via `hasModelInCache`, §2.4) loads only when the decision actually depends on WebLLM readiness
- [x] 4.2 Implement the adaptive unsupported message with both sub-cases — (a) no engine at all, (b) usable WebGPU adapter but insufficient memory — including the supported-environments list, the local-only reassurance, and the email fallback
- [x] 4.3 Ensure the unsupported path does NOT leave the terminal in a dead chat mode (no `pranav-chat>` prompt with no session)
- [x] 4.4 Confirm `/exit`, `/clear`, `/model`, `/help`, and Ctrl+C still behave correctly given the new consent/`pendingConsent` state (e.g. `/exit` during pending consent cancels cleanly)

## 5. First-run engine choice + persistence

- [x] 5.1 Write unit tests for the resolution order: ready engine wins with no prompt (and persisted choice is honored among ready engines); both-downloadable → choice prompt; one-downloadable → single consent; neither → unsupported; persisted-but-evicted WebLLM falls back to a ready engine / prompt rather than a silent re-download
- [x] 5.2 Add the first-run two-engine choice prompt: present Gemini Nano (~4GB, shared across sites) vs the selected WebLLM model (its `prebuiltAppConfig` size, site-local), default-highlight the persisted choice when present; selecting one = consent → download (existing in-place progress updater) → start session. `/exit` or decline downloads nothing
- [x] 5.3 Reuse the `pendingConsent`/input-capture mechanism (§3.2–3.3) for the two-engine choice so the next submitted line is interpreted as the selection, not a chat message; ensure `/exit` during the choice cancels cleanly (covered with §4.4)
- [x] 5.4 Persist the committed engine selection (first-run choice or single-engine consent) to `localStorage["ghpranav.dev:ask-engine"]` as `"nano"` / `"webllm"`, best-effort with errors swallowed (mirror the `ghpranav.dev:theme` pattern); read it back as preference/tiebreak + default-highlight only — never let it trigger a download on its own, and keep cache/availability authoritative for readiness

## 6. Verify

- [x] 6.1 Run `bun run lint` and `bun run build` — confirm no ESLint or type errors
- [x] 6.2 Confirm the production build keeps `@mlc-ai/web-llm` out of the initial bundle (separate lazy chunk) and that initial JS stays < 60KB gzipped
- [x] 6.3 Verify the silent auto-download is gone: on a WebGPU-capable browser, plain `ask` shows the consent prompt and triggers zero weight downloads until confirmation
- [x] 6.4 Manually verify across simulated profiles: (a) Chrome no-flag desktop → consent prompt with an adaptively-picked model, download only on confirm; (b) confirm → model streams answers; (c) decline/`/exit` → no download, back to shell; (d) low-memory mobile emulation (`deviceMemory` below threshold) → insufficient-memory message, no download; (e) no-WebGPU browser → no-engine message
- [x] 6.5 Manually verify the engine-choice + persistence flow: (a) Nano downloadable + WebGPU usable + neither cached → first-run choice prompt; (b) pick one → it downloads, choice persisted; (c) re-run `ask` → the now-ready engine starts with no prompt; (d) with both ready, the persisted choice is used; (e) simulate WebLLM cache eviction with a persisted `webllm` choice → resolution falls back to a ready engine or the prompt, no silent re-download

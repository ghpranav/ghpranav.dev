## ADDED Requirements

### Requirement: Capability profile detection

Detection SHALL expose a `detectCapability()` function returning a profile object:

```
{
  llmTier: "prompt-api" | "prompt-api-download" | "webgpu" | "none";
  nanoStatus: "available" | "downloadable" | "downloading" | "unavailable";
  webgpu: { usable: boolean };   // non-null requestAdapter() result present
  deviceClass: "desktop" | "mobile";
  memoryGB?: number;        // navigator.deviceMemory when available
  saveData?: boolean;       // navigator.connection.saveData when available
  effectiveType?: string;   // navigator.connection.effectiveType when available
}
```

`llmTier` SHALL be computed by the ordered checks defined in "Backend detection cascade". In addition, the profile SHALL report Gemini Nano and WebGPU availability **independently** — `nanoStatus` from `window.LanguageModel.availability(...)` and `webgpu.usable` from the adapter probe — so a caller can detect that *both* engines are present even when the single `llmTier` cascade would surface only the higher-priority one. `deviceClass`, `memoryGB`, `saveData`, and `effectiveType` SHALL be best-effort: when the underlying API is unavailable (e.g. `navigator.connection`/`navigator.deviceMemory` on Safari or Firefox) the corresponding field SHALL be `undefined`, and detection SHALL NOT throw.

#### Scenario: Profile on a Chromium desktop
- **GIVEN** a Chromium desktop browser exposing `navigator.deviceMemory` and `navigator.connection`
- **WHEN** `detectCapability()` runs
- **THEN** it returns a profile whose `llmTier` follows the cascade and whose `deviceClass` and `memoryGB` are populated

#### Scenario: Both engines present are reported independently
- **GIVEN** a browser where `LanguageModel.availability(...)` resolves to `downloadable` AND `requestAdapter()` resolves to a non-null adapter
- **WHEN** `detectCapability()` runs
- **THEN** `nanoStatus` is `downloadable` AND `webgpu.usable` is `true`
- **AND** the result reflects both engines even though `llmTier` is `prompt-api-download`

#### Scenario: Profile on Safari/Firefox
- **GIVEN** a browser without `navigator.connection`/`navigator.deviceMemory`
- **WHEN** `detectCapability()` runs
- **THEN** it returns a profile with those fields `undefined`
- **AND** no exception is thrown

### Requirement: WebGPU adapter verification before download

Classifying a browser as the `webgpu` tier SHALL require that `navigator.gpu.requestAdapter()` resolves to a non-null adapter, not merely that `navigator.gpu` exists. If `requestAdapter()` resolves to `null` or throws, the browser SHALL NOT be classified as `webgpu` and SHALL fall through to `none`. This check SHALL occur before any WebLLM weights are requested.

#### Scenario: navigator.gpu present but no usable adapter
- **GIVEN** a browser where `navigator.gpu` exists but `requestAdapter()` resolves to `null`
- **WHEN** `detectCapability()` runs
- **THEN** `llmTier` is `none` (not `webgpu`)
- **AND** no WebLLM weights are downloaded

#### Scenario: Usable adapter present
- **GIVEN** a browser where `requestAdapter()` resolves to a non-null adapter and the Prompt API is absent
- **WHEN** `detectCapability()` runs
- **THEN** `llmTier` is `webgpu`

### Requirement: Consent before model download

No model weights SHALL be downloaded without an explicit user confirmation gathered after `ask` is invoked. This applies to the Prompt API first-use download (~4GB) and to all WebLLM downloads. When the selected engine requires a download, the terminal SHALL append a consent prompt that discloses:

- the selected model name and its approximate download size,
- that the download is one-time and the model runs fully offline afterward,
- how to decline (type `/exit`, or a negative response).

The session-creation path (`createChatSession`, including `lm.create()`, the `@mlc-ai/web-llm` dynamic import, and any weight fetch) SHALL NOT run until the user submits an affirmative response (e.g. `y`/`yes`). A negative response or `/exit` SHALL abort with nothing downloaded.

When the selected engine requires **no** download (Prompt API reporting `available`, i.e. weights already on disk), the session SHALL start immediately without a consent prompt.

WebLLM download sizes SHALL be sourced from `@mlc-ai/web-llm`'s `prebuiltAppConfig` model metadata where available, falling back to a static approximate disclosure if that field is absent.

#### Scenario: WebGPU browser no longer auto-downloads
- **GIVEN** a Chrome/Edge browser without the Prompt API but with a usable WebGPU adapter and sufficient memory
- **WHEN** the visitor runs `ask`
- **THEN** a consent prompt naming the selected model and its download size is shown
- **AND** no WebLLM weights are downloaded until the visitor confirms

#### Scenario: Affirmative confirmation starts the download
- **GIVEN** a consent prompt is shown
- **WHEN** the visitor submits an affirmative response
- **THEN** the session is created and the model downloads with in-place progress updates

#### Scenario: Declining downloads nothing
- **GIVEN** a consent prompt is shown
- **WHEN** the visitor submits `/exit` or a negative response
- **THEN** no download occurs and the terminal returns to shell mode

#### Scenario: Already-downloaded Nano needs no consent
- **GIVEN** the Prompt API reports `available` (weights already on disk)
- **WHEN** the visitor runs `ask`
- **THEN** the session starts immediately with no consent prompt and no download

### Requirement: Adaptive WebLLM model selection

When the `webgpu` tier is used, the WebLLM model SHALL be selected from the capability profile's available memory rather than a single fixed default:

1. `memoryGB ≥ 8`, or `memoryGB` unknown on a desktop device → the standard model (`Phi-3.5-mini-instruct-q4f16_1-MLC`).
2. `4 ≤ memoryGB < 8` → a lighter model (e.g. `Llama-3.2-1B-Instruct-q4f16_1-MLC`).

The selected model ID SHALL be validated against the installed `@mlc-ai/web-llm` version's `prebuiltAppConfig.model_list`; if the chosen ID is absent, the picker SHALL fall back to the largest listed model that fits the tier. `ask --webllm` SHALL force the WebLLM path (still adaptive and still behind the consent prompt) and SHALL be the only way to choose WebLLM over an available Gemini Nano. Gemini Nano, when available, SHALL remain the preferred engine.

#### Scenario: Standard model on a capable desktop
- **GIVEN** a desktop with `memoryGB ≥ 8` on the WebGPU tier that confirms the consent prompt
- **WHEN** the WebLLM model is selected
- **THEN** the standard `Phi-3.5-mini-instruct-q4f16_1-MLC` model is chosen

#### Scenario: Lighter model on a mid-memory device
- **GIVEN** a device reporting `memoryGB` of 4 on the WebGPU tier that confirms the consent prompt
- **WHEN** the WebLLM model is selected
- **THEN** a lighter model is chosen, not the desktop default

#### Scenario: Unknown memory does not over-select
- **GIVEN** a desktop browser on the WebGPU tier with `memoryGB` unknown
- **WHEN** the WebLLM model is selected
- **THEN** a usable model is chosen and the consent prompt discloses its size

#### Scenario: Force WebLLM over Nano
- **GIVEN** a browser where the Prompt API is `available`
- **WHEN** the visitor runs `ask --webllm` and confirms the consent prompt
- **THEN** the active session's `backend` reflects WebLLM, not Gemini Nano

### Requirement: Ready engine is used without prompting

An engine SHALL be considered **ready** when it requires no download: Gemini Nano when `nanoStatus === "available"`, or WebLLM when the adaptively-selected model is already present in WebLLM's cache (e.g. via `hasModelInCache(modelId)`). When at least one engine is ready, `ask` SHALL start a session with that engine immediately, with no consent prompt, no engine-choice prompt, and no download.

When more than one engine is ready, the selection preference SHALL be: the persisted engine choice (see "Engine choice persistence") if it is ready, otherwise Gemini Nano, otherwise WebLLM. Readiness SHALL be determined from live cache/availability state, which is authoritative over any persisted preference.

#### Scenario: Cached Nano starts immediately on a return visit
- **GIVEN** a returning visitor whose `nanoStatus` is `available`
- **WHEN** they run `ask`
- **THEN** a Gemini Nano session starts immediately with no consent or choice prompt and no download

#### Scenario: Cached WebLLM model starts immediately
- **GIVEN** a visitor where Nano is not available but the selected WebLLM model is present in the cache
- **WHEN** they run `ask`
- **THEN** a WebLLM session starts immediately with no consent or choice prompt and no download

#### Scenario: Persisted choice breaks a tie between two ready engines
- **GIVEN** both Nano is `available` and the selected WebLLM model is cached
- **AND** the persisted engine choice is `webllm`
- **WHEN** the visitor runs `ask`
- **THEN** the WebLLM session is used

### Requirement: First-run engine choice when both engines require download

When **no** engine is ready, Gemini Nano is `downloadable` (or `downloading`), and the WebGPU tier is selectable (usable adapter and `memoryGB` not known to be below the minimum threshold), `ask` SHALL present a one-time choice between the two engines rather than silently picking Nano. The choice SHALL disclose, for each option, the engine name and its approximate download size (Gemini Nano ≈ 4GB and shared across sites; the adaptively-selected WebLLM model and its `prebuiltAppConfig` size, site-local).

Selecting an engine SHALL serve as consent to download that engine (no separate consent step is required), SHALL persist the choice (see "Engine choice persistence"), and SHALL then create the session with in-place download progress. Declining (`/exit`) SHALL download nothing and return to shell mode.

#### Scenario: Choice shown when both need downloading
- **GIVEN** a browser where `nanoStatus` is `downloadable`, the WebGPU tier is selectable, and neither engine is ready
- **WHEN** the visitor runs `ask`
- **THEN** a choice between Gemini Nano (~4GB) and the selected WebLLM model (its size) is presented
- **AND** nothing is downloaded until the visitor selects one

#### Scenario: Selecting an engine downloads only that engine
- **GIVEN** the first-run choice is shown
- **WHEN** the visitor selects WebLLM
- **THEN** the WebLLM model downloads with progress and the session starts
- **AND** Gemini Nano is not downloaded
- **AND** the choice `webllm` is persisted

#### Scenario: Declining the choice downloads nothing
- **GIVEN** the first-run choice is shown
- **WHEN** the visitor submits `/exit`
- **THEN** no download occurs and the terminal returns to shell mode

#### Scenario: No choice when one engine is already ready
- **GIVEN** `nanoStatus` is `available` (ready) and the WebGPU tier is also selectable but its model is not cached
- **WHEN** the visitor runs `ask`
- **THEN** no choice is presented and the ready Gemini Nano session starts immediately

### Requirement: Engine choice persistence

On any committed engine selection — the first-run two-engine choice or a single-engine consent confirmation — the terminal SHALL write the chosen engine (`"nano"` or `"webllm"`) to `localStorage` under the key `ghpranav.dev:ask-engine`. The write SHALL be best-effort: if `localStorage` is unavailable or throws, the error SHALL be swallowed and the session SHALL still proceed.

The persisted value SHALL be used only as (a) the selection preference among ready engines and (b) the default-highlighted option when a first-run choice is re-shown. It SHALL NOT by itself cause any download, and it SHALL NOT override live readiness — if the persisted engine is not ready, resolution SHALL proceed as if no preference were stored.

#### Scenario: Choice is persisted on selection
- **GIVEN** the first-run choice is shown
- **WHEN** the visitor selects Gemini Nano
- **THEN** `localStorage["ghpranav.dev:ask-engine"]` becomes `"nano"`

#### Scenario: Persisted preference never forces a download
- **GIVEN** `localStorage["ghpranav.dev:ask-engine"]` is `"webllm"` but the WebLLM model is not cached and Nano is `available`
- **WHEN** the visitor runs `ask`
- **THEN** the ready Gemini Nano session is used with no download
- **AND** no WebLLM download is triggered by the stored preference

#### Scenario: Persistence failure is silent
- **GIVEN** `localStorage.setItem` throws (e.g. Safari private mode)
- **WHEN** an engine is selected
- **THEN** the session still starts
- **AND** no error propagates to the caller or the terminal output

## MODIFIED Requirements

### Requirement: `ask` is opt-in

The `ask` command SHALL be the only way to enter chat mode. The site SHALL NOT initialize an LLM backend, request model weights, or load the WebLLM bundle until the user invokes `ask`. Furthermore, when the selected engine requires a download, the site SHALL NOT download model weights or load the `@mlc-ai/web-llm` bundle until the user confirms the consent prompt (see "Consent before model download").

The `ask` command implementation SHALL be a thin wrapper that calls `ctx.enterChat({ flags: args })` and returns `null`.

#### Scenario: Idle visit downloads nothing
- **GIVEN** a visitor loads the site and does not run `ask`
- **WHEN** they remain in shell mode for the duration of the session
- **THEN** the WebLLM dynamic import is not requested
- **AND** no model weights are downloaded

#### Scenario: ask delegates to enterChat
- **WHEN** the user submits `ask` (with or without flags)
- **THEN** `ctx.enterChat({ flags: args })` is invoked exactly once with the parsed arguments
- **AND** the command returns `null` so no extra line is appended by the dispatcher

#### Scenario: ask without confirmation downloads nothing
- **GIVEN** a browser on a download-requiring tier (Prompt API first-use or WebGPU)
- **WHEN** the visitor runs `ask` but does not confirm the consent prompt
- **THEN** no model weights are downloaded and the WebLLM bundle is not loaded

### Requirement: Backend detection cascade

The LLM tier within the capability profile (see "Capability profile detection") SHALL be computed in this preference order:

1. `prompt-api` — `window.LanguageModel.availability(...)` resolves to `available`
2. `prompt-api-download` — `availability(...)` resolves to `downloadable` or `downloading`
3. `webgpu` — `navigator.gpu.requestAdapter()` resolves to a non-null adapter (see "WebGPU adapter verification before download")
4. `none` — none of the above

A failed Prompt API availability check SHALL be logged via `console.warn` and the cascade SHALL continue to the next tier; an exception SHALL NOT propagate to the caller.

#### Scenario: Chrome with Prompt API ready
- **GIVEN** a Chrome browser where `LanguageModel.availability(...)` resolves to `available`
- **WHEN** detection runs
- **THEN** the LLM tier is `prompt-api`

#### Scenario: Prompt API supported but model not downloaded
- **GIVEN** a Chrome browser where `availability(...)` resolves to `downloadable` (or `downloading`)
- **WHEN** detection runs
- **THEN** the LLM tier is `prompt-api-download`

#### Scenario: WebGPU fallback with usable adapter
- **GIVEN** a browser without Prompt API but with a non-null `requestAdapter()` result
- **WHEN** detection runs
- **THEN** the LLM tier is `webgpu`

#### Scenario: Unsupported browser
- **GIVEN** a browser with neither the Prompt API nor a usable WebGPU adapter
- **WHEN** detection runs
- **THEN** the LLM tier is `none`

### Requirement: Download progress for model downloads

When a model download is triggered after consent (the Prompt API first-use ~4GB download, or a confirmed WebLLM download), the terminal SHALL render a single `text` line of the form `  · download progress: <pct>%` and SHALL update that same line in place on subsequent progress events rather than appending a new line each tick.

#### Scenario: Progress updates in place
- **GIVEN** a model is downloading after consent (Prompt API or WebLLM)
- **WHEN** multiple progress events fire
- **THEN** only one progress line exists in the rendered output
- **AND** its text is replaced with each event's updated percentage

### Requirement: Graceful refusal on unsupported devices

When a device cannot run any on-device model, the terminal SHALL append an `error` (or `text`) message and SHALL NOT initialize a backend or enter an active chat session. A device is unsupported when there is no available Gemini Nano **and** either:

- `detectCapability()` reports `llmTier === none` (no usable WebGPU adapter), or
- the `webgpu` tier is available but `memoryGB` is known and below the minimum threshold required for the smallest selectable model.

The message SHALL explain:

- that no on-device model can run on this device,
- which environments are supported (Chrome 138+ with the Prompt API flag for Gemini Nano, or a browser/device with WebGPU and sufficient memory),
- that everything runs locally with no API keys or server,
- a hint to email Pranav.

When the device is unsupported specifically because of insufficient memory (a usable WebGPU adapter is present), the message SHALL say so distinctly (e.g. that the device lacks enough memory to run a local model), rather than implying WebGPU is missing.

#### Scenario: No engine available
- **GIVEN** a browser with neither the Prompt API nor a usable WebGPU adapter
- **WHEN** the user runs `ask`
- **THEN** a message is appended naming the supported environments and offering an email fallback
- **AND** no chat session is created and no download occurs

#### Scenario: WebGPU present but insufficient memory
- **GIVEN** a device with a usable WebGPU adapter but `memoryGB` known to be below the minimum threshold
- **WHEN** the user runs `ask`
- **THEN** a message is appended indicating the device lacks enough memory to run a local model
- **AND** no model is downloaded and no chat session is created

#### Scenario: Unknown memory is not refused
- **GIVEN** a desktop browser with a usable WebGPU adapter and `memoryGB` unknown
- **WHEN** the user runs `ask`
- **THEN** the device is NOT treated as unsupported
- **AND** the flow proceeds to the consent prompt for a conservatively-selected model

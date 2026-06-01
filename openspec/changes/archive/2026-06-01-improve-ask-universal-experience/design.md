## Context

`ask` opens a chat session backed by an on-device LLM. The current cascade (`src/lib/llm.ts` `detectBackend()`) returns one of `prompt-api | prompt-api-download | webllm | none`, and `Terminal.enterChat` (`src/components/Terminal.tsx`) acts on it. Two behaviors drive this change:

1. `enterChat` calls `createChatSession(detected, …)` for every non-`none` tier with no confirmation. For `webllm`, that immediately dynamic-imports `@mlc-ai/web-llm` and downloads the ~2GB Phi-3.5 weights. Because the Prompt API is flag-gated, ordinary Chrome/Edge users land here — a silent multi-gigabyte download on plain `ask`.
2. The WebGPU path always uses one fixed model (`Phi-3.5-mini-instruct-q4f16_1-MLC`) regardless of whether the device can run it.

An earlier iteration of this proposal added a non-LLM "lite" tier (deterministic FAQ retrieval) so unsupported devices still got answers. That **rejected** — a canned, non-AI experience didn't meet the bar for this site. This revision removes lite mode entirely: the experience is always a real on-device LLM, or a clear message.

## Goals / Non-Goals

**Goals**
- No model weights download without explicit, informed consent.
- The WebLLM model is matched to the device's available memory.
- Devices that cannot run any local model get a clear message, not a crash or silent failure.
- Gemini Nano stays the preferred engine when available; strictly on-device throughout.

**Non-Goals**
- Any non-LLM fallback / lite mode.
- Accessibility / mobile-ergonomics polish (separate proposals).
- Hosted inference; true VRAM measurement; mid-session model switching.

## Decisions

### 1. `detectCapability()` supersedes `detectBackend()`

Return a profile, not an enum:

```ts
interface Capability {
  llmTier: "prompt-api" | "prompt-api-download" | "webgpu" | "none";
  deviceClass: "desktop" | "mobile";
  memoryGB?: number;        // navigator.deviceMemory (Chromium only; undefined elsewhere)
  saveData?: boolean;       // navigator.connection.saveData when available
  effectiveType?: string;   // navigator.connection.effectiveType when available
}
```

`llmTier` is computed by the same ordered checks as today (Prompt API `availability()` → WebGPU), with the adapter probe of Decision 2. The memory/connection fields are best-effort and may be `undefined` on Safari/Firefox; a failed Prompt API check is still `console.warn`-logged and the cascade continues. `deviceClass` comes from a coarse `matchMedia("(pointer: coarse)")` / UA heuristic and only biases model choice and messaging.

### 2. Probe `requestAdapter()` before trusting WebGPU

`"gpu" in navigator` only means the API surface exists. Blocklisted GPUs, headless contexts, and some VMs expose `navigator.gpu` but return `null` from `requestAdapter()`. Today that means: download ~2GB, then fail at engine init.

**Choice:** classify `webgpu` only when `await navigator.gpu.requestAdapter()` resolves to a non-null adapter; on `null` or throw, fall through to `none`. The probe is cheap and runs before any weights are requested.

### 3. Adaptive WebLLM model selection by available memory

Map the capability profile to a model:

| Condition | Model | ~Download |
|---|---|---|
| `llmTier === prompt-api*` and not forced to WebLLM | Gemini Nano | 0 (cached) / ~4GB first use |
| WebGPU; `memoryGB ≥ 8` (or `memoryGB` unknown on desktop) | `Phi-3.5-mini-instruct-q4f16_1-MLC` | ~2GB |
| WebGPU; `4 ≤ memoryGB < 8` | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~0.9GB |
| WebGPU; `memoryGB` known and `< MIN_GB` (e.g. 4) | **unsupported message** (Decision 5) | — |

- **`navigator.deviceMemory` is bucketed** to one of `0.25, 0.5, 1, 2, 4, 8` and is an upper-bound approximation (a 3GB device reports `4`). So `MIN_GB` operates on buckets, not exact RAM; set it conservatively (treat the lowest buckets as unsupported) and document that the gate is coarse. It is tunable in one place.
- **Unknown memory** (Safari/Firefox desktop with WebGPU) is *not* treated as unsupported — these are usually capable desktops. Default to a conservative-but-usable model and proceed; the consent prompt still discloses the size.
- **VRAM is not exposed by the web platform.** `deviceMemory` is system RAM, not GPU VRAM; integrated GPUs share it, discrete GPUs don't. The mapping uses `deviceMemory` (plus WebGPU `adapter.limits` like `maxBufferSize`/`maxStorageBufferBindingSize` where useful) as a proxy. This can mis-tier in edge cases; the consent prompt + the memory gate keep the failure mode "informed choice / clear message," not "crash."
- The chosen model ID is validated against the installed `@mlc-ai/web-llm` version's `prebuiltAppConfig.model_list`; if absent, fall back to the largest listed model that fits the tier. `ask --webllm` remains a power-user override that forces WebLLM over Nano (still adaptive + consented).

### 4. Consent before any download, gathered at entry

Neither the Nano first-use download nor any WebLLM download starts until the user confirms. Flow:

```
ask
 → detectCapability()
 → pick engine + model
   ├─ prompt-api (on disk) ........ start session immediately (no download → no consent)
   ├─ prompt-api-download (~4GB) ..┐
   ├─ webgpu + enough memory ......┤→ enter chat, print consent prompt (model + size,
   │                               │   "runs offline after", how to decline) → wait for input
   │                               │     • affirmative (y/yes) → create session (download w/ progress) → ready
   │                               │     • /exit or negative   → leave chat, nothing downloaded
   └─ unsupported ................. print message, stay in shell (Decision 5)
```

- For the download tiers, `createChatSession` (which triggers `lm.create()` / the `@mlc-ai/web-llm` import + weights) is **not called** until the affirmative input. A small `pendingConsent` state in `Terminal` holds the chosen capability/model between the prompt and the confirmation; the next submitted line is interpreted as the confirm rather than a chat message.
- The consent prompt size string comes from `prebuiltAppConfig` for WebLLM; the Nano figure stays a static "~4GB" disclosure (the Prompt API doesn't expose an exact size).
- The existing in-place progress-line updater in `enterChat` is reused for both engines.

### 5. Unsupported devices get a message, not a fallback

A device is unsupported when: no Gemini Nano **and** (no usable WebGPU adapter **or** WebGPU adapter present but `memoryGB` known to be below `MIN_GB`). In that case `ask` appends a message and does **not** enter a dead chat mode (stays in shell). The message:

- states no on-device model can run on this device,
- names what is supported (Chrome 138+ with the Prompt API flag for Nano, or a browser/device with WebGPU and sufficient memory),
- reaffirms everything runs locally — no API keys, no server,
- offers the `email`/`contact` fallback.

The copy adapts to the two sub-cases: (a) no engine at all, vs (b) WebGPU present but insufficient memory ("this device doesn't have enough memory to run a local model").

### 6. First-run engine choice, readiness-based resolution, and persistence

The single-winner cascade hides a real choice: when Nano is `downloadable` it always beats WebGPU, so a user who would rather take a smaller, site-local WebLLM model than a ~4GB OS-level Nano download never gets the option. To fix this, `detectCapability()` reports both engines independently:

```ts
interface Capability {
  llmTier: ...;             // still the single preferred tier (used by selection + refusal reqs)
  nanoStatus: "available" | "downloadable" | "downloading" | "unavailable";
  webgpu: { usable: boolean };   // non-null adapter present (memory sufficiency handled in selection)
  deviceClass: ...; memoryGB?: ...; saveData?: ...; effectiveType?: ...;
}
```

**Readiness** (no download needed):
- Nano ready ⇔ `nanoStatus === "available"` (weights already on disk; cheap to detect, no bundle import).
- WebLLM ready ⇔ the adaptively-selected model is present in WebLLM's cache, checked via `@mlc-ai/web-llm`'s `hasModelInCache(modelId)`.

**Resolution order in `enterChat`:**

```
1. If a ready engine exists → use it, no prompt, no download.
     preference among ready engines: persisted choice if ready, else Nano, else WebLLM.
2. Else if both engines would need a download (nano downloadable AND webgpu selectable)
     → first-run CHOICE prompt (Nano ~4GB shared  vs  WebLLM <model> ~size site-local).
       selecting one = consent for that download. persist the choice. then download + start.
3. Else if exactly one engine needs a download → existing single-engine consent prompt.
4. Else → unsupported message (Decision 5).
```

This makes step 1 honor "just use whatever is already cached/available," and step 2 the only place a choice appears.

**Cost-aware probing.** `hasModelInCache` requires importing the `@mlc-ai/web-llm` bundle, which we otherwise defer until consent. To avoid pulling that bundle on visits that will use Nano, **check Nano first**: if Nano is `available` and is the persisted/preferred engine, use it without ever touching WebLLM. Only probe the WebLLM cache when the decision actually depends on it (no ready Nano, or the persisted choice is WebLLM). The cache probe imports the runtime but not the multi-GB weights.

**Persistence.** On any committed engine selection (first-run choice or single-engine consent), write `"nano"` / `"webllm"` to `localStorage["ghpranav.dev:ask-engine"]`, best-effort with errors swallowed — the same pattern as theme persistence (`ghpranav.dev:theme`). The persisted value is **only a preference/tiebreak and the default-highlighted option on a re-shown choice**; it never causes a download on its own, and cache/availability remain authoritative for readiness (a WebLLM cache eviction means WebLLM is no longer "ready" regardless of the stored preference).

## Risks / Trade-offs

- **`deviceMemory` is coarse and Chromium-only** → mis-tiering or refusing a capable device. Mitigation: unknown memory never refuses (only known-below-threshold does); buckets are documented; threshold is conservative and centralized.
- **RAM ≠ VRAM** → a device with plenty of RAM but a weak/integrated GPU could still struggle. Mitigation: consent prompt sets expectations; `adapter.limits` can refine selection later; the model picker errs smaller when signals conflict.
- **`prebuiltAppConfig` shape changes across WebLLM versions** → size lookup breaks. Mitigation: guard the lookup and fall back to a static approximate disclosure; pin the WebLLM version.
- **OOM still possible if the memory signal over-reports** → a model is attempted that the GPU can't hold. Mitigation: the `MIN_GB` gate removes the worst offenders; remaining failures surface as the existing `error` line rather than a silent hang.
- **Consent adds a step before the only experience** → slightly more friction than auto-start. Accepted deliberately: an unprompted multi-GB download is worse than one confirmation.
- **No fallback for unsupported devices** → those visitors get nothing interactive. Accepted per product direction; the email path remains.
- **WebLLM cache eviction** → the browser may evict Cache-API-stored weights under storage pressure, so a previously-cached model can stop being "ready." Mitigation: `hasModelInCache` is checked at entry (authoritative), and if eviction makes the persisted engine require a download again, resolution falls back to a ready engine or the consent/choice prompt — never a silent re-download.
- **`hasModelInCache` pulls the WebLLM runtime bundle** → checking WebLLM readiness costs a chunk fetch. Mitigation: Nano is checked first and short-circuits when it's the ready/preferred engine, so the WebLLM bundle loads only when the decision needs it.
- **Nano is OS/browser-shared** → it can become `available` because another site or Chrome downloaded it, which could override a user's earlier WebLLM preference. Mitigation: the persisted choice takes precedence among ready engines, so a user who picked WebLLM keeps getting WebLLM as long as it stays cached.

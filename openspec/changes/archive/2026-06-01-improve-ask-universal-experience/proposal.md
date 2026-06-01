## Why

Today the `ask` experience has two concrete problems:

- **The common Chrome/Edge desktop path is a silent ~2GB download.** The Prompt API is gated behind `chrome://flags/#prompt-api-for-gemini-nano`, which virtually no visitor has flipped. So `detectBackend()` skips Gemini Nano and returns `webllm`, and `enterChat` calls `createChatSession("webllm")` immediately — pulling the ~2GB Phi-3.5 weights with no size disclosure and no confirmation. The `--webllm` flag only *forces* WebLLM on a Nano-capable browser; it does not gate the default WebGPU path. This contradicts the project rule "the `ask` command never auto-downloads model weights."
- **One fixed model for every device.** Whatever the device, the WebGPU path downloads the same ~2GB Phi-3.5 model. On a memory-constrained phone that risks an out-of-memory tab crash; on a capable desktop it's fine. There's no adaptation to what the device can actually run.

This change keeps the feature **strictly on-device** but makes it adapt to the device: pick Gemini Nano when present, otherwise pick the largest WebLLM model the device's memory can support, and **always confirm the download first**. Devices that can't run any local model get a clear message instead of a silent failure or a crash.

This is a deliberately narrower scope than a "works on every device" approach: there is **no non-LLM fallback**. If a device can't run a local model, `ask` explains that rather than degrading to a canned, non-AI experience.

## What Changes

- **No engine auto-downloads.** When `ask` selects an engine that requires a download (Gemini Nano first-use, or any WebLLM model), the terminal shows a consent prompt naming the model and its approximate download size and waits for explicit confirmation before fetching anything. Declining (or `/exit`) downloads nothing. The current silent ~2GB WebGPU download is removed.
- **Adaptive WebLLM model selection.** On the WebGPU path, the model is chosen from the device's available memory rather than a single fixed default — a larger model on an 8GB+ desktop, a smaller one on a leaner device. Download sizes are read from WebLLM's own `prebuiltAppConfig` so the consent prompt shows accurate numbers.
- **First-run engine choice when both engines need downloading.** When Gemini Nano is downloadable *and* a sufficiently-capable WebGPU device is present *and* neither engine is already cached, `ask` presents a one-time choice — Gemini Nano (~4GB, shared across sites) vs the selected WebLLM model (its actual size) — and selecting one serves as consent to download it. The choice is remembered. On every later visit, `ask` uses whatever is already cached/available with no prompt: a ready Nano or a cached WebLLM model starts immediately, and the choice only reappears if neither is ready again.
- **Capability detection replaces the bare backend enum.** `detectCapability()` returns the LLM tier plus the device's memory and connection signals, used to pick a model and decide whether the device can run anything at all.
- **WebGPU is verified before use.** Detection probes `navigator.gpu.requestAdapter()` so a browser that exposes `navigator.gpu` but has no usable adapter is treated as unsupported instead of downloading weights and then failing.
- **Memory-gated support.** A device with a usable WebGPU adapter but memory known to be below the threshold for even the smallest model is treated as unsupported (and shown the message) rather than attempting a model that would OOM the tab.
- **Graceful message on unsupported devices.** When no Gemini Nano is available and there is no usable, sufficiently-capable WebGPU device, `ask` shows a message explaining what's supported and that everything runs locally — retaining the email fallback. Gemini Nano remains preferred over WebLLM unless `ask --webllm` forces WebLLM.

## Non-goals

- **Any non-LLM fallback** (curated FAQ / keyword retrieval / "lite mode"). Explicitly out — unsupported devices get a message, not a degraded experience.
- **Accessibility and mobile-ergonomics polish** (reduced-motion, screen-reader live region for streamed output, the iOS ≥16px input-zoom fix, `autocapitalize`/`autocorrect`, theme contrast audit). Tracked as separate proposals.
- **Hosted / server inference of any kind.** The on-device-only guarantee is reaffirmed, not relaxed.
- **True VRAM measurement.** The web platform does not expose total VRAM; selection uses `navigator.deviceMemory` (device RAM) plus WebGPU adapter limits as a proxy, defaulting conservatively when unknown.
- **Multi-model switching mid-session.** The model is chosen once at session start.

## Capabilities

### Modified Capabilities

- `on-device-llm`: Backend detection becomes capability detection (LLM tier + memory + connection + verified WebGPU adapter); all model downloads move behind an entry-time consent prompt; the WebGPU path selects a model adaptively from available memory; the graceful-refusal requirement is updated to also cover memory-gated and adapter-less WebGPU devices.

### New Capabilities

_(none — all changes are within the existing `on-device-llm` domain)_

## Impact

- **`src/lib/llm.ts`** — `detectBackend()` is superseded by `detectCapability()` returning `{ llmTier, nanoStatus, webgpu, deviceClass, memoryGB?, saveData?, effectiveType? }` — now reporting Gemini Nano and WebGPU readiness independently, not just a single winner. WebGPU classification adds a `requestAdapter()` probe. `createChatSession` gains a capability-aware WebLLM model picker that reads sizes from `prebuiltAppConfig`. A WebLLM cache check (e.g. `hasModelInCache`) determines whether the selected model is already downloaded. No lite path.
- **`src/components/Terminal.tsx`** — `enterChat` awaits `detectCapability()`, resolves a ready (already-cached/available) engine without prompting, otherwise shows either a single-engine consent prompt or a first-run two-engine choice, and only creates the session (and triggers any download or the WebLLM dynamic import) after the user picks/confirms. The chosen engine is persisted to `localStorage` (`ghpranav.dev:ask-engine`, best-effort, mirroring the existing theme persistence) and used as the preference on later visits. Unsupported / insufficient-memory devices get the message and stay in shell mode. The existing in-place download-progress updater is reused.
- **Performance budget** — no new initial-load JS; the WebLLM runtime remains lazily imported and now loads only after consent. This change *reduces* unexpected network usage by removing the silent multi-GB download. LCP and initial bundle size unaffected.
- **`openspec/specs/on-device-llm/spec.md`** — several requirements added/modified (see the spec delta in this change). No requirements removed.

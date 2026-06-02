import { SYSTEM_PROMPT } from "../content/system-prompt";

// ─── Types ─────────────────────────────────────────────────────────────────

export type NanoStatus = "available" | "downloadable" | "downloading" | "unavailable";

export interface Capability {
  llmTier: "prompt-api" | "prompt-api-download" | "webgpu" | "none";
  nanoStatus: NanoStatus;
  webgpu: { usable: boolean };
  deviceClass: "desktop" | "mobile";
  memoryGB?: number;
  saveData?: boolean;
  effectiveType?: string;
}

export type ProgressEvent =
  | { phase: "checking" }
  | { phase: "download"; loaded: number; total?: number; text?: string }
  | { phase: "loading-runtime" }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export interface ChatSession {
  backend: string;
  stream(userMessage: string, signal?: AbortSignal): AsyncIterable<string>;
  destroy(): void | Promise<void>;
}

export type ProgressCallback = (e: ProgressEvent) => void;

export type ModelSelection =
  | { kind: "nano" }
  | { kind: "webllm"; modelId: string; sizeLabel: string }
  | { kind: "unsupported"; reason: string };

// ─── Type stubs for the Prompt API (until @types/dom-chromium-ai lands) ────

declare global {
  interface Window {
    LanguageModel?: LanguageModelStatic;
  }
  interface LanguageModelStatic {
    availability(opts?: AvailabilityOptions): Promise<AvailabilityStatus>;
    create(opts?: CreateOptions): Promise<LanguageModelSession>;
    params(): Promise<{
      defaultTopK: number;
      maxTopK: number;
      defaultTemperature: number;
      maxTemperature: number;
    }>;
  }
  type AvailabilityStatus = "unavailable" | "downloadable" | "downloading" | "available";
  interface AvailabilityOptions {
    expectedInputs?: Array<{ type: "text" | "image" | "audio"; languages?: string[] }>;
    expectedOutputs?: Array<{ type: "text"; languages?: string[] }>;
  }
  interface CreateOptions {
    systemPrompt?: string;
    initialPrompts?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    expectedInputs?: AvailabilityOptions["expectedInputs"];
    expectedOutputs?: AvailabilityOptions["expectedOutputs"];
    temperature?: number;
    topK?: number;
    monitor?: (m: EventTarget) => void;
    signal?: AbortSignal;
  }
  interface LanguageModelSession {
    prompt(input: string, opts?: { signal?: AbortSignal }): Promise<string>;
    promptStreaming(input: string, opts?: { signal?: AbortSignal }): AsyncIterable<string>;
    countPromptTokens?(input: string): Promise<number>;
    tokensLeft?: number;
    destroy(): void;
  }
}

function wrapUserMessage(msg: string): string {
  return `<user_question>\n${msg}\n</user_question>`;
}

// ─── Constants ────────────────────────────────────────────────────────────

export const MIN_GB = 4;

const STANDARD_MODEL = "Phi-3.5-mini-instruct-q4f16_1-MLC";
const LIGHTER_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const TIER_MAP: Array<{ minGB: number; modelId: string }> = [
  { minGB: 8, modelId: STANDARD_MODEL },
  { minGB: MIN_GB, modelId: LIGHTER_MODEL },
];

// Chrome requires create()'s options to match the availability() probe, and an
// explicit output language so the model can attest output safety. Omit it and
// create() emits "No output language was specified" then stalls before the
// download starts. Shared so the probe and create() can't drift apart.
const NANO_IO_OPTIONS: Pick<AvailabilityOptions, "expectedInputs" | "expectedOutputs"> = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

// ─── Detection ────────────────────────────────────────────────────────────

async function probeNano(): Promise<NanoStatus> {
  if (typeof self === "undefined" || !("LanguageModel" in self)) return "unavailable";
  try {
    const lm = (self as Window).LanguageModel;
    if (!lm) return "unavailable";
    const status = await lm.availability(NANO_IO_OPTIONS);
    if (status === "available" || status === "downloadable" || status === "downloading") return status;
    return "unavailable";
  } catch (e) {
    console.warn("[llm] Prompt API availability check failed:", e);
    return "unavailable";
  }
}

async function probeWebGPU(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  try {
    const adapter = await (navigator as { gpu: GPU }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

export function detectDeviceClass(): "desktop" | "mobile" {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return coarse ? "mobile" : "desktop";
}

export async function detectCapability(): Promise<Capability> {
  const nanoStatus = await probeNano();
  const webgpuUsable = await probeWebGPU();

  let llmTier: Capability["llmTier"];
  if (nanoStatus === "available") llmTier = "prompt-api";
  else if (nanoStatus === "downloadable" || nanoStatus === "downloading") llmTier = "prompt-api-download";
  else if (webgpuUsable) llmTier = "webgpu";
  else llmTier = "none";

  const deviceClass = detectDeviceClass();

  const memoryGB: number | undefined =
    typeof navigator !== "undefined" && "deviceMemory" in navigator
      ? (navigator as { deviceMemory?: number }).deviceMemory
      : undefined;

  const conn =
    typeof navigator !== "undefined" && "connection" in navigator
      ? (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;

  return {
    llmTier,
    nanoStatus,
    webgpu: { usable: webgpuUsable },
    deviceClass,
    memoryGB,
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
  };
}

// ─── Adaptive WebLLM model selection ──────────────────────────────────────

export function pickWebLLMModel(cap: Capability): ModelSelection {
  if (cap.memoryGB !== undefined && cap.memoryGB < MIN_GB) {
    return {
      kind: "unsupported",
      reason: "this device doesn't have enough memory to run a local model.",
    };
  }

  let targetId: string;
  if (cap.memoryGB === undefined) {
    targetId = cap.deviceClass === "desktop" ? STANDARD_MODEL : LIGHTER_MODEL;
  } else {
    const tier = TIER_MAP.find((t) => cap.memoryGB! >= t.minGB);
    targetId = tier?.modelId ?? LIGHTER_MODEL;
  }

  return { kind: "webllm", modelId: targetId, sizeLabel: "" };
}

export async function resolveWebLLMModel(
  cap: Capability,
  forceModel?: string,
): Promise<ModelSelection> {
  const base = forceModel
    ? { kind: "webllm" as const, modelId: forceModel, sizeLabel: "" }
    : pickWebLLMModel(cap);

  if (base.kind !== "webllm") return base;

  const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
  const listed = prebuiltAppConfig.model_list;
  const match = listed.find((m) => m.model_id === base.modelId);

  let modelId = base.modelId;
  if (!match) {
    const fallback = [...listed]
      .filter((m) => m.vram_required_MB !== undefined)
      .sort((a, b) => (b.vram_required_MB ?? 0) - (a.vram_required_MB ?? 0))
      .find(() => true);
    if (fallback) modelId = fallback.model_id;
  }

  const record = listed.find((m) => m.model_id === modelId);
  const sizeLabel = record?.vram_required_MB
    ? `~${(record.vram_required_MB / 1024).toFixed(1)}GB`
    : "~2GB";

  return { kind: "webllm", modelId, sizeLabel };
}

// ─── WebLLM cache check ──────────────────────────────────────────────────

export async function isWebLLMModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

// ─── Resolution order (Decision 6) ───────────────────────────────────────

export type EngineResolution =
  | { action: "start"; engine: "nano" | "webllm"; modelSelection: ModelSelection }
  | { action: "consent-single"; engine: "nano" | "webllm"; modelSelection: ModelSelection }
  | { action: "consent-choice"; webllmSelection: ModelSelection }
  | { action: "unsupported"; reason: string };

export function resolveEngine(
  cap: Capability,
  opts: {
    forceWebLLM: boolean;
    pref: "nano" | "webllm" | null;
    nanoReady: boolean;
    webllmReady: boolean;
    webllmSelection: ModelSelection | null;
  },
): EngineResolution {
  const { forceWebLLM, pref, nanoReady, webllmReady, webllmSelection } = opts;

  const nanoDownloadable =
    (cap.nanoStatus === "downloadable" || cap.nanoStatus === "downloading") && !forceWebLLM;
  const webgpuSelectable =
    cap.webgpu.usable && (cap.memoryGB === undefined || cap.memoryGB >= MIN_GB);

  // Unsupported: no engine at all
  if (cap.nanoStatus === "unavailable" && !cap.webgpu.usable && !forceWebLLM) {
    return { action: "unsupported", reason: "no on-device LLM available in this browser." };
  }

  // Unsupported: WebGPU present but insufficient memory
  if (cap.nanoStatus === "unavailable" && cap.webgpu.usable &&
      cap.memoryGB !== undefined && cap.memoryGB < MIN_GB && !forceWebLLM) {
    return {
      action: "unsupported",
      reason: `this device doesn't have enough memory to run a local model (${cap.memoryGB}GB detected, ${MIN_GB}GB minimum).`,
    };
  }

  // 1. Ready engine → start immediately
  if (nanoReady || webllmReady) {
    let engine: "nano" | "webllm";
    if (nanoReady && webllmReady) {
      engine = pref === "webllm" ? "webllm" : "nano";
    } else {
      engine = nanoReady ? "nano" : "webllm";
    }
    const sel: ModelSelection = engine === "nano" ? { kind: "nano" } : webllmSelection!;
    return { action: "start", engine, modelSelection: sel };
  }

  // 2. Both engines need a download → choice prompt
  if (nanoDownloadable && webgpuSelectable && webllmSelection?.kind === "webllm") {
    return { action: "consent-choice", webllmSelection };
  }

  // 3. Exactly one engine needs a download → single consent
  if (nanoDownloadable) {
    return { action: "consent-single", engine: "nano", modelSelection: { kind: "nano" } };
  }
  if (webgpuSelectable && webllmSelection?.kind === "webllm") {
    return { action: "consent-single", engine: "webllm", modelSelection: webllmSelection };
  }

  return { action: "unsupported", reason: "no on-device LLM available in this browser." };
}

// ─── Engine persistence ──────────────────────────────────────────────────

const ENGINE_KEY = "ghpranav.dev:ask-engine";

export function loadEnginePreference(): "nano" | "webllm" | null {
  try {
    const v = localStorage.getItem(ENGINE_KEY);
    if (v === "nano" || v === "webllm") return v;
  } catch { /* best-effort */ }
  return null;
}

export function saveEnginePreference(engine: "nano" | "webllm"): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch { /* best-effort */ }
}

// ─── Session factory ─────────────────────────────────────────────────────

export interface CreateSessionOptions {
  preferWebLLM?: boolean;
  webLLMModel?: string;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export async function createChatSession(
  backend: Capability["llmTier"],
  options: CreateSessionOptions = {},
): Promise<ChatSession> {
  const { onProgress } = options;
  onProgress?.({ phase: "checking" });

  // ─── Path 1: Chrome Prompt API ────────────────────────────────────────
  if ((backend === "prompt-api" || backend === "prompt-api-download") && !options.preferWebLLM) {
    const lm = (self as Window).LanguageModel;
    if (!lm) throw new Error("Prompt API disappeared between detection and creation");

    const session = await lm.create({
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      ...NANO_IO_OPTIONS,
      temperature: 0.3,
      topK: 3,
      signal: options.signal,
      monitor(m) {
        m.addEventListener("downloadprogress", (event) => {
          const e = event as ProgressEventLike;
          onProgress?.({ phase: "download", loaded: e.loaded ?? 0, total: e.total });
        });
      },
    });
    onProgress?.({ phase: "ready" });

    return {
      backend: "Gemini Nano (Chrome Prompt API, on-device)",
      async *stream(userMessage, signal) {
        for await (const chunk of session.promptStreaming(wrapUserMessage(userMessage), { signal })) {
          yield chunk;
        }
      },
      destroy: () => session.destroy(),
    };
  }

  // ─── Path 2: WebLLM ──────────────────────────────────────────────────
  if (backend === "webgpu" || options.preferWebLLM) {
    onProgress?.({ phase: "loading-runtime" });
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

    const modelId = options.webLLMModel ?? STANDARD_MODEL;

    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (r: { progress: number; text: string }) => {
        onProgress?.({ phase: "download", loaded: r.progress, text: r.text });
      },
    });
    // CreateMLCEngine has no abort hook, so a cancel mid-load can't stop the
    // fetch — the weights finish downloading into cache. Honour it after the
    // fact by tearing the engine down instead of handing back a live session.
    if (options.signal?.aborted) {
      await engine.unload().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }
    onProgress?.({ phase: "ready" });

    return {
      backend: `WebLLM · ${modelId} · on-device`,
      async *stream(userMessage, signal) {
        const chunks = await engine.chat.completions.create({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: wrapUserMessage(userMessage) },
          ],
          stream: true,
          temperature: 0.3,
        });

        for await (const chunk of chunks) {
          if (signal?.aborted) {
            await engine.interruptGenerate();
            throw new DOMException("Aborted", "AbortError");
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      },
      destroy: async () => {
        try {
          await engine.unload();
        } catch { /* best-effort */ }
      },
    };
  }

  // ─── Path 3: Nothing ─────────────────────────────────────────────────
  throw new Error(
    "no on-device LLM backend available in this browser.\n" +
      "supported:\n" +
      "  · Chrome 138+ with chrome://flags/#prompt-api-for-gemini-nano enabled\n" +
      "  · any browser with WebGPU (recent Chrome, Edge, Arc on desktop)\n" +
      "iOS Safari, Firefox, and Android Chrome are not supported.",
  );
}

interface ProgressEventLike {
  loaded?: number;
  total?: number;
}

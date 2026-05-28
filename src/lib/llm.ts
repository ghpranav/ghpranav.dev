// ═══════════════════════════════════════════════════════════════════════════
// On-device LLM backend with cascading detection:
//   1. Chrome Prompt API (Gemini Nano) — best UX, zero download for users who
//      already have it; ~4GB one-time otherwise. Chrome 138+ + flag.
//   2. WebLLM (@mlc-ai/web-llm) — works in any WebGPU browser. 800MB-2GB
//      model download. Requires explicit opt-in to avoid surprise downloads.
//   3. Nothing — throw a descriptive error the caller can render.
//
// All paths expose the same shape:
//   { backend: string, stream(userMsg, signal): AsyncIterable<string>, destroy() }
// ═══════════════════════════════════════════════════════════════════════════

import { SYSTEM_PROMPT } from "../content/system-prompt";

// ─── Types ─────────────────────────────────────────────────────────────────

export type Backend =
  | "prompt-api"           // ready immediately
  | "prompt-api-download"  // supported but model not on disk
  | "webllm"               // WebGPU present, opt-in for ~1GB download
  | "none";                // unsupported browser

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

// Defense-in-depth: wrap user input in a delimiter referenced by the
// system prompt's anti-injection rules.
function wrapUserMessage(msg: string): string {
  return `<user_question>\n${msg}\n</user_question>`;
}

// ─── Detection ─────────────────────────────────────────────────────────────

export async function detectBackend(): Promise<Backend> {
  if (typeof self !== "undefined" && "LanguageModel" in self) {
    try {
      const lm = (self as Window).LanguageModel;
      if (lm) {
        const status = await lm.availability({
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        });
        if (status === "available") return "prompt-api";
        if (status === "downloadable" || status === "downloading") return "prompt-api-download";
      }
    } catch (e) {
      console.warn("[llm] Prompt API availability check failed:", e);
    }
  }

  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    // WebGPU present, but we don't auto-load WebLLM here — the caller is
    // responsible for confirming the ~1GB download with the user.
    return "webllm";
  }

  return "none";
}

// ─── Session factory ───────────────────────────────────────────────────────

export interface CreateSessionOptions {
  preferWebLLM?: boolean;
  webLLMModel?: string;
  onProgress?: ProgressCallback;
}

export async function createChatSession(
  backend: Backend,
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
      temperature: 0.3, // low — accurate bio recall, not creative writing
      topK: 3,
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

  // ─── Path 2: WebLLM ───────────────────────────────────────────────────
  if (backend === "webllm" || options.preferWebLLM) {
    onProgress?.({ phase: "loading-runtime" });
    // Dynamic import keeps the WebLLM bundle (~200KB JS + the model) out of
    // the initial page load. Only fetched when the user runs `ask`.
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

    const modelId = options.webLLMModel ?? "Phi-3.5-mini-instruct-q4f16_1-MLC";

    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (r: { progress: number; text: string }) => {
        onProgress?.({ phase: "download", loaded: r.progress, text: r.text });
      },
    });
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
        } catch {
          // best-effort
        }
      },
    };
  }

  // ─── Path 3: Nothing ──────────────────────────────────────────────────
  throw new Error(
    "no on-device LLM backend available in this browser.\n" +
      "supported:\n" +
      "  · Chrome 138+ with chrome://flags/#prompt-api-for-gemini-nano enabled\n" +
      "  · any browser with WebGPU (recent Chrome, Edge, Arc on desktop)\n" +
      "iOS Safari, Firefox, and Android Chrome are not supported.",
  );
}

// The Prompt API's monitor() emits a CustomEvent-ish object — typed loosely
// because the spec is still in flux.
interface ProgressEventLike {
  loaded?: number;
  total?: number;
}

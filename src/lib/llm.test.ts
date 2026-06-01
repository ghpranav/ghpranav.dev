// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectCapability, pickWebLLMModel, detectDeviceClass, resolveEngine, type Capability, type ModelSelection } from "./llm";

// ─── Helpers ──────────────────────────────────────────────────────────────

function baseCap(overrides: Partial<Capability> = {}): Capability {
  return {
    llmTier: "none",
    nanoStatus: "unavailable",
    webgpu: { usable: false },
    deviceClass: "desktop",
    ...overrides,
  };
}

// ─── 1.1: detectCapability() profile assembly ────────────────────────────

describe("detectCapability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up globalThis monkey-patches
    try { Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true }); } catch { /* ok */ }
    try { Object.defineProperty(globalThis.navigator, "gpu", { value: undefined, configurable: true }); } catch { /* ok */ }
    try { Object.defineProperty(globalThis.navigator, "deviceMemory", { value: undefined, configurable: true }); } catch { /* ok */ }
    try { Object.defineProperty(globalThis.navigator, "connection", { value: undefined, configurable: true }); } catch { /* ok */ }
  });

  it("returns tier ordering: prompt-api when Nano available", async () => {
    const mockLM = {
      availability: vi.fn().mockResolvedValue("available"),
    };
    Object.defineProperty(globalThis, "LanguageModel", { value: mockLM, configurable: true });

    const cap = await detectCapability();
    expect(cap.llmTier).toBe("prompt-api");
    expect(cap.nanoStatus).toBe("available");

  });

  it("returns prompt-api-download when Nano downloadable", async () => {
    const mockLM = {
      availability: vi.fn().mockResolvedValue("downloadable"),
    };
    Object.defineProperty(globalThis, "LanguageModel", { value: mockLM, configurable: true });

    const cap = await detectCapability();
    expect(cap.llmTier).toBe("prompt-api-download");
    expect(cap.nanoStatus).toBe("downloadable");

  });

  it("reports nanoStatus and webgpu independently", async () => {
    const mockLM = {
      availability: vi.fn().mockResolvedValue("downloadable"),
    };
    Object.defineProperty(globalThis, "LanguageModel", { value: mockLM, configurable: true });

    const mockGPU = { requestAdapter: vi.fn().mockResolvedValue({}) };
    Object.defineProperty(globalThis.navigator, "gpu", { value: mockGPU, configurable: true });

    const cap = await detectCapability();
    expect(cap.nanoStatus).toBe("downloadable");
    expect(cap.webgpu.usable).toBe(true);
    expect(cap.llmTier).toBe("prompt-api-download");

  });

  it("does not throw when connection/deviceMemory are absent (Safari/Firefox)", async () => {
    const cap = await detectCapability();
    expect(cap.llmTier).toBe("none");
    expect(cap.memoryGB).toBeUndefined();
    expect(cap.saveData).toBeUndefined();
    expect(cap.effectiveType).toBeUndefined();
  });

  it("reads deviceMemory and connection when present (Chromium)", async () => {
    Object.defineProperty(globalThis.navigator, "deviceMemory", { value: 8, configurable: true });
    Object.defineProperty(globalThis.navigator, "connection", {
      value: { saveData: false, effectiveType: "4g" },
      configurable: true,
    });

    const cap = await detectCapability();
    expect(cap.memoryGB).toBe(8);
    expect(cap.saveData).toBe(false);
    expect(cap.effectiveType).toBe("4g");

  });

  it("falls through to none when Prompt API check throws", async () => {
    const mockLM = {
      availability: vi.fn().mockRejectedValue(new Error("broken")),
    };
    Object.defineProperty(globalThis, "LanguageModel", { value: mockLM, configurable: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cap = await detectCapability();
    expect(cap.nanoStatus).toBe("unavailable");
    expect(warnSpy).toHaveBeenCalled();

  });

  it("classifies webgpu only when requestAdapter returns non-null", async () => {
    const mockGPU = { requestAdapter: vi.fn().mockResolvedValue(null) };
    Object.defineProperty(globalThis.navigator, "gpu", { value: mockGPU, configurable: true });

    const cap = await detectCapability();
    expect(cap.webgpu.usable).toBe(false);
    expect(cap.llmTier).toBe("none");

  });
});

// ─── 2.1: pickWebLLMModel ────────────────────────────────────────────────

describe("pickWebLLMModel", () => {
  it("picks standard model for memoryGB >= 8", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: 8, deviceClass: "desktop" }));
    expect(sel.kind).toBe("webllm");
    if (sel.kind === "webllm") {
      expect(sel.modelId).toBe("Phi-3.5-mini-instruct-q4f16_1-MLC");
    }
  });

  it("picks standard model for unknown memory on desktop", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: undefined, deviceClass: "desktop" }));
    expect(sel.kind).toBe("webllm");
    if (sel.kind === "webllm") {
      expect(sel.modelId).toBe("Phi-3.5-mini-instruct-q4f16_1-MLC");
    }
  });

  it("picks lighter model for 4 <= memoryGB < 8", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: 4, deviceClass: "desktop" }));
    expect(sel.kind).toBe("webllm");
    if (sel.kind === "webllm") {
      expect(sel.modelId).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    }
  });

  it("picks lighter model for unknown memory on mobile", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: undefined, deviceClass: "mobile" }));
    expect(sel.kind).toBe("webllm");
    if (sel.kind === "webllm") {
      expect(sel.modelId).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    }
  });

  it("returns unsupported for memoryGB below MIN_GB", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: 2 }));
    expect(sel.kind).toBe("unsupported");
  });

  it("returns unsupported for memoryGB of 1", () => {
    const sel = pickWebLLMModel(baseCap({ memoryGB: 1 }));
    expect(sel.kind).toBe("unsupported");
  });
});

// ─── detectDeviceClass ───────────────────────────────────────────────────

describe("detectDeviceClass", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns desktop when pointer is fine", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false } as MediaQueryList);
    expect(detectDeviceClass()).toBe("desktop");
  });

  it("returns mobile when pointer is coarse", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    expect(detectDeviceClass()).toBe("mobile");
  });
});

// ─── 5.1: resolveEngine resolution order ─────────────────────────────────

describe("resolveEngine", () => {
  const webllmSel: ModelSelection = { kind: "webllm", modelId: "Phi-3.5-mini-instruct-q4f16_1-MLC", sizeLabel: "~2GB" };

  it("ready Nano wins with no prompt", () => {
    const r = resolveEngine(baseCap({ nanoStatus: "available" }), {
      forceWebLLM: false,
      pref: null,
      nanoReady: true,
      webllmReady: false,
      webllmSelection: null,
    });
    expect(r.action).toBe("start");
    if (r.action === "start") {
      expect(r.engine).toBe("nano");
    }
  });

  it("ready WebLLM wins with no prompt when Nano unavailable", () => {
    const r = resolveEngine(baseCap({ webgpu: { usable: true } }), {
      forceWebLLM: false,
      pref: null,
      nanoReady: false,
      webllmReady: true,
      webllmSelection: webllmSel,
    });
    expect(r.action).toBe("start");
    if (r.action === "start") {
      expect(r.engine).toBe("webllm");
    }
  });

  it("persisted choice is honored among two ready engines", () => {
    const r = resolveEngine(baseCap({ nanoStatus: "available", webgpu: { usable: true } }), {
      forceWebLLM: false,
      pref: "webllm",
      nanoReady: true,
      webllmReady: true,
      webllmSelection: webllmSel,
    });
    expect(r.action).toBe("start");
    if (r.action === "start") {
      expect(r.engine).toBe("webllm");
    }
  });

  it("defaults to Nano when both ready and no preference", () => {
    const r = resolveEngine(baseCap({ nanoStatus: "available", webgpu: { usable: true } }), {
      forceWebLLM: false,
      pref: null,
      nanoReady: true,
      webllmReady: true,
      webllmSelection: webllmSel,
    });
    expect(r.action).toBe("start");
    if (r.action === "start") {
      expect(r.engine).toBe("nano");
    }
  });

  it("both downloadable → choice prompt", () => {
    const r = resolveEngine(
      baseCap({ nanoStatus: "downloadable", webgpu: { usable: true }, memoryGB: 8 }),
      {
        forceWebLLM: false,
        pref: null,
        nanoReady: false,
        webllmReady: false,
        webllmSelection: webllmSel,
      },
    );
    expect(r.action).toBe("consent-choice");
  });

  it("one downloadable (Nano only) → single consent", () => {
    const r = resolveEngine(
      baseCap({ nanoStatus: "downloadable", webgpu: { usable: false } }),
      {
        forceWebLLM: false,
        pref: null,
        nanoReady: false,
        webllmReady: false,
        webllmSelection: null,
      },
    );
    expect(r.action).toBe("consent-single");
    if (r.action === "consent-single") {
      expect(r.engine).toBe("nano");
    }
  });

  it("one downloadable (WebLLM only) → single consent", () => {
    const r = resolveEngine(
      baseCap({ nanoStatus: "unavailable", webgpu: { usable: true }, memoryGB: 8 }),
      {
        forceWebLLM: false,
        pref: null,
        nanoReady: false,
        webllmReady: false,
        webllmSelection: webllmSel,
      },
    );
    expect(r.action).toBe("consent-single");
    if (r.action === "consent-single") {
      expect(r.engine).toBe("webllm");
    }
  });

  it("neither engine available → unsupported", () => {
    const r = resolveEngine(
      baseCap({ nanoStatus: "unavailable", webgpu: { usable: false } }),
      {
        forceWebLLM: false,
        pref: null,
        nanoReady: false,
        webllmReady: false,
        webllmSelection: null,
      },
    );
    expect(r.action).toBe("unsupported");
  });

  it("persisted-but-evicted WebLLM falls back to ready Nano", () => {
    const r = resolveEngine(baseCap({ nanoStatus: "available", webgpu: { usable: true } }), {
      forceWebLLM: false,
      pref: "webllm",
      nanoReady: true,
      webllmReady: false,
      webllmSelection: webllmSel,
    });
    expect(r.action).toBe("start");
    if (r.action === "start") {
      expect(r.engine).toBe("nano");
    }
  });

  it("persisted-but-evicted WebLLM with no ready engine → consent prompt", () => {
    const r = resolveEngine(
      baseCap({ nanoStatus: "downloadable", webgpu: { usable: true }, memoryGB: 8 }),
      {
        forceWebLLM: false,
        pref: "webllm",
        nanoReady: false,
        webllmReady: false,
        webllmSelection: webllmSel,
      },
    );
    expect(r.action).toBe("consent-choice");
  });
});

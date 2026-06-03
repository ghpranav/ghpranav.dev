// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectCapability, pickWebLLMModel, detectDeviceClass, resolveEngine, createWebLLMSession, commitTurn, MAX_TURNS, type Capability, type ModelSelection, type ChatMessage, type WebLLMEngineShim } from "./llm";

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

// ─── WebLLM conversation memory ──────────────────────────────────────────
//
// 1.1  Fake engine whose create() records messages and returns canned deltas.
// 1.2–1.7  Memory policy tests — no model download required.

describe("WebLLM conversation memory", () => {
  // 1.1 Fake engine builder: records messages passed to create(), returns canned deltas per call
  function makeEngine(deltasQueue: string[][]): {
    engine: WebLLMEngineShim;
    recordedMessages: ChatMessage[][];
  } {
    const recordedMessages: ChatMessage[][] = [];
    let callIndex = 0;
    const engine: WebLLMEngineShim = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (args: { messages: ChatMessage[] }) => {
            recordedMessages.push([...args.messages]);
            const deltas = deltasQueue[callIndex++] ?? [];
            return (async function* () {
              for (const d of deltas) {
                yield { choices: [{ delta: { content: d } }] };
              }
            })();
          }),
        },
      },
      interruptGenerate: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    return { engine, recordedMessages };
  }

  async function drain(iter: AsyncIterable<string>): Promise<string> {
    let out = "";
    for await (const c of iter) out += c;
    return out;
  }

  // 1.2  After a completed turn, the next stream() sends prior user+assistant in messages
  it("sends prior turn's user and assistant in subsequent call", async () => {
    const { engine, recordedMessages } = makeEngine([["hello"], ["world"]]);
    const session = createWebLLMSession(engine, "test-model");

    await drain(session.stream("first question"));
    await drain(session.stream("second question"));

    const second = recordedMessages[1];
    expect(second[0].role).toBe("system");
    expect(second[1].role).toBe("user");
    expect(second[1].content).toContain("<user_question>");
    expect(second[2].role).toBe("assistant");
    expect(second[2].content).toBe("hello");
    expect(second[3].role).toBe("user");
    expect(second[3].content).toContain("<user_question>");
  });

  // 1.3  Aborted mid-stream: neither user nor partial assistant is committed
  it("aborted turn leaves history unchanged", async () => {
    const { engine, recordedMessages } = makeEngine([["done"], ["will-be-aborted"], ["ok"]]);
    const session = createWebLLMSession(engine, "test-model");

    await drain(session.stream("q1"));

    const ctrl = new AbortController();
    ctrl.abort();
    await expect(drain(session.stream("q2-abort", ctrl.signal))).rejects.toThrow();

    // Third turn — messages must not contain q2 content
    await drain(session.stream("q3"));

    const third = recordedMessages[2];
    // system + (q1-user, q1-assistant) + q3-user = 4
    expect(third).toHaveLength(4);
    expect(third[0].role).toBe("system");
    expect(third[1].role).toBe("user");
    expect(third[2].role).toBe("assistant");
    expect(third[3].role).toBe("user");
    expect(third[3].content).not.toContain("q2-abort");
  });

  // 1.4  Non-abort error: history left unchanged
  it("errored turn leaves history unchanged", async () => {
    const callArgs: ChatMessage[][] = [];
    let callCount = 0;
    // Inline engine: call 2 returns an iterable that throws on first next()
    const engine: WebLLMEngineShim = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (args: { messages: ChatMessage[] }) => {
            callArgs.push([...args.messages]);
            const n = ++callCount;
            if (n === 2) {
              const err = new Error("engine exploded");
              return {
                [Symbol.asyncIterator]: () => ({
                  next: async () => { throw err; },
                  return: async () => ({ value: undefined, done: true as const }),
                }),
              };
            }
            const content = n === 1 ? "first-ok" : "third-ok";
            return (async function* () { yield { choices: [{ delta: { content } }] }; })();
          }),
        },
      },
      interruptGenerate: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    const session = createWebLLMSession(engine, "test-model");

    await drain(session.stream("q1"));
    await expect(drain(session.stream("q2-error"))).rejects.toThrow("engine exploded");
    await drain(session.stream("q3"));

    const third = callArgs[2];
    expect(third).toHaveLength(4); // system + q1-user + q1-assistant + q3-user
    expect(third[2].role).toBe("assistant");
    expect(third[2].content).toBe("first-ok");
    expect(third[3].content).not.toContain("q2-error");
  });

  // 1.5  Committed history is always strict system, user, assistant, user, assistant, …
  it("committed history is strict alternating sequence", () => {
    const history: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 4; i++) {
      commitTurn(history, `user-${i}`, `assistant-${i}`, MAX_TURNS);
    }
    expect(history[0].role).toBe("system");
    for (let i = 1; i < history.length; i++) {
      const expected = i % 2 === 1 ? "user" : "assistant";
      expect(history[i].role).toBe(expected);
    }
    // No trailing unanswered user
    expect(history[history.length - 1].role).toBe("assistant");
  });

  // 1.6  Eviction: oldest pair removed, system survives, alternation preserved
  it("evicts oldest user+assistant pair when MAX_TURNS is exceeded", () => {
    const history: ChatMessage[] = [{ role: "system", content: "sys" }];

    for (let i = 0; i < MAX_TURNS; i++) {
      commitTurn(history, `user-${i}`, `assistant-${i}`, MAX_TURNS);
    }
    expect(history).toHaveLength(1 + 2 * MAX_TURNS);

    // One more — evicts oldest pair
    commitTurn(history, "user-extra", "assistant-extra", MAX_TURNS);

    expect(history).toHaveLength(1 + 2 * MAX_TURNS);
    expect(history[0].role).toBe("system");
    // Pair 0 (user-0, assistant-0) should be gone
    expect(history[1].content).toBe("user-1");
    expect(history[2].content).toBe("assistant-1");
    // Latest pair present
    expect(history[history.length - 2].content).toBe("user-extra");
    expect(history[history.length - 1].content).toBe("assistant-extra");
    // Alternation still holds after eviction
    for (let i = 1; i < history.length; i++) {
      expect(history[i].role).toBe(i % 2 === 1 ? "user" : "assistant");
    }
  });

  // 1.7  Committed user content carries <user_question> tags
  it("user message in history is wrapped with user_question tags", async () => {
    const { engine, recordedMessages } = makeEngine([["reply-a"], ["reply-b"]]);
    const session = createWebLLMSession(engine, "test-model");

    await drain(session.stream("my raw question"));
    await drain(session.stream("follow up"));

    // In the second call, the first committed user message should be wrapped
    const secondMsgs = recordedMessages[1];
    const firstUserMsg = secondMsgs.find((m) => m.role === "user");
    expect(firstUserMsg?.content).toMatch(/^<user_question>/);
    expect(firstUserMsg?.content).toContain("my raw question");
    expect(firstUserMsg?.content).toMatch(/<\/user_question>$/);
  });
});

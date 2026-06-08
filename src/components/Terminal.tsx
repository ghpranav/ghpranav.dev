import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { THEMES, loadTheme, saveTheme, type Theme, type ThemeName } from "../themes";
import { ASCII_NAME } from "../content/site";
import { buildCommands, COMMAND_REGISTRY } from "../commands";
import { complete as completeInput } from "../lib/completion";
import { closest } from "../lib/levenshtein";
import type { Capability, ChatSession, ModelSelection } from "../lib/llm";
import type { CommandContext, TerminalLine } from "../types";

type CycleState = {
  candidates: readonly string[];
  index: number;
  prefix: string;
  tokenStart: number;
};

type PendingConsent =
  | { kind: "single-engine"; engine: "nano" | "webllm"; cap: Capability; modelSelection: ModelSelection }
  | { kind: "engine-choice"; cap: Capability; nanoLabel: string; webllmSelection: ModelSelection };

import { Line } from "./Line";

type LLMModule = typeof import("../lib/llm");

const INITIAL_BOOT_LINE = "[ ok ] mounting /dev/curiosity";

let llmModulePromise: Promise<LLMModule> | null = null;

function loadLLMModule(): Promise<LLMModule> {
  llmModulePromise ??= import("../lib/llm");
  return llmModulePromise;
}

// Reject as soon as `signal` aborts, without waiting for `promise` to settle.
// Lets the UI drop back to the shell immediately even when the underlying load
// (e.g. WebLLM's CreateMLCEngine) has no way to interrupt itself.
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abortError = () => new DOMException("Aborted", "AbortError");
    if (signal.aborted) return reject(abortError());
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

export default function Terminal() {
  const [theme, setThemeState] = useState<Theme>(() => loadTheme());

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const key = (Object.keys(THEMES) as ThemeName[]).find(
      (k) => THEMES[k] === next,
    );
    if (key) saveTheme(key);
  }, []);
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "boot", text: INITIAL_BOOT_LINE },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);

  // Chat-mode state
  const [chatMode, setChatMode] = useState(false);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatStreaming, setChatStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [loadAbort, setLoadAbort] = useState<AbortController | null>(null);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);

  const [cycle, setCycle] = useState<CycleState | null>(null);

  const appendLine = useCallback((line: TerminalLine) => {
    setLines((p) => [...p, line]);
  }, []);

  const formatDownloadProgress = useCallback((progress: { loaded?: number; total?: number; text?: string }) => {
    const rawRatio =
      progress.total && progress.total > 0
        ? (progress.loaded ?? 0) / progress.total
        : (progress.loaded ?? 0);
    const clampedRatio = Math.max(0, Math.min(rawRatio, 1));

    return `  · download progress: ${Math.round(clampedRatio * 100)}%${
      progress.text ? ` (${progress.text})` : ""
    }`;
  }, []);

  const startSession = useCallback(
    async (cap: Capability, engine: "nano" | "webllm", modelSelection: ModelSelection) => {
      const preferWebLLM = engine === "webllm";
      const webLLMModel = modelSelection.kind === "webllm" ? modelSelection.modelId : undefined;
      const { createChatSession } = await loadLLMModule();

      const abort = new AbortController();
      setLoadAbort(abort);

      const sessionPromise = createChatSession(preferWebLLM ? "webgpu" : cap.llmTier, {
        preferWebLLM,
        webLLMModel,
        signal: abort.signal,
        onProgress: (progress) => {
          if (abort.signal.aborted || progress.phase !== "download") return;
          const text = formatDownloadProgress(progress);
          setLines((p) => {
            const last = p[p.length - 1];
            if (last && last.type === "text" && last.text.startsWith("  · download progress:")) {
              const out = [...p];
              out[out.length - 1] = { type: "text", text };
              return out;
            }
            return [...p, { type: "text", text }];
          });
        },
      });

      // If cancel wins the race, a session that still resolves later is orphaned
      // — destroy it so we don't leak a live engine.
      sessionPromise.then(
        (s) => { if (abort.signal.aborted) void s.destroy(); },
        () => { /* failure surfaced via raceAbort below */ },
      );

      try {
        const session = await raceAbort(sessionPromise, abort.signal);
        setLoadAbort(null);
        setChatSession(session);
        setChatLoading(false);
        appendLine({
          type: "text",
          text:
            `→ ready. backend: ${session.backend}\n` +
            `  ask anything about Pranav's work, projects, or background.\n` +
            `  commands: /exit · /clear · /model · /help\n`,
        });
      } catch (e) {
        setLoadAbort(null);
        setChatLoading(false);
        if (e instanceof Error && e.name === "AbortError") {
          setChatMode(false);
          appendLine({ type: "text", text: "→ cancelled. back to shell." });
        } else {
          appendLine({
            type: "error",
            text: `failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    },
    [appendLine, formatDownloadProgress],
  );

  const enterChat = useCallback(
    async ({ flags }: { flags: string[] }) => {
      setChatMode(true);
      setChatLoading(true);
      appendLine({ type: "text", text: "→ detecting on-device LLM capabilities..." });

      const llm = await loadLLMModule();
      const forceWebLLM = flags.includes("--webllm");
      const cap = await llm.detectCapability();
      const pref = llm.loadEnginePreference();
      const minGB = llm.MIN_GB;

      // ── Determine readiness per engine (cost-aware probing) ──────────
      const nanoReady = cap.nanoStatus === "available" && !forceWebLLM;
      const webgpuSelectable = cap.webgpu.usable &&
        (cap.memoryGB === undefined || cap.memoryGB >= minGB);

      let webllmReady = false;
      let webllmSelection: ModelSelection | null = null;

      const needWebLLMProbe = forceWebLLM || (!nanoReady && webgpuSelectable);
      if (needWebLLMProbe && webgpuSelectable) {
        webllmSelection = await llm.resolveWebLLMModel(cap);
        if (webllmSelection.kind === "webllm") {
          webllmReady = await llm.isWebLLMModelCached(webllmSelection.modelId);
        }
      }

      // ── Resolution order (Decision 6) ───────────────────────────────
      const resolution = llm.resolveEngine(cap, {
        forceWebLLM,
        pref,
        nanoReady,
        webllmReady,
        webllmSelection,
      });

      if (resolution.action === "unsupported") {
        const isMemoryIssue = cap.webgpu.usable && cap.memoryGB !== undefined && cap.memoryGB < minGB;
        appendLine({
          type: "error",
          text: isMemoryIssue
            ? `this device doesn't have enough memory to run a local model (${cap.memoryGB}GB detected, ${minGB}GB minimum).\n\n` +
              "this feature requires one of:\n" +
              "  • Chrome 138+ with Prompt API enabled (chrome://flags/#prompt-api-for-gemini-nano)\n" +
              `  • a browser with WebGPU support and at least ${minGB}GB memory\n\n` +
              "everything runs locally — no API keys, no server, no data leaves your device.\n" +
              "type `email` to reach out — that always works."
            : "no on-device LLM available in this browser.\n\n" +
              "this feature requires one of:\n" +
              "  • Chrome 138+ with Prompt API enabled (chrome://flags/#prompt-api-for-gemini-nano)\n" +
              "  • a browser with WebGPU support and sufficient memory (Chrome, Edge, Arc on recent hardware)\n\n" +
              "everything runs locally — no API keys, no server, no data leaves your device.\n" +
              "type `email` to reach out — that always works.",
        });
        setChatMode(false);
        setChatLoading(false);
        return;
      }

      if (resolution.action === "start") {
        await startSession(cap, resolution.engine, resolution.modelSelection);
        return;
      }

      if (resolution.action === "consent-choice" && resolution.webllmSelection.kind === "webllm") {
        const nanoLabel = "~4GB, shared across sites";
        const ws = resolution.webllmSelection;
        const nanoDefault = pref === "nano" ? " [default]" : "";
        const webllmDefault = pref === "webllm" ? " [default]" : "";
        appendLine({
          type: "text",
          text:
            "→ two on-device engines available, both need a one-time download:\n\n" +
            `  [1] Gemini Nano (${nanoLabel})${nanoDefault}\n` +
            `  [2] ${ws.modelId} (${ws.sizeLabel}, this site only)${webllmDefault}\n\n` +
            "both run fully offline after download. no data leaves your device.\n" +
            "type 1 or 2 to pick, or /exit to cancel.",
        });
        setPendingConsent({
          kind: "engine-choice",
          cap,
          nanoLabel,
          webllmSelection: ws,
        });
        setChatLoading(false);
        return;
      }

      if (resolution.action === "consent-single") {
        if (resolution.engine === "nano") {
          appendLine({
            type: "text",
            text:
              "→ Gemini Nano is available but needs a one-time download (~4GB, shared across sites).\n" +
              "  runs fully offline after. no data leaves your device.\n" +
              "  type y to download, n to decline, or /exit to cancel.",
          });
        } else {
          const ws = resolution.modelSelection;
          appendLine({
            type: "text",
            text:
              `→ ${ws.kind === "webllm" ? ws.modelId : "WebLLM"} available via WebGPU — one-time download (${ws.kind === "webllm" ? ws.sizeLabel : "~2GB"}).\n` +
              "  runs fully offline after. no data leaves your device.\n" +
              "  type y to download, n to decline, or /exit to cancel.",
          });
        }
        setPendingConsent({
          kind: "single-engine",
          engine: resolution.engine,
          cap,
          modelSelection: resolution.modelSelection,
        });
        setChatLoading(false);
        return;
      }
    },
    [appendLine, startSession],
  );

  const leaveChat = useCallback(() => {
    streamAbortRef.current?.abort();
    void chatSession?.destroy();
    setChatSession(null);
    setChatMode(false);
    setChatStreaming(false);
    setChatLoading(false);
    setPendingConsent(null);
    appendLine({ type: "text", text: "→ exited chat. back to shell." });
  }, [chatSession, appendLine]);

  const cmdCtx = useMemo<CommandContext>(
    () => ({
      setTheme,
      theme,
      clear: () => setLines([]),
      history,
      enterChat,
    }),
    [theme, history, enterChat, setTheme],
  );

  const commands = useMemo(() => buildCommands(cmdCtx), [cmdCtx]);

  // Boot sequence — runs once.
  useEffect(() => {
    if (booted) return;
    const seq: Array<{ d: number; l: TerminalLine }> = [
      { d: 260, l: { type: "boot", text: "[ ok ] starting kafka-listener.service" } },
      { d: 400, l: { type: "boot", text: "[ ok ] checking for on-device LLM..." } },
      { d: 560, l: { type: "boot", text: "[ ok ] warming espresso machine" } },
      { d: 720, l: { type: "boot", text: "[ ok ] system ready" } },
      { d: 880, l: { type: "ascii", text: ASCII_NAME, accent: true, alt: "Pranav" } }, // alt mirrors the banner text
      {
        d: 1020,
        l: {
          type: "text",
          text:
            "welcome. type `help` for commands, or try `ask` to chat with a local LLM about my work.",
        },
      },
    ];
    const timers = seq.map(({ d, l }) => window.setTimeout(() => appendLine(l), d));
    const bootTimer = window.setTimeout(() => setBooted(true), 1100);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(bootTimer);
    };
  }, [booted, appendLine]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current =
        el.scrollTop + el.clientHeight < el.scrollHeight - 50;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current && bodyRef.current) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      bodyRef.current.scrollTo({
        top: bodyRef.current.scrollHeight,
        behavior: prefersReduced ? "auto" : "smooth",
      });
    }
  }, [lines]);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    focusInput();
    const h = () => focusInput();
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [focusInput]);

  // The input is unmounted while loading, so capture Ctrl+C at the window to
  // cancel an in-flight detection/download.
  useEffect(() => {
    if (!loadAbort) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
        loadAbort.abort();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadAbort]);

  // ─── Chat-mode message sending ───────────────────────────────────────────
  const sendChat = useCallback(
    async (userMessage: string) => {
      if (!chatSession) {
        appendLine({
          type: "error",
          text: "no active session. /exit and try `ask` again.",
        });
        return;
      }
      setChatStreaming(true);
      const abort = new AbortController();
      streamAbortRef.current = abort;

      let buffer = "";
      setLines((p) => [...p, { type: "chat-assistant", text: "" }]);

      try {
        for await (const chunk of chatSession.stream(userMessage, abort.signal)) {
          buffer += chunk;
          setLines((p) => {
            const out = [...p];
            for (let i = out.length - 1; i >= 0; i--) {
              if (out[i].type === "chat-assistant") {
                out[i] = { type: "chat-assistant", text: buffer };
                break;
              }
            }
            return out;
          });
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          appendLine({ type: "text", text: "  (cancelled)" });
        } else {
          appendLine({
            type: "error",
            text: `error: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } finally {
        setChatStreaming(false);
        streamAbortRef.current = null;
      }
    },
    [chatSession, appendLine],
  );

  // ─── Consent handler ────────────────────────────────────────────────────
  const handleConsent = useCallback(
    async (trimmed: string) => {
      if (!pendingConsent) return;

      if (trimmed === "/exit" || trimmed === "exit" || trimmed === "n" || trimmed === "no") {
        leaveChat();
        return;
      }

      if (pendingConsent.kind === "single-engine") {
        if (trimmed === "y" || trimmed === "yes") {
          setPendingConsent(null);
          setChatLoading(true);
          const { saveEnginePreference } = await loadLLMModule();
          saveEnginePreference(pendingConsent.engine);
          await startSession(pendingConsent.cap, pendingConsent.engine, pendingConsent.modelSelection);
        } else {
          appendLine({ type: "text", text: "type y to confirm download, n to decline, or /exit to cancel." });
        }
        return;
      }

      if (pendingConsent.kind === "engine-choice") {
        if (trimmed === "1") {
          setPendingConsent(null);
          setChatLoading(true);
          const { saveEnginePreference } = await loadLLMModule();
          saveEnginePreference("nano");
          await startSession(pendingConsent.cap, "nano", { kind: "nano" });
        } else if (trimmed === "2") {
          setPendingConsent(null);
          setChatLoading(true);
          const { saveEnginePreference } = await loadLLMModule();
          saveEnginePreference("webllm");
          await startSession(pendingConsent.cap, "webllm", pendingConsent.webllmSelection);
        } else {
          appendLine({ type: "text", text: "type 1 or 2 to pick an engine, or /exit to cancel." });
        }
        return;
      }
    },
    [pendingConsent, leaveChat, startSession, appendLine],
  );

  // ─── Top-level command runner ────────────────────────────────────────────
  const runCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      const promptStr = chatMode ? "pranav-chat>" : "ghpranav@dev:~$";
      appendLine({ type: "input", text: raw, prompt: promptStr, chatMode });
      if (!trimmed) return;

      setHistory((h) => [...h, trimmed]);
      setHistIdx(-1);

      // Chat-mode handling
      if (chatMode) {
        if (trimmed === "/exit" || trimmed === "exit") {
          leaveChat();
          return;
        }

        // Pending consent intercepts input before normal chat commands
        if (pendingConsent) {
          void handleConsent(trimmed);
          return;
        }

        if (trimmed === "/clear") {
          void chatSession?.destroy();
          setChatSession(null);
          appendLine({ type: "text", text: "→ chat history reset. recreating session..." });
          void enterChat({ flags: [] });
          return;
        }
        if (trimmed === "/model") {
          appendLine({ type: "text", text: `backend: ${chatSession?.backend ?? "(none)"}` });
          return;
        }
        if (trimmed === "/help") {
          appendLine({
            type: "text",
            text:
              "  /exit — leave chat mode\n" +
              "  /clear — reset conversation\n" +
              "  /model — show which model is running\n" +
              "  /help — this message\n" +
              "  Ctrl+C — cancel current response",
          });
          return;
        }
        if (chatStreaming) {
          appendLine({
            type: "text",
            text: "  (model is still responding — Ctrl+C to cancel)",
          });
          return;
        }
        void sendChat(trimmed);
        return;
      }

      // Shell-mode handling
      const [name, ...args] = trimmed.split(/\s+/);
      const cmd = commands[name];
      if (!cmd) {
        appendLine({
          type: "error",
          text:
            `command not found: ${name}\n` +
            `  did you mean: ${closest(name, Object.keys(commands))} ?`,
        });
        return;
      }
      const out = cmd.run(args);
      if (out) appendLine(out);
    },
    [chatMode, chatSession, chatStreaming, commands, pendingConsent, appendLine, enterChat, leaveChat, sendChat, handleConsent],
  );

  const handleTab = useCallback(() => {
    if (chatMode) return;

    if (cycle !== null) {
      const next = (cycle.index + 1) % cycle.candidates.length;
      setInput(cycle.prefix + cycle.candidates[next]);
      setCycle({ ...cycle, index: next });
      return;
    }

    const result = completeInput(input, COMMAND_REGISTRY, cmdCtx);
    if (result.kind === "none") return;
    if (result.kind === "single") {
      setInput(result.replacement);
      return;
    }
    setInput(result.prefix + result.candidates[0]);
    setCycle({
      candidates: result.candidates,
      index: 0,
      prefix: result.prefix,
      tokenStart: result.tokenStart,
    });
  }, [chatMode, cycle, input, cmdCtx]);

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Tab" && cycle !== null) {
        setCycle(null);
      }
      if (e.key === "Enter") {
        runCommand(input);
        setInput("");
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleTab();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length === 0) return;
        const next = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
        setHistIdx(next);
        setInput(history[next]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx === -1) return;
        const next = histIdx + 1;
        if (next >= history.length) {
          setHistIdx(-1);
          setInput("");
        } else {
          setHistIdx(next);
          setInput(history[next]);
        }
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      } else if (e.key === "c" && e.ctrlKey) {
        if (chatStreaming && streamAbortRef.current) {
          streamAbortRef.current.abort();
        } else {
          appendLine({
            type: "input",
            text: input + "^C",
            prompt: chatMode ? "pranav-chat>" : "ghpranav@dev:~$",
            chatMode,
          });
          setInput("");
        }
      }
    },
    [input, history, histIdx, chatMode, chatStreaming, cycle, runCommand, handleTab, appendLine],
  );

  const promptStr = chatMode ? "pranav-chat>" : "ghpranav@dev:~$";

  return (
    <main
      className="ptl-root"
      style={{
        background: theme.bg,
        color: theme.fg,
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
        fontSize: "14px",
        lineHeight: 1.55,
      }}
    >
      <style>{`
        @keyframes blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        .ptl-root { position: relative; height: 100vh; height: 100dvh; display: grid; place-content: center }
        .ptl-line { animation: fadeIn 0.12s ease-out }
        .ptl-cursor { display: inline-block; width: 8px; height: 1em; background: ${theme.cursor}; vertical-align: text-bottom; animation: blink 1s steps(1) infinite; margin-left: 2px }
        .ptl-link { color: ${theme.accent}; text-decoration: none; border-bottom: 1px dotted ${theme.accent} }
        .ptl-link:hover { background: ${theme.accent}22 }
        .ptl-link:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; border-radius: 2px }
        .ptl-grain { position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: ${theme.grain};
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>") }
        .ptl-window { width: min(1024px, 100vw - 48px); height: min(calc(100vh - 48px), 800px); height: min(calc(100dvh - 48px), 800px); display: flex; flex-direction: column; border: 1px solid ${theme.dim}44; border-radius: 8px; background: ${theme.panel}; box-shadow: 0 24px 48px ${theme.bg}, 0 0 0 1px ${theme.dim}22 inset; overflow: hidden }
        .ptl-titlebar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid ${theme.dim}33; background: ${theme.bg}; flex-shrink: 0 }
        .ptl-dot { width: 12px; height: 12px; border-radius: 50% }
        .ptl-title { flex: 1; text-align: center; color: ${theme.dim}; font-size: 12px; letter-spacing: 0.05em }
        .ptl-body { padding: 18px 22px 60px; flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; scrollbar-color: ${theme.dim} ${theme.panel}; scrollbar-width: thin }
        .ptl-body::-webkit-scrollbar { width: 6px }
        .ptl-body::-webkit-scrollbar-track { background: ${theme.panel} }
        .ptl-body::-webkit-scrollbar-thumb { background: ${theme.dim}; border-radius: 3px }
        input.ptl-input { background: transparent; border: none; outline: none; color: ${theme.fg}; font-family: inherit; font-size: inherit; line-height: inherit; flex: 1; caret-color: ${theme.cursor} }
        .ptl-prompt-row { display: flex; align-items: baseline; gap: 8px }
        .ptl-tag { display: inline-block; padding: 2px 8px; margin-right: 6px; border: 1px solid ${theme.dim}66; border-radius: 3px; font-size: 11px; color: ${theme.dim} }
        .ptl-chat-prompt { color: ${theme.accent2}; font-weight: 600 }
        .ptl-streaming-cursor { display: inline-block; width: 6px; height: 1em; background: ${theme.accent}; vertical-align: text-bottom; animation: pulse 1s ease-in-out infinite; margin-left: 1px }
        @media (max-width: 600px) { .ptl-window { width: calc(100vw - 16px); height: calc(100vh - 16px); height: calc(100dvh - 16px); border-radius: 6px } .ptl-body { padding: 14px 14px 60px } }
      `}</style>

      <div className="ptl-grain" />

      <div className="ptl-window">
        <div className="ptl-titlebar">
          <div className="ptl-dot" style={{ background: "#ff5f56" }} />
          <div className="ptl-dot" style={{ background: "#ffbd2e" }} />
          <div className="ptl-dot" style={{ background: "#27c93f" }} />
          <div className="ptl-title">
            ghpranav@dev — {chatMode ? "ai (on-device)" : "zsh"} — {theme.name}
            {chatStreaming && (
              <span style={{ color: theme.accent, marginLeft: 8 }}>● streaming</span>
            )}
          </div>
        </div>

        <div ref={bodyRef} className="ptl-body" onClick={focusInput} role="log" aria-live="polite" aria-relevant="additions">
          {lines.map((l, i) => (
            <Line
              key={i}
              line={l}
              theme={theme}
              animate={!(i === 0 && l.type === "boot" && l.text === INITIAL_BOOT_LINE)}
              streaming={
                chatStreaming && l.type === "chat-assistant" && i === lines.length - 1
              }
            />
          ))}

          {booted && chatLoading && (
            <div className="ptl-line" style={{ color: theme.dim, marginTop: 4 }}>
              ··· Ctrl+C to cancel
            </div>
          )}

          {booted && !chatStreaming && !chatLoading && (
            <>
              <div className="ptl-prompt-row ptl-line">
                <span
                  className={chatMode ? "ptl-chat-prompt" : ""}
                  style={{ color: chatMode ? theme.accent2 : theme.prompt, fontWeight: 600 }}
                >
                  {promptStr}
                </span>
                <input
                  ref={inputRef}
                  className="ptl-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  inputMode="text"
                  aria-label="terminal input"
                  placeholder={chatMode ? "ask something about Pranav..." : ""}
                />
              </div>
              {!chatMode && cycle !== null && (
                <div
                  className="ptl-cycle-list ptl-line"
                  style={{ marginTop: 2 }}
                  aria-live="polite"
                >
                  {cycle.candidates.map((candidate, i) => (
                    <Fragment key={i}>
                      {i > 0 && "  "}
                      <span
                        style={
                          i === cycle.index
                            ? {
                                background: theme.accent,
                                color: theme.bg,
                                padding: "0 0.25ch",
                                borderRadius: 2,
                              }
                            : { color: theme.dim }
                        }
                      >
                        {candidate}
                      </span>
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

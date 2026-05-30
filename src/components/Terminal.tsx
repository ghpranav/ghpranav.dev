// ═══════════════════════════════════════════════════════════════════════════
// GHPRANAV.DEV — Terminal portfolio with on-device LLM chat (`ask` command).
//
// The `ask` command opens a chat session that runs entirely on the
// visitor's device:
//   1. Chrome 138+ with Prompt API enabled  →  Gemini Nano
//   2. Any WebGPU browser (Chrome/Edge)     →  WebLLM (Phi-3.5 mini, lazy-loaded)
//   3. Anything else                        →  Polite refusal, suggest Chrome
//
// No API keys. No server. No tokens billed. The model answers questions
// about Pranav using a fixed system prompt + bio context.
// ═══════════════════════════════════════════════════════════════════════════

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { THEMES, type Theme } from "../themes";
import { ASCII_NAME } from "../content/site";
import { buildCommands, COMMAND_REGISTRY } from "../commands";
import { complete as completeInput } from "../lib/completion";
import { closest } from "../lib/levenshtein";
import {
  createChatSession,
  detectBackend,
  type Backend,
  type ChatSession,
} from "../lib/llm";
import type { CommandContext, TerminalLine } from "../types";

type CycleState = {
  candidates: readonly string[];
  index: number;
  prefix: string;
  tokenStart: number;
};

import { Line } from "./Line";

export default function Terminal() {
  const [theme, setTheme] = useState<Theme>(THEMES.espresso);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);

  // Chat-mode state
  const [chatMode, setChatMode] = useState(false);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatStreaming, setChatStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);

  // Cycle state is in `useState` (not `useRef`) because the candidate
  // listing is rendered as an ephemeral block below the live prompt and
  // must re-render when the cycle starts / advances / resets.
  const [cycle, setCycle] = useState<CycleState | null>(null);

  const appendLine = useCallback((line: TerminalLine) => {
    setLines((p) => [...p, line]);
  }, []);

  const enterChat = useCallback(
    async ({ flags }: { flags: string[] }) => {
      setChatMode(true);
      appendLine({ type: "text", text: "→ initializing on-device LLM..." });

      const preferWebLLM = flags.includes("--webllm");
      const detected: Backend = preferWebLLM ? "webllm" : await detectBackend();

      if (detected === "none") {
        appendLine({
          type: "error",
          text:
            "no on-device LLM available in this browser.\n\n" +
            "this site uses one of:\n" +
            "  • Chrome 138+ with Prompt API enabled (chrome://flags/#prompt-api-for-gemini-nano)\n" +
            "  • Any browser with WebGPU support (Chrome, Edge, Arc on recent hardware)\n\n" +
            "everything runs locally. no API keys, no server, no tokens billed.\n" +
            "type /exit to leave chat mode. or just `email` me — that always works.",
        });
        return;
      }

      if (detected === "prompt-api-download") {
        appendLine({
          type: "text",
          text:
            "→ Gemini Nano not yet downloaded on this device.\n" +
            "  first message will trigger the ~4GB download. continue? type your first question or /exit.",
        });
      }

      try {
        const session = await createChatSession(detected, {
          preferWebLLM,
          onProgress: (progress) => {
            if (progress.phase === "download") {
              const text = `  · download progress: ${Math.round((progress.loaded ?? 0) * 100)}%${
                progress.text ? ` (${progress.text})` : ""
              }`;
              setLines((p) => {
                const last = p[p.length - 1];
                if (last && last.type === "text" && last.text.startsWith("  · download progress:")) {
                  const out = [...p];
                  out[out.length - 1] = { type: "text", text };
                  return out;
                }
                return [...p, { type: "text", text }];
              });
            }
          },
        });
        setChatSession(session);
        appendLine({
          type: "text",
          text:
            `→ ready. backend: ${session.backend}\n` +
            `  ask anything about Pranav's work, projects, or background.\n` +
            `  commands: /exit · /clear · /model · /help\n`,
        });
      } catch (e) {
        appendLine({
          type: "error",
          text: `failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },
    [appendLine],
  );

  const leaveChat = useCallback(() => {
    streamAbortRef.current?.abort();
    void chatSession?.destroy();
    setChatSession(null);
    setChatMode(false);
    setChatStreaming(false);
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
    [theme, history, enterChat],
  );

  const commands = useMemo(() => buildCommands(cmdCtx), [cmdCtx]);

  // Boot sequence — runs once.
  useEffect(() => {
    if (booted) return;
    const seq: Array<{ d: number; l: TerminalLine }> = [
      { d: 100, l: { type: "boot", text: "[ ok ] mounting /dev/curiosity" } },
      { d: 260, l: { type: "boot", text: "[ ok ] starting kafka-listener.service" } },
      { d: 400, l: { type: "boot", text: "[ ok ] checking for on-device LLM..." } },
      { d: 560, l: { type: "boot", text: "[ ok ] warming espresso machine" } },
      { d: 720, l: { type: "boot", text: "[ ok ] system ready" } },
      { d: 880, l: { type: "ascii", text: ASCII_NAME, accent: true } },
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
      bodyRef.current.scrollTo({
        top: bodyRef.current.scrollHeight,
        behavior: "smooth",
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
      // Push an empty assistant line we'll mutate as tokens stream in.
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

  // ─── Top-level command runner ────────────────────────────────────────────
  const runCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      const promptStr = chatMode ? "pranav-chat>" : "pranav@dev:~$";
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
    [chatMode, chatSession, chatStreaming, commands, appendLine, enterChat, leaveChat, sendChat],
  );

  const handleTab = useCallback(() => {
    if (chatMode) return;

    // Cycle path: we already started a cycle on a prior Tab and no other key
    // has fired since. Advance through the candidates in place, in the live
    // prompt; the ephemeral listing below it stays put.
    if (cycle !== null) {
      const next = (cycle.index + 1) % cycle.candidates.length;
      setInput(cycle.prefix + cycle.candidates[next]);
      setCycle({ ...cycle, index: next });
      return;
    }

    // Fresh path: ask the helper what could complete.
    const result = completeInput(input, COMMAND_REGISTRY, cmdCtx);
    if (result.kind === "none") return;
    if (result.kind === "single") {
      setInput(result.replacement);
      return;
    }
    // Many — fill the live prompt with the first candidate and start a
    // cycle. The candidate list is rendered as an ephemeral block BELOW
    // the live prompt (not in the scrollback transcript) so the prompt
    // stays anchored where the user was typing.
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
      // Any non-Tab keypress invalidates the in-progress Tab cycle. Reset
      // before the branch logic so subsequent code (and the onChange that
      // follows for character keys) sees a clean slate.
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
            prompt: chatMode ? "pranav-chat>" : "pranav@dev:~$",
            chatMode,
          });
          setInput("");
        }
      }
    },
    [input, history, histIdx, chatMode, chatStreaming, cycle, runCommand, handleTab, appendLine],
  );

  const promptStr = chatMode ? "pranav-chat>" : "pranav@dev:~$";

  return (
    <div
      className="ptl-root"
      style={{
        background: theme.bg,
        color: theme.fg,
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
        fontSize: "14px",
        lineHeight: 1.55,
      }}
    >
      {/*
        Runtime-themed styles. Theme values are interpolated, so this block
        is intentionally not extracted to a CSS file — it must re-render
        when the theme changes.
      */}
      <style>{`
        @keyframes blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        .ptl-root { position: relative; height: 100vh; height: 100dvh; display: grid; place-content: center }
        .ptl-line { animation: fadeIn 0.12s ease-out }
        .ptl-cursor { display: inline-block; width: 8px; height: 1em; background: ${theme.cursor}; vertical-align: text-bottom; animation: blink 1s steps(1) infinite; margin-left: 2px }
        .ptl-link { color: ${theme.accent}; text-decoration: none; border-bottom: 1px dotted ${theme.accent} }
        .ptl-link:hover { background: ${theme.accent}22 }
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
        input.ptl-input { background: transparent; border: none; outline: none; color: ${theme.fg}; font-family: inherit; font-size: inherit; flex: 1; caret-color: ${theme.cursor} }
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
            pranav@dev — {chatMode ? "ai (on-device)" : "zsh"} — {theme.name}
            {chatStreaming && (
              <span style={{ color: theme.accent, marginLeft: 8 }}>● streaming</span>
            )}
          </div>
        </div>

        <div ref={bodyRef} className="ptl-body" onClick={focusInput}>
          {lines.map((l, i) => (
            <Line
              key={i}
              line={l}
              theme={theme}
              streaming={
                chatStreaming && l.type === "chat-assistant" && i === lines.length - 1
              }
            />
          ))}

          {booted && !chatStreaming && (
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
                  aria-label="terminal input"
                  placeholder={chatMode ? "ask something about Pranav..." : ""}
                />
              </div>
              {!chatMode && cycle !== null && (
                <div
                  className="ptl-cycle-list ptl-line"
                  style={{ color: theme.dim, marginTop: 2 }}
                  aria-live="polite"
                >
                  {cycle.candidates.join("  ")}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

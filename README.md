# ghpranav.dev

> A terminal-styled personal site where visitors run `ask` to chat with
> an on-device LLM about my work. No API keys. No server. No tokens billed.
> No data leaves the browser.

```
$ ask
→ initializing on-device LLM...
→ ready. backend: Gemini Nano (Chrome Prompt API, on-device)
  ask anything about Pranav's work, projects, or background.
  commands: /exit · /clear · /model · /help

pranav-chat> what kind of ai work has he done?
ai › Pranav built a production LangGraph ReAct agent with multi-turn
conversation, per-user OAuth 2.0 + PKCE, and MCP-based tool orchestration
for automated L0 incident resolution at Cisco. He also designed a Kafka-based
AI SRE pipeline that triages ITSM events with LLM-based classification and
posts automated resolutions in production.
```

## Stack

- React 19 + TypeScript + Vite 8 (with the React Compiler)
- Bun for package management & scripts
- ESLint (flat config) + `typescript-eslint` + `eslint-plugin-react-hooks`
- [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) for the WebGPU fallback path
- Chrome's built-in [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
  (Gemini Nano) for the fast path

## Backend cascade

The `ask` command auto-detects the best available on-device backend:

| Tier | Backend                | Requirements                                            | Model size  | Speed       |
|-----:|------------------------|---------------------------------------------------------|------------:|-------------|
|    1 | Chrome Prompt API      | Chrome 138+, flag enabled, desktop                      | ~4GB (once) | Fast        |
|    2 | WebLLM + WebGPU        | Any WebGPU browser, ≥4GB VRAM, user opt-in (`--webllm`) | 800MB-2GB   | 40-180 tok/s|
|    3 | Graceful refusal       | Anything else (iOS Safari, Firefox, low-end devices)    | —           | —           |

Tier 1 uses Google's `LanguageModel` JS API (currently behind
`chrome://flags/#prompt-api-for-gemini-nano`).

Tier 2 uses Phi-3.5 mini. It's gated behind explicit opt-in (`ask --webllm`)
to avoid surprise bandwidth use on the first chat.

## Getting started

```bash
bun install
bun run dev       # http://localhost:5173
bun run build     # tsc -b && vite build → dist/
bun run preview   # serve dist/ locally
bun run lint
```

## Project layout

```
src/
├── App.tsx                 # mounts <Terminal />
├── main.tsx                # React root
├── index.css               # global reset + font preload + anti-flash bg
├── themes.ts               # color themes (espresso, gruvbox, nord, tokyo, paper)
├── types.ts                # discriminated-union TerminalLine + CommandTable
├── commands/
│   └── index.ts            # shell command table (help, whoami, ask, theme…)
├── components/
│   ├── Terminal.tsx        # the shell — input, history, boot seq, chat mode
│   └── Line.tsx            # pure renderer for every TerminalLine type
├── content/
│   ├── site.ts             # static portfolio content (skills, projects, contacts)
│   └── system-prompt.ts    # BIO + SYSTEM_PROMPT — the LLM's source of truth
└── lib/
    ├── llm.ts              # backend detection + cascading session factory
    └── levenshtein.ts      # "did you mean?" for unknown commands
```

The single biggest leverage point for keeping the bot accurate is the BIO
in [src/content/system-prompt.ts](src/content/system-prompt.ts). The model
will confabulate if asked about anything not stated there.

## Cross-origin isolation

WebLLM's multi-threaded WASM runtime needs `SharedArrayBuffer`, which
requires cross-origin isolation. The dev server sets the headers via
[vite.config.ts](vite.config.ts); for production hosting they're set in
[public/_headers](public/_headers) (Cloudflare Pages / Netlify format).

If you deploy elsewhere, make sure the response sets:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Honest limitations

- **Gemini Nano is small** — roughly autocomplete-class. Keep the BIO
  tight and factual; the system prompt's "I don't have that information"
  rule helps with hallucinations.
- **WebGPU isn't universal.** Mobile Safari and most Android browsers fall
  through to the graceful-refusal tier.
- **First load on the WebLLM path is slow** (800MB-2GB). Service Worker
  caching makes subsequent chats instant.
- **Prompt injection is real.** User input is wrapped in `<user_question>`
  tags and the system prompt has explicit anti-injection rules — that's
  defense-in-depth, not a guarantee. The blast radius is small (the bot
  can't do anything except generate text).
- **The model can change without notice.** Chrome auto-updates Nano.

## Extending the bot

For now everything fits in the system prompt. If the BIO grows past
~2000 tokens, switch to RAG:

1. Chunk the BIO into paragraphs.
2. Embed locally with Transformers.js (`Xenova/all-MiniLM-L6-v2`).
3. On each query, retrieve top-3 chunks by cosine similarity.
4. Inject only those chunks into the prompt.

Premature optimization until then.

## License

Personal portfolio code — feel free to learn from it, but don't redeploy
it under my name.

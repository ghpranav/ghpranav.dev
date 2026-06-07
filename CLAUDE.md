# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`ghpranav.dev` — a terminal-styled personal site. The signature feature is the `ask` shell command, which opens a chat session backed by an **on-device LLM**. No API keys, no server, no telemetry. Visitors' messages never leave the browser.

## Commands

Bun is the package manager (`bun.lock` is committed).

```bash
bun install
bun run dev       # vite dev server, http://localhost:5173
bun run build     # tsc -b && vite build → dist/
bun run preview   # bun run build, then `wrangler dev` (serves the build locally)
bun run lint      # eslint .
bun run test      # vitest run
bun run deploy    # bun run build, then `wrangler deploy` (Cloudflare)
```

Tests run with `bun run test` (Vitest); coverage is light (e.g. `src/themes/contrast.test.ts` asserts WCAG contrast across themes). Side-effectful LLM/network tests are gated behind `E2E=1` (see `openspec/config.yaml`).

## Architecture

### Big picture: one terminal, one command table, one chat session

`src/App.tsx` mounts a single `<Terminal />`. Everything else is composed inside it:

- **`src/components/Terminal.tsx`** owns all session state (lines, history, theme, chat mode, streaming session). It runs the boot sequence, dispatches commands, and switches between shell mode (`pranav@dev:~$`) and chat mode (`pranav-chat>`).
- **`src/commands/index.ts`** is a pure factory: `buildCommands(ctx)` returns a `CommandTable` (`Record<string, { help, run }>`). Commands that need to mutate terminal state (`clear`, `theme`, `ask`) receive callbacks via `ctx`; everything else is a pure `args → TerminalLine` function.
- **`src/components/Line.tsx`** is a single switch on `TerminalLine.type`. To add a new kind of output, add a variant to the discriminated union in `src/types.ts` and a case in `Line.tsx`.
- **`src/themes/`** holds one theme object per file (espresso/gruvbox/nord/tokyo/paper), assembled in `src/themes/index.ts`. Themes are interpolated into a runtime `<style>` block inside `Terminal.tsx` — that's intentional so theme switches are live, no reload.

### The LLM cascade (`src/lib/llm.ts`)

`detectCapability()` returns a `Capability` whose `llmTier` is the best available on-device runtime, in order (`resolveEngine()` then maps capability + flags to a start/consent action):

1. **`prompt-api`** — Chrome 138+ with `chrome://flags/#prompt-api-for-gemini-nano`. Uses `window.LanguageModel` (Gemini Nano). Ambient type stubs for this API live at the top of `llm.ts` since `@types/dom-chromium-ai` isn't pulled in.
2. **`prompt-api-download`** — same, but the ~4GB model isn't on disk yet. First message triggers download; progress is reported via `monitor()`.
3. **`webgpu`** — any WebGPU browser (engine kind is still `webllm`). `@mlc-ai/web-llm` is **dynamically imported** to keep its bundle out of the initial page load. The model is picked by device class / RAM: `Phi-3.5-mini-instruct-q4f16_1-MLC` on desktop (≥8GB), `Llama-3.2-1B-Instruct-q4f16_1-MLC` on lighter/mobile devices. Gated behind `ask --webllm` plus an in-terminal consent step, so users don't get a surprise download.
4. **`none`** — throw a descriptive error.

`createChatSession(backend, opts)` returns a uniform `ChatSession` shape — `{ backend, stream(msg, signal), destroy() }` — regardless of which path was taken. Callers (i.e. `Terminal.sendChat`) consume the async iterable and don't care which engine produced it.

**All user input is wrapped via `wrapUserMessage()` in `<user_question>...</user_question>` tags**, which the system prompt references in its anti-prompt-injection rules. Keep this wrapper in place when adding new chat code paths.

### The bio is the source of truth

The model has no retrieval. Everything it can say about Pranav comes from `src/content/system-prompt.ts`. If the model confabulates, the fix is almost always to tighten the BIO/SYSTEM_PROMPT there — not to change inference code.

Static portfolio data (skills, projects, contacts, `WHOAMI` segments, `ASCII_NAME`) lives in `src/content/site.ts` as plain typed exports. Commands import these directly.

### Cross-origin isolation

WebLLM needs `SharedArrayBuffer`, which requires COOP/COEP headers. These are set in two places and **must stay in sync**:

- `vite.config.ts` — for `bun run dev` and `bun run preview`
- `public/_headers` — for the deployed static host (Cloudflare Pages / Netlify format)

If you deploy somewhere else, replicate `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.

### React Compiler

The build runs `babel-plugin-react-compiler` via `@rolldown/plugin-babel` in `vite.config.ts`. Don't add `useMemo`/`useCallback` purely as performance hacks — the compiler memoizes. Use them only when needed for referential identity into effects or child props (which is how the existing code uses them).

## Conventions used by this codebase

- **Discriminated unions over inheritance**: `TerminalLine` (`src/types.ts`) is the canonical example. New output kinds = new variant + new switch arm.
- **Lowercase prose, prompt-style**: error/help/text strings use lowercase, terminal-flavored phrasing (`"command not found: foo"`, `"you can't leave. there's no door."`). Match the existing voice.
- **No CSS files for theming.** Theme-dependent styles are interpolated inside `Terminal.tsx`'s `<style>` block so they re-render on theme change. Static utility styles can stay in `src/index.css`.
- **No external state library.** Just React hooks. Streaming uses an `AbortController` held in a `useRef` so Ctrl+C can cancel mid-token.

## OpenSpec workflow

This repo uses an OpenSpec-style change workflow (see `openspec/config.yaml` and the `.claude/commands/opsx/*` + `.claude/skills/openspec-*` files). Project-specific OpenSpec rules from `openspec/config.yaml` worth knowing:

- Every command is one file under `src/commands/` exporting a `Command` (`{ name, help, run }`); `buildCommands(ctx)` in `index.ts` assembles them into the `CommandTable`.
- The `ask` command **must remain opt-in** — never auto-download model weights.
- User-input wrapping in `<user_question>` tags is a hard rule, not a suggestion.
- Performance budget: LCP < 1.2s on slow 4G, initial JS < 75KB gzipped (excluding lazily-imported WebLLM), Lighthouse 100/100 on the static shell. Anything that risks these needs a note in the proposal.

## Honest limitations to keep in mind when changing things

- Gemini Nano is small (~autocomplete-class). Long, multi-paragraph system prompts degrade quality faster than you'd expect.
- The Prompt API spec is in flux; the ambient types in `llm.ts` may need updates when Chrome ships changes.
- Mobile Safari + Firefox fall through to the graceful-refusal tier. Don't add features that assume any backend is present.

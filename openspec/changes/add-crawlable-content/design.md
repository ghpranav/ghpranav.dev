## Context

The app is a client-rendered SPA: `index.html` ships a static boot shell inside `#root` (mirrors React's `.ptl-window` to kill CLS) and a `<script type="module" src="/src/main.tsx">`. On mount, React renders into `#root`, replacing the static shell. The portfolio data lives as plain typed exports in `src/content/site.ts` (`ABOUT`, `SKILLS`, `PROJECTS`, `CONTACTS`, `WHOAMI`, `ASCII_NAME`) and `src/content/system-prompt.ts` (`BIO`). Commands import these and render them only when invoked.

Two facts drive the design:
1. **A crawler issues no commands.** Even a JS-executing crawler sees only the boot banner + welcome line — never `projects`/`skills`/etc. So the content must exist in the DOM without interaction.
2. **The project bans inlining content in components** (`config.yaml`: "Content lives in src/content/ only. Never inline content") and bans SSR/Next.js ("Static output only"). So the crawlable content must be **generated from `src/content/` at build time** — not hand-written into `index.html`, and not produced by an SSR runtime.

## Goals / Non-Goals

**Goals:**
- Real content (bio, projects, skills, contacts) present in served HTML for all crawlers.
- Single source of truth: generated from `src/content/`, so edits propagate automatically.
- Persists after React mount; doesn't disturb the visible terminal or boot sequence.
- A visible fallback for no-JS humans.
- Negligible weight; zero added JS.

**Non-Goals:**
- SSR/hydration of the terminal; hand-duplicated copy; a second interactive UI; per-route dynamic meta.

## Decisions

### 1. Build-time injection via Vite `transformIndexHtml`

**Choice:** add a Vite plugin with a `transformIndexHtml` hook. It imports the plain-data content modules (no React/DOM dependencies — safe to import in the Node build context), generates two HTML fragments (the persistent block and the `<noscript>` fallback), HTML-escapes all interpolated values, and replaces a placeholder comment (`<!-- @crawlable-content -->`) in `index.html`. The hook runs for both `vite` (dev) and `vite build`, so dev and production stay identical.

**Alternative considered:** a standalone prebuild script that writes a generated partial file committed to the repo or `dist/`. Rejected — it adds a separate build step, risks the committed artifact drifting from `src/content/`, and splits the pipeline. `transformIndexHtml` keeps generation in the existing Vite build with no extra commands.

**Alternative considered:** SSR / `vite-plugin-ssr` / pre-rendering the React tree to static HTML. Rejected — violates the "static output, no SSR" constraint, and pre-rendering the *terminal* would fight the boot animation (sacred) and CLS-tuned static shell. We need static *content*, not a pre-rendered *app*.

**Security:** all values from `src/content/` are escaped (`& < > " '`) when interpolated, even though they're authored/trusted — correct hygiene and cheap. URLs in `CONTACTS` are emitted as `href` on `<a>` with the existing `rel`/`target` conventions.

### 2. Persist outside `#root`, visually hidden, semantically real

**Choice:** inject the persistent block as a sibling of `#root` (e.g. inside `<body>` before the module script), wrapped in a visually-hidden container (`.sr-only` clip-rect technique). Because it's outside `#root`, React's mount — which only owns `#root` — never removes it. Mark it as a real document landmark: a `<main>`/`<article>` with an `<h1>` for the name, headings for sections, an unordered list of projects (name, blurb, stack), a skills list, and a contacts list of `<a>` links.

**Why outside `#root` and hidden, not inside `#root`:** content inside `#root` would be wiped the instant React mounts (bad for JS-executing crawlers that snapshot post-mount, and it would flash visibly during boot). Outside `#root` it is stable for the page's whole life and never visible to sighted users.

**Screen-reader trade-off:** the block is in the accessibility tree, so screen-reader users get a static, navigable summary of the portfolio in addition to the live terminal (`role="log"`). This is treated as a *benefit* — SR users can read the content via headings without "playing" the terminal — not a regression. It is not `aria-hidden`. (If manual SR testing finds the duplication noisy, a follow-up can reconsider; default is to expose it.)

### 3. `<noscript>` visible fallback

**Choice:** also emit a `<noscript>` block (generated from the same source) containing a visible, plainly-styled version of the content plus a one-line note that the interactive terminal requires JavaScript. This is the only content a no-JS human can see, so it is intentionally visible (not `.sr-only`).

**Why both a hidden block and noscript:** they serve different agents. JS-executing crawlers (Googlebot) and screen readers see the persistent hidden block (noscript is *not* rendered when JS is enabled). No-JS humans and non-JS crawlers see the `<noscript>`. Generating both from one source keeps them consistent.

### 4. One generator, shared shape

**Choice:** a single module builds an in-memory representation from `src/content/` and renders it to the two HTML fragments, so the persistent block and the `<noscript>` fallback can never disagree about the data. The terminal commands continue to import the same `src/content/` exports, so all three surfaces (terminal, hidden block, noscript) derive from the same data.

## Risks / Trade-offs

- **Importing `src/content/` into the Vite config context.** These modules are plain data with no DOM/React imports, so importing them in the Node build is safe. Risk: someone later adds a DOM dependency to `site.ts`. Mitigation: keep `src/content/` dependency-free (it already is) and, if needed, import only the specific data modules.
- **SR duplication.** The hidden block plus the live terminal both expose content to screen readers. Mitigated by treating the block as the canonical readable summary; revisit only if manual testing shows it's confusing.
- **Content/markup escaping bugs.** A blurb with `<`/`&` could break markup if unescaped. Mitigation: escape all interpolated values; add a test asserting representative content (e.g. a project blurb) appears escaped in the built HTML.
- **Drift between block and source.** Mitigated by generating at build time from `src/content/` — there is no committed duplicate to drift. A test asserts a known value from `PROJECTS`/`CONTACTS` is present in the built HTML.
- **Weight.** ~1–2KB of HTML. Negligible vs. the budget; zero JS. The visible LCP element is the terminal, unaffected.

## Migration Plan

Front-end build change only. Land as one change: add the placeholder to `index.html`, add the Vite plugin + generator, add the `.sr-only` utility if missing. Rollback is reverting the commit (placeholder + plugin removed; the page returns to content-less). No persisted state, no data migration. Verify by building and inspecting `dist/index.html` for the generated content and by disabling JS in the browser to see the `<noscript>` fallback.

## Open Questions

- Should the persistent block be `aria-hidden="true"` (crawler-only, no SR exposure) or exposed to SR (current default)? Default: exposed, as a benefit to SR users. Decide after manual VoiceOver/NVDA testing.
- Include the `ASCII_NAME` banner in the crawlable block? Default: no — it's decorative ASCII; the `<h1>` text name is the crawlable/SR-friendly equivalent (this dovetails with the separate ASCII text-alternative change).

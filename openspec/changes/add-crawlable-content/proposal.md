## Why

The site has thorough SEO metadata (canonical, Open Graph, Twitter cards) but **no crawlable body content**. The served `index.html` contains only the static boot shell and the line "mounting /dev/curiosity"; everything real — the bio, projects, skills, contacts — is rendered by React *and only when the visitor types a command* (`whoami`, `projects`, `skills`, `contact`). A crawler never types. So:

- **JS-executing crawlers (Googlebot)** run the app, see the boot animation and the welcome line, and index… a terminal that says "type help". The actual portfolio content is never surfaced because no command was issued.
- **Non-JS crawlers and link unfurlers** that don't execute scripts see even less — just the shell markup.
- **No-JS humans** (rare, but real: privacy browsers, text browsers, degraded networks) get a terminal that never boots and no content at all.

For a portfolio whose audience is "recruiters, hiring managers, and engineers," being effectively invisible to search and link previews is a real gap. The fix is to serve the real content as crawlable HTML — generated at build time from the existing single source of truth (`src/content/`) so nothing is hand-duplicated — without changing the interactive terminal experience for JS users.

## What Changes

- **The served HTML carries the real content.** A persistent, semantically-marked block (name as `<h1>`, role/tagline, about, projects with blurbs and stacks, skills, and contact links) is present in `index.html` as served — available to every crawler whether or not it executes JS.
- **It is generated from `src/content/`, not hand-written.** A Vite `transformIndexHtml` build step imports the plain-data exports (`ABOUT`, `PROJECTS`, `SKILLS`, `CONTACTS`, plus the `BIO`) and injects the markup at a placeholder. Editing `src/content/` updates both the terminal commands and the crawlable block; there is one source of truth.
- **The block persists past React mount.** It lives outside the `#root` container, so React's mount (which replaces `#root`'s static shell) does not remove it. It is visually hidden for sighted JS users — the terminal remains the visible UI — but remains in the DOM and the accessibility tree.
- **No-JS humans get a visible fallback.** A `<noscript>` block (also generated from `src/content/`) renders a plain, readable version of the same content with a note that the interactive terminal needs JavaScript.
- **The visible terminal and boot sequence are untouched.** JS users see exactly the same boot animation and terminal as today.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `terminal-shell`: Adds a requirement that the document shell serves crawlable, build-time-generated static content (bio, projects, skills, contacts) sourced from `src/content/`, persisting outside `#root` and visually hidden for JS users, with a `<noscript>` fallback for no-JS visitors. The interactive terminal, boot sequence, and command output are unchanged.

## Impact

- **`vite.config.ts`** — a new plugin (or addition to an existing one) implementing `transformIndexHtml`: imports the content modules, builds escaped HTML for the persistent block and the `<noscript>` fallback, and replaces a placeholder comment in `index.html`. Runs in both `dev` and `build`.
- **`index.html`** — gains a placeholder comment (e.g. `<!-- @crawlable-content -->`) outside `#root` where the generated block + `<noscript>` are injected. The existing static boot shell inside `#root` is unchanged.
- **`src/index.css`** (or the injected markup) — a `.sr-only` visually-hidden utility (clip-rect technique) for the persistent block, if one is not already present.
- **`src/content/site.ts` / `src/content/system-prompt.ts`** — unchanged as the source of truth; only *read* by the build step. (`BIO`/`ABOUT` are reused, not edited.)
- **Performance budget** — adds a small amount (~1–2KB) of static HTML to the served document and **zero** JavaScript. The visible LCP element (the terminal shell) is unaffected; the hidden block is off the visible render path. Lighthouse **SEO** should improve; Performance holds. Within the < 70KB JS budget trivially (no JS added).

## Non-goals

- **Server-side rendering / Next.js / hydrating the terminal.** Output stays static (`vite build` → `dist/`). The terminal still client-renders; we only add a static content block, we do not pre-render the app.
- **Hand-duplicating content into HTML.** All crawlable content is generated from `src/content/` at build time. No copy is authored in `index.html`.
- **Changing the visible terminal for JS users.** No change to the boot sequence (sacred), command output, or layout. The persistent block is visually hidden for them.
- **A parallel "reader mode" UI.** This is crawlable/fallback content, not a second interactive experience.
- **Dynamic/SSR meta per route.** The site is single-page; existing static meta tags are sufficient and unchanged.

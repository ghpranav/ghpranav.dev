## 1. Content generator (build-time, from src/content)

- [ ] 1.1 Add a generator module that imports `ABOUT`, `PROJECTS`, `SKILLS`, `CONTACTS` from `src/content/site.ts` and `BIO` from `src/content/system-prompt.ts` and produces an in-memory representation of the crawlable content
- [ ] 1.2 Render the representation to two HTML fragments: (a) the persistent semantic block (`<main>`/`<article>` with `<h1>` name, section headings, projects `<ul>`, skills, contact `<a>` links) and (b) the `<noscript>` visible fallback
- [ ] 1.3 HTML-escape every interpolated value (`& < > " '`); emit contact URLs as `<a href>` with `rel="noreferrer"` and `target="_blank"` consistent with the terminal's `contact` rendering

## 2. Wire into the Vite build

- [ ] 2.1 Add a `<!-- @crawlable-content -->` placeholder comment in `index.html`, placed inside `<body>` but OUTSIDE the `#root` element (e.g. immediately before the module `<script>`)
- [ ] 2.2 Add a Vite plugin with a `transformIndexHtml` hook that replaces the placeholder with the persistent block + `<noscript>` fragments from the generator; ensure it runs in both `dev` and `build`
- [ ] 2.3 Add a `.sr-only` visually-hidden utility (clip-rect technique) in `src/index.css` if one does not already exist, and apply it to the persistent block's wrapper

## 3. Tests

- [ ] 3.1 Add a test that builds (or invokes the generator) and asserts a known value from `PROJECTS` (e.g. a project `name` and a substring of its `blurb`) appears in the generated HTML
- [ ] 3.2 Add a test asserting each `CONTACTS` entry's `href` appears as an anchor in the generated HTML
- [ ] 3.3 Add a test asserting interpolated content is HTML-escaped (feed/confirm a value containing `<`/`&` is escaped, not raw)

## 4. Verify

- [ ] 4.1 Run `bun run build` and inspect `dist/index.html`: confirm the bio, all project names/blurbs/stacks, skills, and contact links are present in the served HTML, outside `#root`
- [ ] 4.2 Confirm the persistent block is visually hidden in a JS-enabled browser and that the terminal + boot sequence look and behave exactly as before
- [ ] 4.3 Disable JavaScript in the browser and confirm the `<noscript>` fallback renders the content visibly with the "terminal needs JavaScript" note
- [ ] 4.4 Confirm the persistent block survives React mount (still present in the DOM after the terminal boots)
- [ ] 4.5 Run `bun run lint`, `bun run build`, and `bun run test` — no errors; confirm zero JS was added to the client bundle and the document weight increase is ~1–2KB
- [ ] 4.6 Run a Lighthouse pass; confirm SEO improves and Performance does not regress
- [ ] 4.7 Validate the rendered HTML against a structured-data / rich-results check (or at least confirm a single `<h1>` and well-formed landmarks)

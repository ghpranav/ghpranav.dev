## ADDED Requirements

### Requirement: Crawlable static content in the served document

The served `index.html` SHALL contain the site's real content — name, role/tagline, about/bio, projects (name, blurb, stack), skills, and contact links — as crawlable HTML that is present without any user interaction. This content SHALL be generated at build time from the existing single source of truth in `src/content/` (`ABOUT`/`BIO`, `PROJECTS`, `SKILLS`, `CONTACTS`); it SHALL NOT be hand-authored or duplicated in `index.html` or any component. All interpolated values SHALL be HTML-escaped.

The crawlable block SHALL persist for the life of the page: it SHALL be placed outside the `#root` container so that React's mount (which replaces `#root`'s static shell) does not remove it. For sighted users with JavaScript, the block SHALL be visually hidden so the interactive terminal remains the visible UI; the block SHALL remain in the DOM and in the accessibility tree.

A `<noscript>` fallback SHALL be present, also generated from `src/content/`, rendering a visible plain version of the same content together with a note that the interactive terminal requires JavaScript.

The interactive terminal, the boot sequence, command output, and the layout SHALL be unchanged for JavaScript users by this requirement.

#### Scenario: Real content is in the served HTML

- **GIVEN** the production build output `dist/index.html`
- **WHEN** the served HTML is inspected without executing JavaScript
- **THEN** it contains the name, about/bio text, every project's name and blurb, the skills, and the contact links
- **AND** this content appears without any command being run

#### Scenario: Content is generated from the single source of truth

- **GIVEN** a project entry or contact defined in `src/content/`
- **WHEN** the crawlable HTML is generated at build time
- **THEN** that entry's values appear in the generated HTML
- **AND** no copy of the content is hand-authored in `index.html` or a component

#### Scenario: Block survives React mount

- **GIVEN** a JavaScript-enabled browser
- **WHEN** the terminal boots and React mounts into `#root`
- **THEN** the crawlable content block (placed outside `#root`) is still present in the DOM afterward

#### Scenario: Hidden for sighted JS users, terminal unchanged

- **GIVEN** a sighted user with JavaScript enabled
- **WHEN** the page loads and boots
- **THEN** the crawlable block is visually hidden
- **AND** the visible terminal, boot animation, and command output are exactly as before

#### Scenario: No-JS humans get a visible fallback

- **GIVEN** a browser with JavaScript disabled
- **WHEN** the page loads
- **THEN** a `<noscript>` block renders the content visibly
- **AND** it notes that the interactive terminal requires JavaScript

#### Scenario: Interpolated content is escaped

- **GIVEN** content containing HTML-significant characters (e.g. `<`, `&`)
- **WHEN** the crawlable HTML is generated
- **THEN** those characters are HTML-escaped in the output rather than emitted raw

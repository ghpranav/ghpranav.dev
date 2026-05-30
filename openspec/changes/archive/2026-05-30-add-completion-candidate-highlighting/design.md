## Context

The terminal already supports Tab cycling through completion candidates. State lives in `Terminal.tsx`:

```ts
type CycleState = {
  candidates: readonly string[];
  index: number;
  prefix: string;
  tokenStart: number;
};
const [cycle, setCycle] = useState<CycleState | null>(null);
```

The ephemeral listing is rendered at `src/components/Terminal.tsx:514-522`:

```tsx
{!chatMode && cycle !== null && (
  <div
    className="ptl-cycle-list ptl-line"
    style={{ color: theme.dim, marginTop: 2 }}
    aria-live="polite"
  >
    {cycle.candidates.join("  ")}
  </div>
)}
```

The active theme is already in scope as `theme` (from `THEMES[themeName]` in `src/themes.ts`). Every registered theme defines both `accent` and `bg`. Theme switches mutate the runtime `<style>` block already; the cycle listing's `theme.dim` reference also re-evaluates on theme change because it's inlined into the `style` prop.

What's missing: the active candidate is indistinguishable from the inactive ones in the listing. The only positional cue today is the input field above. With 5+ candidates (e.g. theme names), users have to mentally scan back to the input on every Tab press.

## Goals / Non-Goals

**Goals:**
- Make the active candidate (`cycle.candidates[cycle.index]`) visually distinct in the ephemeral listing.
- Use the active theme's `accent` as the highlight color so the affordance feels integrated with the theme — and so theme-switch quality is reinforced (each theme has its own accent identity).
- Zero impact on bundle size, runtime cost, or accessibility.
- Pure presentation change — completion matching, cycling, and dismissal semantics are untouched.

**Non-Goals:**
- No new theme tokens. We deliberately reuse `accent` + `bg` so the change ships with all five themes already configured.
- No animation or transition. Tab-to-Tab response must feel instant.
- No new CSS class, no new stylesheet rule. The current render is inline-styled; we keep it that way for consistency.
- No keyboard interactions beyond Tab (no arrow keys, no Shift+Tab reverse cycle, no mouse selection).
- No screen-reader-specific announcement of "active candidate." The input field already reflects the active value; duplicating it would chatter.

## Decisions

### Decision 1: Highlight via inline span per candidate, not via CSS class

We render each candidate as its own `<span>` and apply the active style only to the span whose array index equals `cycle.index`. The rendered structure becomes:

```tsx
<div className="ptl-cycle-list ptl-line" style={{ marginTop: 2 }} aria-live="polite">
  {cycle.candidates.map((c, i) => (
    <Fragment key={i}>
      {i > 0 && "  "}
      <span
        style={
          i === cycle.index
            ? { background: theme.accent, color: theme.bg, padding: "0 0.25ch", borderRadius: 2 }
            : { color: theme.dim }
        }
      >
        {c}
      </span>
    </Fragment>
  ))}
</div>
```

**Alternatives considered:**

- *CSS class + data attribute (`data-active`).* Would require adding a rule to `src/index.css` or to the runtime-interpolated `<style>` block inside `Terminal.tsx`. The runtime block already carries theme variables, so the rule could read them — but the current cycle render is inline-styled and adding a class for one element trades local clarity for distributed styling with no upside. Rejected.
- *Render only the active candidate highlighted, drop the others.* Would lose the surrounding-options affordance that real shells provide (zsh menu select, fish). The candidate list is the feature; the highlight is a refinement. Rejected.
- *Wrap the active candidate in `[` `]` brackets as a text-only highlight.* Works in monospace terminals but conflicts with our color-rich theme system and looks weak next to the existing colored prompt glyph. Rejected.

### Decision 2: Highlight foreground = `theme.bg`, background = `theme.accent`

Every theme defines both tokens with sufficient contrast (the accent is what we use for the prompt glyph against the panel background, so accent-on-bg also reads well — it's the inverse pairing). I verified by inspection across all five themes:

| Theme    | accent     | bg         | contrast (qualitative) |
|----------|------------|------------|------------------------|
| espresso | `#d4915d`  | `#1a120b`  | warm tan on dark brown — strong |
| gruvbox  | `#fabd2f`  | `#282828`  | bright yellow on dark — strong |
| nord     | `#88c0d0`  | `#2e3440`  | frost blue on dark slate — strong |
| tokyo    | `#7aa2f7`  | `#1a1b26`  | mid blue on near-black — strong |
| paper    | `#a0522d`  | `#f4ecd8`  | sienna on cream — strong |

The pair is the same one that's already implicit elsewhere in the UI (e.g. the prompt char is `theme.prompt` which equals or echoes `accent`, against `theme.bg`). Reusing it keeps the visual language consistent.

**Alternative considered:** semi-transparent accent (e.g. `${theme.accent}33`) as a subtler background, keeping `theme.fg` as the text color. Would need an opacity-mixed color that isn't a single token; would lose contrast on light themes (paper). Rejected in favor of the solid-accent / bg-foreground pair, which works uniformly.

### Decision 3: Padding `0 0.25ch` and `borderRadius: 2` on the active span

The `0.25ch` horizontal padding gives the highlight breathing room without misaligning the rest of the list (since vertical padding is zero and `ch` scales with the monospace font). `borderRadius: 2` softens the chip just enough to read as a UI affordance rather than as inverted text — important on the `paper` theme where the high-contrast pair otherwise looks aggressive.

**Alternative considered:** no padding, no border-radius, just background+foreground swap. Looks like a CRT inverse-video block, which fits the terminal aesthetic but felt heavy on the lighter themes. The 2px radius is the minimum that registers as "selected chip" rather than "selected raw block." Compromise chosen.

### Decision 4: Separators stay as literal `"  "` strings between spans

Two spaces between candidates was the current contract. Keeping it as a literal string (rather than CSS `margin-right`) means screen readers reading the live region still get `"skills  sudo"` as a single phrase — unchanged announcement. Visual spacing also stays exact regardless of theme.

### Decision 5: No reverse cycle, no arrow keys

Out of scope. The proposal is a presentation change. Adding keyboard nav would touch `onKey` and the cycle state machine — that's a separate change.

## Risks / Trade-offs

- **[Risk]** Accent-on-bg contrast may be poor on a future user-contributed theme. **Mitigation:** the existing theme-system spec already requires each theme to define an accent that contrasts with the bg (it's used for the prompt glyph today); any new theme that fails this would already look wrong everywhere else, so the cycle highlight doesn't impose a new constraint.

- **[Risk]** The highlight could be visually noisy if many candidates are shown (e.g. an empty-input Tab listing all ~14 commands). **Mitigation:** only one candidate is highlighted at a time; the others stay dim. Visual weight is bounded by one chip width.

- **[Risk]** The `aria-live="polite"` region re-announces on every cycle press because the DOM children change. **Note:** this is already the current behavior (the text content `"skills  sudo"` is announced the first time it appears; subsequent cycles change only the input, not the listing, so re-announcement is rare). Splitting into spans does not introduce new announcements because the text content is unchanged when only one span's style changes. Verified by reasoning about React DOM diff: React updates style attributes in place; `aria-live="polite"` does not fire on attribute-only updates. No regression.

- **[Trade-off]** We pay a tiny render cost: N spans + N-1 string fragments instead of one text node. N is bounded by the registry size (~14 commands today, 5 themes). Negligible.

## Migration Plan

Single-file edit, deployable immediately. No data migration, no feature flag, no telemetry. Rollback is `git revert` on the one commit.

## Open Questions

None. All decisions are local to the cycle-list render in `Terminal.tsx` and reuse existing theme tokens.

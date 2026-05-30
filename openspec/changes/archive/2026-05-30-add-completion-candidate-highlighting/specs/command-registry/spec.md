## MODIFIED Requirements

### Requirement: Tab cycles through candidates on repeated presses

When a Tab press produces two or more candidates, the terminal SHALL on the same press fill the in-progress token with the first candidate AND capture a cycle state containing the candidate list (registry order), the current candidate index (initially `0`, meaning "first candidate now visible in the input"), the input substring before the in-progress token (`prefix`), and the in-progress token's start position in the input (`tokenStart`).

While cycle state is non-null, the terminal SHALL render the candidate list as an **ephemeral** block immediately below the live prompt row (NOT appended to the scrollback transcript). The block SHALL show the candidates in registry order, separated visually by two spaces of whitespace. Each candidate SHALL be rendered as its own inline element so that the active candidate can be styled independently.

The terminal SHALL visually distinguish the **active candidate** — the candidate at `cycle.index`, i.e. the one currently filled into the live prompt's input field — from the other candidates in the ephemeral listing:

- The active candidate SHALL be rendered with a background color equal to the active theme's `accent` token and a foreground color equal to the active theme's `bg` token.
- The active candidate SHALL have small horizontal padding (e.g. `0 0.25ch`) and a small border-radius (e.g. `2px`) so the highlight reads as a chip rather than as inverted text.
- All non-active candidates SHALL be rendered with the active theme's `dim` token as foreground and no background.
- The active-candidate styling SHALL update synchronously on each Tab press as `cycle.index` advances, including wrap-around.
- The highlight SHALL re-derive its colors from the current theme on every render so live theme switches propagate without a reload.

When cycle state becomes `null`, the ephemeral block SHALL unmount and leave no residue in the transcript.

Subsequent **consecutive** Tab presses (no intervening keypress) SHALL operate on this cycle state:

- Each consecutive Tab SHALL advance the index by 1 modulo `candidates.length` and replace the in-progress token of the live prompt with the candidate at the new index. The replacement SHALL NOT include a trailing space — the user is still selecting.
- The active-candidate highlight in the ephemeral listing SHALL move to the new index on the same press.
- Consecutive cycling Tabs SHALL NOT append any scrollback transcript lines. The ephemeral listing below the prompt SHALL remain visible (its candidate set and order unchanged, only the highlighted index changes) throughout the cycle.

Any **non-Tab keypress** received by the input — including character input, `Backspace`, `Delete`, `Enter`, arrow keys, `Ctrl+C`, paste, etc. — SHALL clear the cycle state **before** that keypress's own logic executes. Clearing cycle state SHALL dismiss the ephemeral listing (it unmounts immediately and is NOT preserved in scrollback). The next Tab after a reset SHALL behave as a 1st-Tab press (fresh fill + fresh ephemeral listing against the new input, with the first candidate highlighted).

This rule SHALL apply identically to command-name completion and to argument completion through `command.complete`.

The highlight SHALL be a visual affordance only. The screen-reader-announced text of the ephemeral region (the candidates joined by two spaces) SHALL be unchanged by the introduction of the highlight; no separate announcement of "active candidate" SHALL be emitted, because the input field above the listing already reflects the active value.

#### Scenario: Second consecutive Tab advances to the next candidate
- **GIVEN** the input is `s` and the registry contains `skills` and `sudo` (registry order)
- **AND** the user has just pressed Tab once; the live prompt was filled with `skills` and the ephemeral listing is visible below it (cycle index `0`)
- **WHEN** the user presses `Tab` again with no intervening keypress
- **THEN** the live prompt's input field becomes `sudo` (cycle index `1`)
- **AND** the ephemeral listing below the prompt is unchanged in content and order (still `skills  sudo`)
- **AND** nothing is appended to the scrollback transcript

#### Scenario: Cycling wraps around
- **GIVEN** a cycle of two candidates `[skills, sudo]` with `index = 1` and live prompt showing `sudo`
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `skills` (index wraps to `0`)
- **AND** the ephemeral listing is still visible and its candidate set/order is unchanged
- **AND** nothing is appended to scrollback

#### Scenario: Non-Tab keypress dismisses the ephemeral listing
- **GIVEN** the user is mid-cycle with live prompt `skills`, cycle index `0`, and the ephemeral listing visible
- **WHEN** the user presses any key other than `Tab` (e.g. a letter, `Backspace`, `Enter`, an arrow key)
- **THEN** the cycle state is cleared before the keypress's normal handling
- **AND** the ephemeral listing unmounts (no transcript residue)
- **AND** the next `Tab` press is treated as a fresh first Tab (fresh fill + fresh ephemeral listing with the first candidate highlighted, against the new input)

#### Scenario: Enter mid-cycle submits the currently-visible candidate
- **GIVEN** the user is mid-cycle with live prompt `skills` (the visible candidate) and the ephemeral listing visible below
- **WHEN** the user presses `Enter`
- **THEN** the cycle state is cleared and the ephemeral listing unmounts
- **AND** the dispatcher receives `skills` as the command line (the value visible in the input is what runs)
- **AND** the scrollback receives the standard committed-command `input` echo, but not the listing

#### Scenario: Cycling on arguments works the same way
- **GIVEN** the input is `theme ` (trailing space) and the registered themes are `espresso`, `gruvbox`, `nord`, `tokyo`, `paper`
- **WHEN** the user presses `Tab`
- **THEN** the live prompt becomes `theme espresso` (cycle index `0`)
- **AND** an ephemeral listing of all five theme keys is rendered below the live prompt (registry order)
- **AND** `espresso` is the highlighted candidate in the listing
- **AND** nothing is appended to scrollback
- **WHEN** the user presses `Tab` again
- **THEN** the live prompt becomes `theme gruvbox` (cycle index `1`)
- **AND** the ephemeral listing's candidate set is unchanged
- **AND** the highlighted candidate in the listing is now `gruvbox`, not `espresso`
- **AND** nothing is appended to scrollback

#### Scenario: Active candidate is rendered with theme.accent background and theme.bg foreground
- **GIVEN** the active theme is `espresso` (`accent: "#d4915d"`, `bg: "#1a120b"`)
- **AND** the user has pressed Tab on an ambiguous prefix and cycle index is `0`
- **WHEN** the ephemeral listing renders
- **THEN** the span representing the candidate at index `0` has computed background color `#d4915d` and foreground color `#1a120b`
- **AND** every other candidate span has foreground color equal to the theme's `dim` token (`#8a7158`) and no background
- **AND** the highlighted span has non-zero horizontal padding and a non-zero border-radius

#### Scenario: Highlight moves with the cycle index, listing content does not change
- **GIVEN** the user is cycling through candidates `[espresso, gruvbox, nord, tokyo, paper]` at index `0`
- **WHEN** the user presses `Tab` three times (advancing to index `3`)
- **THEN** the ephemeral listing renders the same five candidates in the same order
- **AND** only the candidate at index `3` (`tokyo`) carries the active-style (accent background, bg foreground)
- **AND** the other four carry the inactive-style (dim foreground, no background)

#### Scenario: Highlight uses live theme tokens, not stale ones
- **GIVEN** the active theme is `nord` and an ambiguous Tab cycle is in progress with index `0`
- **AND** the cycle is in some imagined state where the active theme changes mid-cycle to `paper` without dismissing the cycle (a hypothetical, not an interactive user path)
- **WHEN** the listing re-renders
- **THEN** the highlighted candidate's background reflects `paper.accent` (`#a0522d`), not the previous `nord.accent` (`#88c0d0`)
- **AND** the inactive candidates' foreground reflects `paper.dim` (`#8a7558`)

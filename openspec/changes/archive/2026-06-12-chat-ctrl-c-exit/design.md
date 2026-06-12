## Context

`Terminal.tsx` owns all keyboard handling. The `keydown` handler on the input element covers idle, consent, and streaming phases. A separate window-level `keydown` handler covers the loading phase (when the input is unmounted).

Current Ctrl+C behaviour:
- **Streaming**: aborts the active `AbortController` — correct, no change needed.
- **Idle/consent**: echoes `^C`, clears input — does nothing useful in chat mode.
- **Loading**: calls `loadAbort.abort()` — cancels detection/download but doesn't call `leaveChat()` explicitly; cleanup depends on the abort rejection bubbling up through `startSession`.

`leaveChat()` is the single exit point: it aborts any active stream, destroys the session, resets all chat state flags, and appends `"→ exited chat. back to shell."`.

## Goals / Non-Goals

**Goals:**
- First Ctrl+C in chat mode (idle/consent/loading) shows a hint and arms a 2-second exit timer.
- Second Ctrl+C within that window calls `leaveChat()`.
- Any `leaveChat()` call (including `/exit`) clears the timer — no dangling timeouts.
- Streaming Ctrl+C remains a single-press cancel; the pending-exit timer is cleared if it happens to be armed.

**Non-Goals:**
- No change to shell-mode Ctrl+C.
- No configurable timeout.
- No visual countdown.
- No test coverage added (UI gesture logic; existing test surface is light).

## Decisions

### D1 — Single shared `useRef` for the timer

```
const ctrlCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

`useRef` over `useState` because we don't need a re-render when the timer arms or clears — the hint line is appended via `appendLine` which already triggers a lines re-render. A state variable would cause an extra render on every Ctrl+C press with no benefit.

_Alternative considered_: `useState<boolean>` for a "pending exit" flag. Rejected: requires a separate `useEffect` for the auto-reset, adding two more reactive edges for no gain.

### D2 — Clear the timer inside `leaveChat()`, not in a `useEffect`

`leaveChat` is already the canonical teardown function. Adding one `clearTimeout` there means every exit path (double-Ctrl+C, `/exit`, programmatic) is covered automatically.

_Alternative considered_: `useEffect(() => { if (!chatMode) clearTimeout(...) }, [chatMode])`. Works, but is reactive and harder to reason about — teardown happening at a distance from the trigger.

### D3 — Loading phase calls `leaveChat()` explicitly on second press

The current loading handler calls only `loadAbort.abort()` and relies on the abort rejection propagating upward to clean state. For the second-press path, `leaveChat()` is called directly after `loadAbort.abort()` to guarantee state is consistent regardless of how `startSession` handles the rejection.

### D4 — Hint text matches existing `(cancelled)` style

`"  (press ctrl-c again to exit)"` — leading two spaces, parentheses, lowercase. Matches the `"  (cancelled)"` line appended after stream aborts.

## Risks / Trade-offs

- **Timer leak if component unmounts mid-countdown**: The `useRef` value isn't registered with React's cleanup, so if the component unmounts while the timer is armed, the `setTimeout` callback will fire into a stale closure. In practice the component never unmounts (it's the app root), so this is theoretical. The callback only does `ctrlCTimerRef.current = null`, which is a no-op on a stale ref — safe.

- **Two rapid Ctrl+C presses during streaming**: If the user presses Ctrl+C to cancel a stream and immediately presses it again, the second press hits the idle branch and starts an exit countdown. This is the correct UX — stream is already cancelled, first post-cancel press shows the hint.

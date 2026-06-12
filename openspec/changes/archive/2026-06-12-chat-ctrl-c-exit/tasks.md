## 1. Add timer ref and wire leaveChat cleanup

- [x] 1.1 Add `ctrlCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)` near the other refs in `Terminal.tsx`
- [x] 1.2 In `leaveChat`, add `if (ctrlCTimerRef.current) { clearTimeout(ctrlCTimerRef.current); ctrlCTimerRef.current = null; }` before the state-reset calls

## 2. Update input keydown handler (idle + consent phases)

- [x] 2.1 In the `e.key === "c" && e.ctrlKey` branch, split the non-streaming path into: chat mode vs shell mode
- [x] 2.2 For chat mode + not streaming: if `ctrlCTimerRef.current` is null (first press), clear input, set `ctrlCHint(true)`, start 2-second timeout that nulls ref and clears hint — no appendLine
- [x] 2.3 For chat mode + not streaming: if `ctrlCTimerRef.current` is non-null (second press), clear timer, clear hint, append one `^C` input line, call `leaveChat()`
- [x] 2.4 For shell mode (non-chat): preserve existing behavior (echo `^C`, clear input)
- [x] 2.5 In the streaming abort path, add `if (ctrlCTimerRef.current) { clearTimeout(ctrlCTimerRef.current); ctrlCTimerRef.current = null; }` before `streamAbortRef.current.abort()`

## 3. Update window-level loading handler

- [x] 3.1 In the `useEffect` that handles Ctrl+C during loading (`if (!loadAbort) return`), apply the same two-press pattern: first press sets `ctrlCHint(true)` + arms timer, second press calls `loadAbort.abort()` then `leaveChat()`
- [x] 3.2 Ensure the `leaveChat` reference is included in the effect's dependency array if ESLint exhaustive-deps flags it

## 4. Verify

- [x] 4.1 `bun run lint` passes with no new errors
- [x] 4.2 `bun run test` passes (no regressions)
- [x] 4.3 Manual smoke: enter chat, press Ctrl+C once — hint appears; press again within 2s — exits to shell
- [x] 4.4 Manual smoke: enter chat, press Ctrl+C once, wait >2s, press again — hint appears again (no exit)
- [x] 4.5 Manual smoke: during streaming, press Ctrl+C — stream cancels, no hint shown

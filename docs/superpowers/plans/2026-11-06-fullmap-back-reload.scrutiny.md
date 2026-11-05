# Scrutiny: TP-0153 plan

**Intent:** a full map closed with Back must stay closed after a reload.

**Simpler alternative:** drop `retag` from the tracking effect entirely.
- That reintroduces the problem `retag` exists for: router commits, such as an in-map replace
  or a refresh, rewrite the map entry without our key. Back-to-map from another tab would then
  stop reopening the map.
- A guard is the minimal fix.

**Trace:**
- `retag` has two callers:
  - the tracking effect, which is the bug path;
  - the capture-phase link click handler, which runs on a live map entry, so the guard is a
    no-op there.
- `openFullMap` writes `LIST_KEY` on the list entry before it pushes. Next's restore keeps custom
  keys (`preserveCustomHistoryState`), so `LIST_KEY` is present when the effect runs after Back. ✔
- **Edge case:** the map was opened by reusing an entry that is already tagged (after a reload).
  - No list entry is tagged then, and Back leaves the page's history region (an earlier entry).
  - That earlier entry has neither key. The guard does not block it.
  - The `onPop` cleanup strips a stray tag in that case too. ✔
- **Leg sheet entries** (`LEG_SHEET_KEY`, spread over the map entry) still carry `FULLMAP_KEY`, so
  `shouldRetag` returns false and nothing changes. ✔

**Verdict:** ship. It cannot be verified in a browser until the end-of-batch e2e; the unit test
pins the rule.

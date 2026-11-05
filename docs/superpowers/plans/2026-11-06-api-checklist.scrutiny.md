# Scrutiny: [API-CHK]

**Intent:** agents can reorder checklist items, and the web and the API share one correct implementation.

**Simpler alternative:** add only the API reorder and leave the web alone.
- That leaves the IDOR in place: `reorderChecklistItemsAction` updates by item id with no note filter (`app/actions/notes.ts:128-137`).
- It also leaves idx gaps after a web remove.
- Routing the web through the services costs about 40 lines removed.

**Trace:**
- `assertNoteOwner` uses `canWrite`, which is the same rule as `requireTripAccess(write)`, so no permission changes for web users.
- The notes UI sends the full id list (`itemIds` CSV) on drag end, so the exact-permutation rule holds for it.
- A stale tab, where another user added an item meanwhile, now gets an error instead of silently parking the new item at 1e6+. That is a better failure.

**Verdict:** ship.

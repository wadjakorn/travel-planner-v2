# Scrutiny — TP-0145 plan

**Intent.**
1. Import can create checklist items in the same call as their note.
2. `PATCH /places/:id` stops wiping fields the caller did not send.

**Simpler alternatives**
- *Part 1: `POST /notes` with `items`.* This would also help agents that are not importing. The
  ticket scopes the change to import, so keep it there. It would need its own tx on
  `createNote`'s exec (an idempotency executor). Deferred; not needed.
- *Part 2: merge in the route only, by reading the row, spreading it, and calling the existing
  full-replace `patchPlace`.*
  - This is about 15 lines smaller.
  - It opens a lost-update window, because unsent fields are written back with values read before
    a lookup that can take up to 20 s.
  - The plan re-merges inside the tx. That costs one SELECT inside the existing tx. **Keep the
    plan.**

## Trace

- **Route → `patchPlace` → `updatePlace`** (`place-service.ts:154`)
  - `updatePlace` writes `omitUnits(fields, untouchedUnits(fields, null))`. With no `base` on the
    API path, every field is written. That is correct once `fields` is the merged full object. ✔
  - `googleSyncOnUpdate(stored, fields, …)` compares `stored.placeIdExternal` with
    `fields.placeIdExternal`.
    - If an unrelated field changes, the merge keeps `placeIdExternal`, so the Google snapshot is
      **kept**.
    - Today the snapshot is dropped on every PATCH that omits `placeIdExternal`. This is a
      secondary bug that the change fixes. ✔
  - When a relocate succeeds, `placeIdExternal` becomes the new or null id, so the snapshot resets.
    This is intended.
- **`patchPlace` callers:** only the v1 route. Web actions use `updatePlace` directly. MCP is not
  built yet (TP-0035). ✔
- **Existing integration test** (`route.integration.test.ts`): the `patch()` helper passes
  `parsePlaceFields(body)`. The bodies include `kind` and `name`, so they stay valid as a patch.
  - Switch the helper to `parsePlacePatch`.
  - Add the merge cases.
- **Testability:** extract the relocate logic into `lib/api/place-patch.ts`
  (`resolvePlacePatch(existing, patch, link, budget, deps)`). Unit tests can then drive the
  decision matrix with the `readLink` / `textSearch` / `geocode` deps that `place-link.test.ts`
  already fakes. Plan amended.
- **Notes import:**
  - `import-service.ts:139` inserts notes in the import tx. Adding `.returning` plus an items
    insert keeps the import atomic. ✔
  - `parseArraySection` already wraps item errors with `notes[i]`. Check that before inventing
    labels.
- **`listNotes` drive-by:** confirmed. The `checklistItems` select has no `where` clause
  (`note-service.ts:40-43`), so it reads the whole table. The fix is behaviour-preserving.

## Edge cases

- Patch `address: null` when the stored address is non-null: `addressChanged` is true and
  `coordsSent` is false, so a relocate runs with no address.
  - `applyPlaceLink` returns early: no link, no address, no query.
  - The result has no coords, so it counts as "failed" and the pin is kept. **Acceptable:**
    clearing the address should not move or clear the pin.
  - Make sure no warning is emitted in this case. `applyPlaceLink` emits none on early return. ✔
- Changing `kind` to `transit`: the stored pin is kept, and no lookup runs unless a relocate
  triggers. `applyPlaceLink` skips the geocode for transit. ✔
- An empty body (`{}`) returns the current place unchanged. `updatePlace` still bumps `updatedAt`
  and writes an audit row. That is acceptable, but skip the write when the patch is empty and
  `arrive` is undefined. Plan amended.

**Verdict:** ship the amended plan.

# TP-0145 — import `notes[].items[]` + `PATCH /places/:id` as a merge-patch

Ticket: TP-0145 (epic TP-0138, AAUX2). The decision comment from 2026-11-04 is binding:
- Do the merge-patch, and do **not** add a `PUT`.
- Re-geocode only when `address` actually changes **and** `lat`/`lng` were not sent in the same body.

## Part 1 — import notes accept `items`

**Today**
- `parseNoteInput` (`lib/services/note-service.ts`) reads only `kind`, `title` and `body`.
- An agent therefore needs one `POST /notes/:id/items` per checklist item. E-city needs 10.

**Change**
- `parseNoteImportInput(body)` in `note-service.ts` returns `parseNoteInput(body)` plus `items`.
  - `items` is optional. It defaults to `[]` when absent or `null`. It must be an array of at most
    **200** entries.
  - Each entry is `{ text, done? }`. `text` is a trimmed, non-empty string. `done` must be a
    boolean when present.
  - Validation errors return 400 with an indexed label, e.g. `"notes[0].items[3].text" is required`.
    Errors from `parseArraySection` are already prefixed per item, so match that style.
  - `items` on a `doc` note returns 400: `"items" is only allowed on a checklist note`.
  - The single-create `POST /trips/:id/notes` is unchanged; it keeps `parseNoteInput`.
- `import-sections.ts`: `notes` uses `parseNoteImportInput`, and `ParsedNote` gains `items`.
- `import-service.ts`: insert the note `.returning({ id })`, then bulk-insert its items with
  `idx = 0..n-1`. This happens in the same tx, so it stays atomic.
- The dryRun preview needs no change. `sections.notes` is passed through and now shows `items`.
- **Drive-by:** `listNotes` loads **every** `checklist_item` row in the database and then filters
  them in memory. It should load only the items for this trip's notes, using
  `inArray(checklistItems.noteId, noteIds)`. This was found during the trace. The cost is
  O(all items), and it gets worse as the table grows.

## Part 2 — `PATCH /places/:placeId` merge-patch

**Today**
- The route runs `parsePlaceFields(body)`, which builds a full object. Every absent field
  becomes `null`.
- `lat`, `lng`, `placeIdExternal`, `note` and the rest are therefore wiped when omitted.
- Hotels and transport already patch only the fields that are sent.

**New semantics**
- **Absent key:** keep the stored value.
- **`null`:** clear the value.
- **`name` / `kind`:** cannot be cleared; `null` or empty returns 400.
- **`status: null`:** sets `'confirmed'`, the default.
- **`tags: null`:** sets `[]`.
- **`lat` / `lng`:** must be sent together; sending only one returns 400. Both `null` clears
  the pin.
- **An empty patch** (no known keys, no `arrive`) is a no-op that returns the current place. It
  is not a 400; `arrive`-only patches already work like this.

**Location resolution (route)**
1. `existing = await readPlaceFields(userId, placeId)`. This is a new service function. It checks
   write access and returns the current `PlaceFields`.
2. `relocate = link !== null || (addressChanged && !coordsSent)`, where:
   - `coordsSent` means `lat`/`lng` are in the body.
   - `addressChanged` means `'address' in patch && patch.address !== existing.address`.
3. When `relocate` is true:
   - Call `applyPlaceLink` with the merged fields.
     - `lat`/`lng` come from the patch if `coordsSent`, else `null`, so the link or geocode can
       run.
     - `placeIdExternal` comes from the patch if sent, else `null`. The old id belongs to the
       old location.
   - **If it resolves** (coords not null): `patch.lat`, `lng` and `placeIdExternal` come from the
     result. `patch.address` comes from the result only when it was filled and the merged
     address was null.
   - **If it fails:** keep the stored pin and `placeIdExternal`, and return the link warning
     (`url_unresolved`, `place_unresolved` or `lookup_skipped`). This matches hotel PATCH: "a
     failed re-resolve keeps the pin".
4. When `relocate` is false, run no lookup, so the stored pin stays. Coords that were sent are
   written as-is.
5. Compute `transitAsPlaceWarning` on the merged view (`{...existing, ...patch}`) with `link`.

**Service**
- `patchPlace(userId, placeId, patch: Partial<PlaceFields>, arrive)`:
  - Inside the tx it re-reads the row and merges `{...fresh, ...patch}`.
  - It then calls `updatePlace` with the full merged fields.
  - Any field edited concurrently while the route was doing network resolution survives, unless
    it is in the patch.
- `placeFieldsFromRow(row)` maps a `places` row to `PlaceFields`. `readPlaceFields` and
  `patchPlace` share it.

**Input parsing (`place-input.ts`)**
- Split the per-field parsing into a `FIELD_PARSERS` table.
  - `parsePlaceFields` (POST, import) keeps its exact current behaviour, built from the table.
  - `parsePlacePatch(body)` applies the table only to keys present in the body (`key in body`).
- The field set stays the same as `PlaceFields`.
- Body keys such as `googleMapsUrl` and `arrive` are read separately, as today.

## Docs (breaking change, recorded)

- **SKILL.md §4** endpoint table, `PATCH /places/:placeId` row: "merge-patch: absent = unchanged,
  `null` = clear".
- **SKILL.md §7:** rewrite the "PATCH replaces every field" paragraphs.
  - Pin rules: no location input keeps the pin; a link, or a changed `address` without `lat`/`lng`,
    re-resolves; a failed re-resolve keeps the pin; `lat`/`lng: null` clears it.
  - Add a "Changed 2026-11" note.
- **SKILL.md §2 / §4:** add `items` to the import `notes[]` description.
- **API.md:** same two changes.

## Tests

**Unit**
- `note-service` / `import-sections`:
  - `items` parse, the cap of 201 items, a `doc` with items, a bad `text`, a bad `done`.
- `place-input`:
  - `parsePlacePatch`: absent vs null vs value; `name`/`kind` null gives 400; lat without lng
    gives 400; `tags`/`status` null.
  - `parsePlaceFields`: unchanged; the existing tests cover it.
- Route unit test, with mocks if the route has an existing test file; otherwise integration only.
  - Cover the relocate decision matrix:
    - no location input means no lookup and the pin is kept;
    - an address change re-geocodes;
    - an address change plus coords means no lookup;
    - a failed re-geocode keeps the pin;
    - a link resolves.

**Integration** (DB, `tp-test-pg`)
- import with `notes[].items`: rows are written with the right idx and done values, and a bad
  item rolls back the whole import.
- `listNotes` returns only that trip's items.
- `patchPlace` with a partial patch keeps the other fields, including `lat`/`lng`,
  `placeIdExternal` and `note`. `null` clears.

No e2e (batch rule).

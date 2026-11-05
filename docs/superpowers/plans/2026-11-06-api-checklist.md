# [API-CHK]: checklist items over /api/v1, with one canonical behaviour

## Current state
- **API:** has `POST /notes/:noteId/items` (add), `PATCH /items/:itemId` (text/done) and `DELETE /items/:itemId` (remove). These call `note-service` (`addChecklistItem`, `updateChecklistItem`, `removeChecklistItem`), which writes an audit row. Remove also re-indexes the survivors.
- **No reorder** exists in the API.
- **Web** (`app/actions/notes.ts`) has its own inline versions:
  - **add:** writes no audit row;
  - **remove:** writes no audit row and **does not re-index**, so gaps appear in `idx`;
  - **reorder:** parks all items at +1e6 and then sets idx by item id **without checking the item belongs to the note**. A crafted `itemIds` can rewrite the idx of an item in any other note or trip (an IDOR). Items left out of the list stay parked at ≥ 1e6.

## Canonical behaviour
The service versions are canonical: audit rows, contiguous idx, and authorisation through `requireTripAccess(write)`.

## Change
1. **New `reorderChecklistItems(userId, noteId, order, txDb = dbNode)`** in `note-service`:
   - It runs in one transaction and checks write access.
   - `order` must be **exactly** the note's item ids: the same set with no duplicates. Otherwise it returns 400 `"order" must list every item of the note exactly once`.
   - Two-phase write: park at `-(idx+1)`, then set `0..n-1`.
   - Calls `touchTrip`, writes an audit row (`reorder`), and returns the items in their new order.
2. **New API route `PUT /notes/:noteId/items/order`** with body `{ order: [itemId…] }`, returning `{ items }`.
3. **Web actions now call the services:**
   - `addChecklistItemAction` → `addChecklistItem`. An empty text is still a silent no-op, as today.
   - `removeChecklistItemAction` → `removeChecklistItem`.
   - `reorderChecklistItemsAction` → `reorderChecklistItems`. **This fixes the IDOR.**
   - Toggle stays as it is. It already scopes by item → note → trip.
4. **Docs:** SKILL.md §4 and API.md.

## Tests
Integration tests on tp-test-pg:
- reorder applies the new order and contiguous idx;
- a partial or foreign id list is rejected with 400, and nothing changes;
- a viewer is forbidden;
- remove leaves contiguous idx (existing behaviour);
- the web reorder path is the same service, so these tests cover it.

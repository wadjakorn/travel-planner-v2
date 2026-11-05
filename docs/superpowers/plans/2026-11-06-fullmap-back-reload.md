# TP-0153: phone full map → pick a stop → Back → reload reopens the map

## Root cause (traced in code)

`components/map-preview-context.tsx`:

1. Opening the map tags the current entry `LIST_KEY` and pushes a same-URL entry tagged
   `FULLMAP_KEY`.
2. Tapping a pin calls `selectStop(…, 'replace')` (`persistent-map.tsx:100`). This changes the map
   entry's URL (`?day=&placeId=`).
3. Back restores the list entry, whose URL is older. **Next renders the restored URL before our
   `popstate` listener runs.** The file comment already notes this at the tracking effect.
4. The tracking effect `useEffect([pathname, searchParams])` fires on that render:
   - `fullRef` and `owns` are still true, because our `onPop` has not closed yet.
   - It correctly skips `lastMapHref` for a `LIST_KEY` entry.
   - It then calls **`retag()`, which has no such guard**, so it writes
     `{ ...listState, FULLMAP_KEY: 1 }` onto the **list** entry.
5. `onPop` then closes the map. It reads `e.state`, the untagged snapshot, so the map closes
   correctly, but the list entry is now tagged.
6. On reload, `map-panel-toggle.tsx:40` sees `isFullMapEntry(history.state)` and calls
   `openFullMap()`.

The bug only shows up when the URL changed inside the map, because otherwise `searchParams` does
not change on Back and the effect does not run. This matches the report: "เลือกจุด → Back".

## Fix

- Add a pure helper in `lib/full-map-history.ts`:
  `shouldRetag({ full, owns, phone, state }) = full && owns && phone && !isFullMapEntry(state) && !isMapListEntry(state)`.
  `retag()` uses it, so the list entry is never tagged.
- **Belt and braces:** when `onPop` closes the map, if `window.history.state` still carries
  `FULLMAP_KEY`, strip it with `replaceState({...state, [FULLMAP_KEY]: undefined}, '')`.
  - This means "closed by Back" can never leave a tagged landing entry.
  - It does not touch a real map entry (`close` is false there).

## Tests

- **Unit:** `full-map-history.test.ts` gets `shouldRetag`:
  - a list entry gives false;
  - an untagged map entry gives true;
  - an already-tagged entry gives false;
  - not owning, or not on a phone, gives false.
- **e2e:** deferred to the end of the batch. The existing TP-0152 phone test can then assert
  "after reload, the map is closed". The test update is part of this PR, but it will not run until
  the end of the batch.

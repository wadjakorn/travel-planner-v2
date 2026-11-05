# TP-0114: a search/POI preview survives a day change

## Finding

`components/persistent-map.tsx` already clears the map preview in these cases:
- when the selected stop changes (the `activePlaceId` effect);
- through explicit `clearPreview()` calls in the map day bar (`map-day-bar.tsx:39`) and on ghost-pin clicks.

Two ways of changing `?day=` never clear it:
- browser Back;
- the list's day chips, together with the phone carousel's day switch.

As a result, the preview card for day 3 can stay open on top of day 1.

## Change

Add one effect beside the `activePlaceId` one. When `dayIdx` changes, call `clearPreview()`. This covers every route to a day change, including the ones that already clear explicitly; a second clear is a no-op.

## Checks

- **No preview flow changes the day itself:**
  - The search picker's `showOnMap` calls `setPreview` and then `openFullMap`, with no navigation.
  - The POI preview (`use-poi-preview.ts`) does not navigate either.
  - So the effect cannot close a preview while it is opening.
- **`shownForDay`:** this logic keeps the canvas mounted "until the day changes". Clearing on a day change matches that intent.

## Tests

- typecheck and lint.
- In the end-of-batch e2e, the existing TP-0077 POI day-switch test covers the day-bar path.

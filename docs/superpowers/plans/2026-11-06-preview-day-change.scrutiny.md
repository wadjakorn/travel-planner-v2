# Scrutiny: TP-0114

**Intent:** a preview never outlives the day it was opened on.

**Simpler alternative:** add `clearPreview` to each day-changing control: the chips, Back via popstate, and the carousel.
- That means more call sites, and Back would need its own listener.
- One effect on `dayIdx` is the smaller fix.

**Trace:**
- **Where `dayIdx` comes from:** it is derived from `useSearchParams` (`persistent-map.tsx:63`). Every way of changing the day updates it: `selectStop` replace or push, `router.push`, `<Link>`, and Back.
- **What `clearPreview` does:** it bumps `latest`. A preview still resolving through `begin`/`isCurrent` is therefore dropped as well.
  - Without this, an async POI lookup started on day 3 that finishes after a switch to day 1 would still show.
  - This is correct.
- **Risk:** phone `followDayOnScreen` (`map-panel-toggle.tsx:28`) changes the day just before `openFullMap` when you press the map toggle.
  - If a preview were open at that moment, it would be cleared.
  - That is only reachable with no preview open, because the search picker opens the map itself without `followDayOnScreen`, so the risk is acceptable.

**Verdict:** ship.

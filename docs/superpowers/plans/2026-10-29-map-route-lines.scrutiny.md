# Scrutiny: map route lines

Plan: [2026-10-29-map-route-lines.md](2026-10-29-map-route-lines.md) · Reviewed against HEAD `6f6f7a2` (main).

## Intent

Show visit order on the map: straight lines between consecutive stops, colored by leg mode, with direction arrows, at no API cost. Along the way, fix how the list and the map derive legs and numbers.

### Simpler alternatives considered

- **One polyline per day instead of per leg.** This gives fewer objects, but then lines can't be colored by mode or skipped at gaps. Per leg is right; a day has fewer than 20 legs, so object count doesn't matter.
- **Ship the data fix alone first.** Task 1 fixes two live bugs (below) and is independently valuable and low-risk. **Recommended:** land it as its own PR if Tasks 2–5 slip. Noted in the plan.
- **Drop the mid-leg labels.** See finding 1. This removes a component and two marker sets for a feature real trips can't show.

## Claimed bugs: both confirmed

1. **Leg modes are looked up by array position, not `segment.idx`.** `page.tsx:244` does `d.segments[i - padBegin]`; `segments` is sorted by `idx` (`trip-queries.ts:204`) but is sparse.
   - **Real path:** import inserts places with no segment rows (`import-service.ts:86`). Appending a place then creates only the last leg's row (`ensureSegmentForAppendedPlace(nextIdx - 1)`, `place-service.ts:58-77`, ~L108). So a 4-stop imported day gets `segments = [{ idx: 2 }]`, and the list draws leg 2's mode on leg 0.
   - **Worse:** the list passes `idx={segment.idx ?? segmentIdx}` (`sortable-place-item.tsx:224`), so changing the picker shown on leg 0 updates leg 2's row.
   - **The plan's `dayLegs`**, which matches by `s.idx === i - b`, fixes both the list and the map.
2. **Pin numbers drift from list numbers.** `buildMapDays` numbers pins over `withCoords` (`day-augment.ts:167-170`), while the list uses `displayIdx = i + 1` over every display place, including stops with no coordinates (`sortable-place-list.tsx:201,236` → `place-row.tsx:81`). This violates REQUIREMENTS §10 ("numbered to match itinerary order"). The plan's display-position `idx` fixes it. No consumer assumes contiguous `idx`: `map-carousel.ts` doesn't read it, and `map-stop-carousel.tsx` and `map-preview.ts:162` only print it.

## Verified (no change needed)

- **`Polyline`** is exported by `@vis.gl/react-google-maps` 1.8.3 (`dist/index.d.ts:1845`). `PolylineProps = Omit<google.maps.PolylineOptions,'map'|'path'> & …` (`:1096`), so `icons`, `geodesic`, `zIndex`, `strokeOpacity` and `clickable={false}` all pass through. Options are deep-compared and applied with `setOptions` (`index.modern.mjs:2097, 2163-2167`). The path syncs, the polyline unmounts with `setMap(null)`, and `useMap()` with no id resolves to the enclosing `<Map id="trip-map">`.
- **`line-dasharray`** is `cross-faded-data-driven` (zoom + feature) in `@maplibre/maplibre-gl-style-spec` 26.4.4, the version maplibre-gl 6.14 depends on. The `match` expression is valid.
- **`MapRef.addImage`** is proxied; it is not in react-map-gl's `skipMethods` (`dist/maplibre.cjs:718-738`).
- **`metersBetween`** (`map-preview.ts:151`), `Segment` (`schema.ts:380`) and `departureMode`/`arrivalMode` (`schema.ts:316-317`) all exist. `dayLegs` mirrors today's hotel fallback (`h.departureMode ?? d.defaultMode ?? 'drive'`) exactly. I traced the test fixtures: dayIso 2026-07-13 is both a begin and an end night for 07-12 → 07-14, so the expected values are right.
- **Persistent map:** the `legs` prop rides the existing `day` object (`persistent-map.tsx:136-148`), so a day switch remounts nothing.
- **TP-0077 POI taps keep working.** Polylines are `clickable={false}`, there are no `interactiveLayerIds`, and the labels use `pointer-events: none`. The Google `Map onClick` placeId path is untouched.

## Findings

### 1. Major: mid-leg labels have no data on real trips (Decision 2)

- **Finding:** the label shows the stored `segment.time`, but nothing writes a non-empty value since Routes was removed.
- **Why it matters:** `RouteLegLabel`, a Google `AdvancedMarker` per leg and a MapLibre `Marker` per leg would ship for a feature that only shows on seed and demo trips. The Task 5 browser check on the test trip would pass and hide this.
- **Evidence:** every insert writes `time: ''` (`segment-service.ts:29`, `place-service.ts:71-77`), and the only update sets `mode` (`segment-service.ts:25-26`). Times exist only in `lib/seed/days.ts`.
- **Change:** recommend dropping the labels from this PR, keeping lines and arrows, and revisiting with an estimate. **Left for the user** (it cuts §3.1 scope). The plan's Decision 2 now carries this evidence, and each label step is tagged *(Decision 2)* so it can be cut cleanly.

### 2. Major: overlap with itinerary-rows on `buildMapDays` (cross-plan)

- **Finding:** the orchestrator notes say both plans change the `buildMapDays` signature. **Refuted for this plan:** it keeps `(trip, hotels, units)` and changes only the body and the `MapDay` type. itinerary-rows adds `lang` (4th parameter, formats `pin.time`) and adds `hours` to `page.tsx`'s place type.
- **Resolution:** itinerary-rows owns the signature and the `time` formatting. Route-lines owns `Pin.idx`, `MapDay.legs` and the leg loop (`dayLegs`). Both touch the same function bodies (`day-augment.ts:165-188`, `page.tsx:174-248`), but there is no logic conflict. **Order (agreed with the itinerary-rows scrutiny): route-lines first.** Rows then appends a defaulted `lang` parameter. `dayLegs` takes `places: unknown[]`, so the wider rows type passes. **Applied** (header note in the plan).

### 3. Minor: an unexpected network request on Google

- **Finding:** vis.gl `Polyline` always calls `useMapsLibrary('geometry')` (`index.modern.mjs:2093`), even without `encodedPath`.
- **Why it matters:** Task 5 Step 8 audits the network. The executor will see a new `maps.googleapis.com` script fetch and might flag it as a cost regression. It is free (no SKU, not a map load), and there is no CSP to block it (no `Content-Security-Policy` in `next.config`/proxy).
- **Change:** Step 8 now names it as expected. **Applied.**

### 4. Nit: Google `zIndex` mixing

Labels use `zIndex 5`, pins use 10/100 (pin plan), and the preview uses 1000, so every marker sets one. Day-bar ghosts must also set one; this is recorded in the pin-redesign scrutiny. No change here.

### 5. Nit: the casing under dashed legs

A solid 7px white casing under a dashed line reads as a white ribbon with colored dashes, not a gapped dash. That is acceptable and legible on busy basemaps; just confirm it looks intended in the Task 5 screenshot. No change.

## Cross-plan

- **Order:** pin-redesign Task 1 → route-lines (as already declared). Landing pin-redesign first in full is preferred; see its scrutiny.
- **itinerary-rows:** ownership as in finding 2. Its I5 "No location · Fix" chip pairs with this plan's gap (no line, numbers 1 and 3).
- **ds-hex-codemod:** uses `--map-route-*` "only if absent". It should also not redefine `--map-route-none` or `--map-route-casing`.

## Verdict

**Fix-then-ship.** Both claimed bugs are real and Task 1 fixes them correctly, and the renderer APIs exist at the installed versions. The one open item is a product call: the mid-leg labels have no data for real users. Recommend cutting them.

## Cross-plan (appended by the ds-foundations scrutiny, 2026-10-29)
- `RouteLegLabel` is specced at **11px** (`map-route-lines.md:214`). ds-foundations adds a 12px text-floor guard (`design-foundations.test.ts`, scans `font-size`, `text-[Npx]` and `fontSize:` in `app/src`), so this fails once foundations has landed. Use 12px.
- `ROUTE_NONE_COLOR`/`ROUTE_CASING_COLOR` mirrors in `lib/map-helpers.ts` carry `// hex-ok: mirrors --map-route-… (parity-tested)`, so the hex-codemod ratchet (now exact) isn't touched.

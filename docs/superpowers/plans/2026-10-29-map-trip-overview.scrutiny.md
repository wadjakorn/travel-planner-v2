# Scrutiny: map "Whole trip" overview

Plan: [2026-10-29-map-trip-overview.md](2026-10-29-map-trip-overview.md)

## Intent

Add one desktop map view that shows the whole trip (all days, colored per day, clustered when zoomed out, with dashed lines between cities) to answer "where does this trip go?".

### Simpler alternatives considered (and the deferral question)

- **Do nothing for now.** This is the strongest option. The review rates M10 🟢 ("ตอนนี้"), gives MAP-13 impact **กลาง** / effort **M**, and its own roadmap schedules it in **Phase 3, after the bottom sheet** (`p3b, after p2a`, review §12). After the day-bar plan ships, every day view already shows the other days' stops as clickable ghost dots, which answers most of "which city is which day" for free. Real trips in the app (the test trip is 5 days around Fuji and Kamakura) rarely have pins dense enough at trip zoom for clustering to matter.
- **A 90% version without clustering.** A "Whole trip" chip that fits all days' pins colored per day: no new dependency, about 2 tasks. Rejected as a long-term shape. Without clustering, a multi-city trip at trip zoom turns each city into an unreadable pile, and clustering is the main reason spec §3.3 / M10 exists.
- **Connectors.** These are the most cosmetic part, and the 15 km centroid heuristic is fragile: a day spent in two cities gets a centre between them. They could be cut from v1 to save about ⅓ of Task 3 with no loss to the core question.
- **Recommendation: defer** (product call, **left for the user**). Keep this plan, now fixed, ready. Pick it up after usability test round 1 if testers ask "where does the trip go", or if real trips show 30+ stops per city. If it is built, consider dropping the connectors from v1. The recommendation is now stated at the top of the plan.

## Trace highlights (verified at HEAD `6f6f7a2`)

- **`?view=trip` vs URL parsing.** `PersistentMap` reads `day` and `placeId` only (`persistent-map.tsx:48-58`). The page server reads `day` and `placeId` only (`app/trip/[id]/page.tsx:39,64-80`) and ignores `view`. Every list and map navigation builds a fresh query (`stopActivateHref`, `sortable-place-list.tsx:88-96`, `day-header.tsx:57`), so any row, pin or day click drops `view` and leaves overview. That is coherent. `overviewHref` keeps `day`, so the list column doesn't move.
- **Camera on enter and leave.** Entering with a stop selected: `activePin` X → null with `pinsSig` changed. `mapFocus(null, null, true, false, true)` falls through to `fit` (`lib/map-preview.ts:86-98`), and `ActiveFocusGoogle` fits `pins` = the overview points (`map-active-focus-google.tsx:88-104`). This holds. Leaving via a day chip changes `pinsSig`, so the day fit holds too. Leaving via a list row → `active` → `panTo` at trip zoom, which is a rough edge. It is now a manual check in Task 5.
- **Viewport bias.** `viewportBiasFor` is day-scoped (`lib/maps/viewport-store.ts:39-43`), and tagging `dayIdRef` null in overview clears it. This holds.
- **supercluster + vis.gl `reuseMaps`.** Clusters and points stay declarative `<AdvancedMarker>`s, so vis.gl attaches and detaches them per mount. That works with the cached map. The only `reuseMaps` hazard is raw listeners on the cached instance (`map-active-focus-google.tsx:112-113`), and the plan already removes its `idle` listener on unmount. Rejecting `@googlemaps/markerclusterer` is right: it owns imperative markers.
- `supercluster@9.1.0` is current on npm and not yet installed. `metersBetween` exists (`lib/map-preview.ts:151`). The hotel-id regex matches `hotelToSyntheticPlace` ids (`lib/day-augment.ts:75`). The Task 1 test expectations trace correctly.

## Findings

### 1. Blocker: built on `PinBadge`, which pin-redesign deletes
- **Finding:** Task 3 added `color` / `icon` props to `map-pin-badge.tsx`. Pin-redesign (Phase 1, ordered first) replaces it with `MapPin`, whose `hotel` kind already renders the stay square + bed icon.
- **Change:** depend on pin-redesign. Add only `color?: string` to `MapPin` and drop the `icon` prop. **Applied** (Depends on, Touches, Task 3).

### 2. Major: the overview toggle pays a server round-trip for nothing
- **Finding:** `<Link href="…&view=trip">` re-renders `app/trip/[id]/page.tsx` on the server (auth, `loadTrip`, hotels, transport, units) and gets identical output, because `view` is client-only. The map switches only when that response lands.
- **Change:** the chip is a `<button aria-pressed>` that calls `window.history.pushState` (Next's native History API integration updates `useSearchParams` with no request; Back and Forward work). Task 5 adds a network check for that. **Applied.**

### 3. Major: overview markers not gated on a live map
- **Finding:** the Google canvas renders markers only when `overlays = ready && !degraded` (`real-map-canvas-google.tsx:64-68`), because markers attached to an auth-failed map throw. The overview branch didn't say so. Also, `getBounds()` can be `undefined` on mount, and the plan read it unguarded.
- **Change:** gate on `overlays`, start with `view = null`, and render after the first `idle`. **Applied** (Task 3).

### 4. Major: imperative `new maps.Polyline` instead of vis.gl's `<Polyline>`
- **Finding:** `@vis.gl/react-google-maps` 1.8.3 exports a declarative `Polyline` (checked in `dist/index.d.ts`), and the route-lines plan already uses it. Hand-rolled `setMap(null)` bookkeeping on a `reuseMaps` instance is the kind of leak the codebase comments warn about.
- **Change:** use `<Polyline>`. **Applied.**

### 5. Minor: z-index scale
- Points 10 and clusters 15 now map onto the shared `lib/map-pin.ts` scale (`CLUSTER_Z_INDEX = 15`). See the day-bar scrutiny, finding 4. **Applied.**

### 6. Minor: camera-rules changes the `ActiveFocus*` props
- If camera-rules merges first, `pinsSig` becomes `frameSig` + `fallback`. Noted in Depends on. **Applied.**

### 7. Nit: day-3 color vs stay color
- `--map-day-3 #1e40af` is nearly the stay navy (`--map-pin-stay #1e3a8a`, pin-redesign). Shape (square + bed) still separates them. Consider a different day-3 hue. **Left.**

### 8. Nit: scope gaps vs spec
- §3.3 says overview "replaces the hero card" (`TripCover`), which this plan doesn't touch. §7.5 asks for day-view clustering at 30+ stops, which isn't covered (`createClusterIndex` could be reused later). A stay point shows its first night's stop number, which means little in overview; consider no label for stays. **Left.**

## Cross-plan resolutions
- **Order:** pin-redesign → day-bar → (this). Camera-rules is compatible either way.
- **Shared z-scale and `MapPin` props** are owned by pin-redesign. This plan adds `color` and `CLUSTER_Z_INDEX`, and day-bar adds `label` and `GHOST_Z_INDEX`.

**Verdict: fix-then-ship, but recommend deferring.** The technical blockers and majors are applied. Value against size points to Phase 3, after the usability test.

## Cross-plan (from the map-pin-redesign scrutiny, 2026-10-29)
- Pin-redesign's "Downstream plans" table now matches this plan: only `color?: string` on `MapPin` (via `--pin-color`), with no `icon` prop.

## Cross-plan (appended by the camera-rules scrutiny)
- Confirmed: after camera-rules, pass `frameSig(overview.points, [])` and `fallback={[]}`, and fold `overview` into the new `canRenderMap` expression. With a search preview open in overview, `mapFocus` may return `preview-fit` over all trip points plus the preview. That is acceptable. A tapped POI (`ownerId 'poi'`) is now only revealed (`preview-reveal`), with no refit.

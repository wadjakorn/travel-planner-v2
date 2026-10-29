# Map "Whole Trip" Overview Implementation Plan

> **Ticket:** TP-0110

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D7 — DEFERRED.** Do not implement until after usability test round 1; keep this plan as reference.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Whole trip" chip to the desktop day bar that shows every day's stops on one map, colored per day, clustered below zoom 12, with dashed connector lines between the trip's cities. It answers "where does this trip go?".

**Architecture:** Overview mode is a URL flag (`?view=trip`, `day` kept so the list column stays put) read by `PersistentMap`. Pure helpers turn the existing `MapDay[]` into overview points and inter-day connector segments. One `supercluster` index drives clustering for **both** renderers, so clusters and points stay React markers like today's pins. Each renderer gets a small overview layer component (like `map-active-focus-*`), and the canvas swaps day pins for it when the `overview` prop is set. The existing `ActiveFocus*` frames the whole trip by receiving the overview points as its pin set.

**Tech Stack:** Next.js 16, React 19, `supercluster` 9.1.0 (new dep, ships its own types), `@vis.gl/react-google-maps` 1.8.3 (`AdvancedMarker`, declarative `Polyline`), `react-map-gl/maplibre` (`Marker`, `Source`, `Layer`), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §3.3 (ปุ่ม "ทั้งทริป" บนแถบวัน → ทุกวัน, สีต่อวัน, clustering, เส้นเชื่อมระหว่างเมือง), §2.2 M10 (no clustering although REQUIREMENTS §10 lists it), §7.5 ("cluster เมื่อ zoom < 12"), §11 Q4 (per-kind colors in day view, per-day in trip view), roadmap MAP-13. REQUIREMENTS §10 "Pin clustering at zoom-out."

**Touches:** `persistent-map.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `map-renderer-props.ts`, `map-pin.tsx` + `lib/map-pin.ts` (pin-redesign's; `color` override, `CLUSTER_Z_INDEX`), `map-day-bar.tsx`, `lib/map-carousel.ts`, `globals.css` (tokens), `package.json` / `pnpm-lock.yaml`.

**Depends on:** `2026-10-29-map-pin-redesign.md` (`MapPin`, `pinZIndex`, the stay square + bed icon; `map-pin-badge.tsx` is deleted there) and `2026-10-29-map-day-bar-ghost-pins.md` (`MapDayBar`, `MapPin` `label`, ghosts props, `dayChip`/`dayTitle`), both merged first. If `map-camera-rules` has merged, `ActiveFocus*` takes `frameSig`/`fallback` instead of `pinsSig`: pass `frameSig(overview.points, [])` and `fallback={[]}`. Scrutiny: `2026-10-29-map-trip-overview.scrutiny.md`.

**Scheduling recommendation (scrutiny): defer.** The review itself rates M10 🟢, puts MAP-13 at impact กลาง / effort M, and schedules it in Phase 3 after the bottom sheet (`p3b, after p2a`). Day-bar ghost pins already answer most of "which city is which day" on every day view at zero extra cost. Build this after usability test round 1 if testers still ask "where does this trip go", or when real trips show 30+ stops per city. The plan below is fixed and ready for then.

## Decision needed

1. **Clustering library.** Default: **`supercluster` directly, shared by both renderers.** The alternatives were measured with esbuild min+gzip on 2026-10-29:

   | Option | Bundle | Fit |
   |---|---|---|
   | `supercluster@9.1.0` | **4.1 KB gz** | Pure and node-testable. Clusters render as React markers in both renderers, with one code path. |
   | `@googlemaps/markerclusterer@2.6.2` (not installed) | 8.4 KB gz, bundles supercluster 8 | Google only. It owns and creates its own `AdvancedMarkerElement`s imperatively, which fights the React-managed `<AdvancedMarker>`s and the `reuseMaps` cached instance. MapLibre would still need a second implementation. |
   | MapLibre GeoJSON `cluster: true` source | 0 KB | MapLibre only. Clusters become GL circle layers while our pins are DOM `Marker`s. Mixing the two needs `querySourceFeatures` per move, and it gives Google nothing. |

2. **Colors in overview: per day, not per kind** (§11 Q4 proposal). Default: yes. Stays (hotels) keep the stay color with `MapPin`'s stay square + bed icon (from pin-redesign), one pin per booking, because they span days.
3. **Clicking an overview point.** Default: **go to that day, framed, nothing selected** (`stopActivateHref(tripId, dayIdx, null)`), which leaves overview. Selecting the stop as well would only `panTo` it at overview zoom (`mapFocus` → `active`), with the rest of the day off-screen.
4. **Mobile.** Default: **not in this plan.** Overview is md+ only, and `?view=trip` is ignored below md, where the carousel's day strip would contradict an all-days map. A mobile entry point belongs with the bottom-sheet work (§12 ขั้น B).

## Global Constraints

- md+ only (`useIsWide()`); below md, `view=trip` is ignored.
- No new API calls and no billed loads. Connectors are drawn client-side (no Routes/Directions; REQUIREMENTS §10 "No on-map route polylines" refers to routing. These are straight dashed geodesic lines between day centres, not routes).
- Cluster only below zoom 12: `CLUSTER_MAX_ZOOM = 11`, `CLUSTER_RADIUS_PX = 60`. Zoom passed to supercluster is `Math.floor(zoom)`.
- Connectors join consecutive located days' centres only when they are ≥ `CONNECTOR_MIN_M = 15_000` m apart (inter-city, not intra-city noise). A day's centre is the centroid of its non-hotel pins, or all its pins if it has only hotels.
- Tokens: add to `:root` in `globals.css`: `--map-day-1` `#0f766e`, `--map-day-2` `#c2410c`, `--map-day-3` `#1e40af`, `--map-day-4` `#a21caf`, `--map-day-5` `#15803d`, `--map-day-6` `#be123c`, `--map-day-7` `#92400e`, `--map-day-8` `#155e75` (all ≥ 4.5:1 against white numerals, none in Google's POI hues per §7.2), and `--map-connector` `#64748b`. Day 9+ cycles (`idx % 8`). Renderers that need a concrete color string (Google `Polyline.strokeColor`, MapLibre `line-color`) read it once via `getComputedStyle(document.documentElement).getPropertyValue('--map-connector').trim()`.
- Copy (EN): chip `Whole trip`; cluster `aria-label` `{n} stops — zoom in`; point `title` `Day {d} · {idx}. {name}`; stay point `title` `{name} (stay)`.
- In overview, `onViewport` must clear the shared viewport (`clearMapViewport`): the search-bias viewport is day-scoped (`lib/maps/viewport-store.ts:41-43`), and a trip-wide bbox must not bias a day's search.

## Review Focus

1. **A hotel spanning several nights** would otherwise produce 2×(nights−1) coincident pins in overview. It must be one stay point, belonging to its first night's day. Test `overviewPoints` (Task 1).
2. **Travel day centre:** a day that wakes in the Tokyo hotel and ends in Hakone must not place its centre halfway, which would produce a phantom connector. Centres ignore hotel pins. Test `dayConnectors` (Task 1).
3. **Empty days between located days** are skipped, not treated as (0,0): days 1 and 3 connect directly. Test in Task 1.
4. **Entering or leaving overview with a stop selected or a preview open:** entering must frame all points (not pan to the old active pin), and leaving via a day chip must frame that day. `activePlaceId` is passed as `null` in overview, so `mapFocus` → `fit`. Manual check in Task 5 (both renderers).
5. **Cluster click at the edge of the cluster zoom:** expansion must land at a zoom where the cluster actually splits (≤ 12), never loop at the same zoom. Test `expansionZoom` bounds (Task 2) plus a manual check.

---

### Task 1: Pure overview helpers + tokens

**Files:**
- Create: `app/src/lib/map-overview.ts`
- Modify: `app/src/lib/map-carousel.ts` (add `overviewHref`)
- Modify: `app/src/app/globals.css` (tokens above, `:root`)
- Test: `app/src/lib/map-overview.test.ts`, `app/src/lib/map-carousel.test.ts`

**Interfaces:**
- Consumes: `MapDay` (type) from `@/lib/day-augment`; `Pin`, `KIND_COLOR` from `@/lib/map-helpers`; `metersBetween` from `@/lib/map-preview`.
- Produces:
  - `DAY_COLOR_COUNT = 8`; `dayColorVar(dayIdx: number): string` → `` `var(--map-day-${(dayIdx % 8) + 1})` ``
  - `hotelBookingIdOf(pinId: string): string | null`: matches `^hotel-(.+)-(begin|end)$` (ids from `hotelToSyntheticPlace`, `lib/day-augment.ts:63-87`)
  - `type OverviewPoint = Pin & { dayIdx: number; color: string; stay: boolean }`
  - `overviewPoints(days: MapDay[]): OverviewPoint[]`: every pin of every day. Hotel pins collapse to one per booking id, taken at its first occurrence (`dayIdx` of that day, `stay: true`, `color: KIND_COLOR.hotel`). Other pins get `color: dayColorVar(day.idx)`.
  - `CONNECTOR_MIN_M = 15_000`; `dayConnectors(days: MapDay[], minMeters = CONNECTOR_MIN_M): [LatLng, LatLng][]` (`LatLng` from `@/components/map-renderer-props` is client-side, so define `{ lat: number; lng: number }` inline)
  - `overviewHref(tripId: string, dayIdx: number): string` → `/trip/${tripId}?day=${dayIdx}&view=trip`

- [ ] **Step 1: Write the failing tests**

```ts
const p = (id: string, lat: number, lng: number, idx = 1): Pin => ({ id, idx, kind: 'sight', lat, lng, name: id });
const day = (idx: number, pins: Pin[]) => ({ id: `d${idx}`, idx, label: 'Mon', num: idx + 1, summaryDistance: null, summaryTime: null, pins });
const TOKYO = { lat: 35.68, lng: 139.76 }, HAKONE = { lat: 35.23, lng: 139.02 };

describe('overviewPoints', () => {
  it('collapses a multi-night hotel to one stay point on its first night', () => {
    const days = [
      day(0, [p('a', 35.6, 139.7), p('hotel-H1-end', 35.5, 139.5)]),
      day(1, [p('hotel-H1-begin', 35.5, 139.5), p('hotel-H1-end', 35.5, 139.5)]),
      day(2, [p('hotel-H1-begin', 35.5, 139.5)]),
    ];
    const pts = overviewPoints(days);
    const stays = pts.filter((x) => x.stay);
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ dayIdx: 0, color: KIND_COLOR.hotel });
    expect(pts.find((x) => x.id === 'a')!.color).toBe('var(--map-day-1)');
  });
  it('day colors cycle after 8', () => expect(dayColorVar(8)).toBe('var(--map-day-1)'));
});

describe('dayConnectors', () => {
  it('joins only inter-city hops, ignoring hotels in the centre', () => {
    const days = [
      day(0, [p('t1', TOKYO.lat, TOKYO.lng)]),
      day(1, [p('hotel-H-begin', TOKYO.lat, TOKYO.lng), p('h1', HAKONE.lat, HAKONE.lng)]),
      day(2, [p('h2', HAKONE.lat + 0.01, HAKONE.lng)]),
    ];
    const segs = dayConnectors(days);
    expect(segs).toHaveLength(1);
    expect(segs[0][0]).toEqual(TOKYO);
    expect(segs[0][1]).toEqual(HAKONE);
  });
  it('skips empty days', () => {
    expect(dayConnectors([day(0, [p('t', TOKYO.lat, TOKYO.lng)]), day(1, []), day(2, [p('h', HAKONE.lat, HAKONE.lng)])])).toHaveLength(1);
  });
  it('hotel-only day falls back to its hotel', () => {
    expect(dayConnectors([day(0, [p('t', TOKYO.lat, TOKYO.lng)]), day(1, [p('hotel-X-end', HAKONE.lat, HAKONE.lng)])])).toHaveLength(1);
  });
});

it('overviewHref', () => expect(overviewHref('t1', 2)).toBe('/trip/t1?day=2&view=trip'));
it('hotelBookingIdOf', () => {
  expect(hotelBookingIdOf('hotel-abc-1-begin')).toBe('abc-1');
  expect(hotelBookingIdOf('3f2a…uuid')).toBeNull();
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-overview.test.ts src/lib/map-carousel.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Add the tokens.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(map): trip-overview points, day colors and city connectors [TP-0110]`

### Task 2: Cluster index (`supercluster`)

**Files:**
- Modify: `app/package.json` (`pnpm add supercluster@^9.1.0`; it ships `index.d.ts`, so no `@types/*` is needed)
- Create: `app/src/lib/map-cluster.ts`
- Test: `app/src/lib/map-cluster.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CLUSTER_MAX_ZOOM = 11;     // clusters only below zoom 12 (review §7.5)
  export const CLUSTER_RADIUS_PX = 60;
  export type ClusterItem<T> =
    | { type: 'cluster'; id: number; lat: number; lng: number; count: number }
    | { type: 'point'; point: T };
  export type ClusterView = { west: number; south: number; east: number; north: number; zoom: number };
  export function createClusterIndex<T extends { lat: number; lng: number }>(points: T[]): {
    at(view: ClusterView): ClusterItem<T>[];          // floors zoom
    expansionZoom(clusterId: number): number;          // min(getClusterExpansionZoom, CLUSTER_MAX_ZOOM + 1)
  };
  ```

- [ ] **Step 1: Failing tests**
  - 3 points within 500 m of Shibuya (35.658,139.70) plus 1 at Hakone. `at({ west: 138, south: 34, east: 141, north: 37, zoom: 8 })` → 2 items, one `cluster` with `count: 3` and one `point`.
  - Same points at `zoom: 12` → 4 items, all `point` (and `zoom: 12.7` likewise).
  - `expansionZoom(cluster.id)` is `> 8` and `<= 12`.
  - `createClusterIndex([]).at(view)` → `[]`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (`new Supercluster({ maxZoom: CLUSTER_MAX_ZOOM, radius: CLUSTER_RADIUS_PX })`, GeoJSON features with `properties: { i }` indexing back into `points`). **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(map): supercluster-backed cluster index [TP-0110]`

### Task 3: Overview layers in both renderers

**Files:**
- Create: `app/src/components/map-overview-google.tsx` (`OverviewLayerGoogle`, imported only by the Google canvas)
- Create: `app/src/components/map-overview-maplibre.tsx` (`OverviewLayerMaplibre`, imported only by the MapLibre canvas)
- Create: `app/src/components/map-cluster-bubble.tsx` (`ClusterBubble`, shared DOM)
- Modify: `app/src/components/map-pin.tsx` (optional `color?: string` overrides the kind color, i.e. sets `--pin-color` inline. No `icon` prop is needed: a `hotel`-kind pin is already the stay square with the bed icon)
- Modify: `app/src/lib/map-pin.ts` (`CLUSTER_Z_INDEX = 15`, on the shared scale: ghost 1, pin 10, cluster 15, hover 50, active 100, preview 1000)
- Modify: `app/src/components/map-renderer-props.ts`
- Modify: `app/src/components/real-map-canvas-google.tsx`, `app/src/components/real-map-canvas-maplibre.tsx`

**Interfaces:**
- Consumes: Task 1 `OverviewPoint`; Task 2 `createClusterIndex`, `ClusterView`; `MapPin`, `pinTitle`, `pinZIndex`, `pinAnchor` (pin-redesign); `Polyline` from `@vis.gl/react-google-maps` (exported by 1.8.3).
- Produces:
  - `RealMapCanvasProps.overview?: { points: OverviewPoint[]; connectors: [{ lat: number; lng: number }, { lat: number; lng: number }][] } | null`
  - `RealMapCanvasProps.onOverviewPick?: (p: OverviewPoint) => void`
  - `ClusterBubble({ count }: { count: number })`: a circle `min-width 32px`, `height 32px`, `background: var(--foreground)`, `color: var(--background)`, 13px/700, white 2px border, `aria-label` `{count} stops — zoom in`.
  - `OverviewLayerGoogle` / `OverviewLayerMaplibre` take `{ overview, onPick }`, the canvas's `overview` and `onOverviewPick`.

Decided behavior:
- Canvas: when `overview` is set, render **only** the overview layer plus the preview marker/popup. No day groups, no ghosts, no pin card. `ActiveFocus*` gets `pins={overview.points}`, `pinsSig` from their ids, and `activePin={null}`, which frames the whole trip with the existing fit path.
- Google canvas: the overview layer renders only when `overlays` (`ready && !degraded`, `real-map-canvas-google.tsx:67-68`), like the pins. Markers attached to a dead (auth-failed) map throw.
- Layer: `const index = useMemo(() => createClusterIndex(overview.points), [overview.points])`. The `view: ClusterView | null` state is set once on mount from the live map, and then on every Google `idle` (`map.addListener('idle', …)`, removed on unmount; required because vis.gl skips `clearInstanceListeners` under `reuseMaps`, see `map-active-focus-google.tsx:112-113`) or MapLibre `moveend` (`map.on/off`). On mount Google's `getBounds()` can be `undefined` (map not idle yet). Then leave `view` null and render nothing until the first `idle`. Entering overview always refits, so an `idle` follows at once. Render `index.at(view)`:
  - `cluster` → marker with `<ClusterBubble>`; click → zoom to `expansionZoom(id)` centred on the cluster (Google `map.moveCamera({ center, zoom })`; MapLibre `easeTo`, or `jumpTo` under `prefers-reduced-motion`).
  - `point` → `<MapPin pin={p} color={p.stay ? undefined : p.color} />` (Google: marker `title` per the Copy constraint; MapLibre: `interactive`, with `aria-label` = the same title); click → `onPick(p)`.
  - z-order on the shared scale: points `pinZIndex(false)`, clusters `CLUSTER_Z_INDEX`, always explicit.
- Connectors:
  - Google: one declarative vis.gl `<Polyline key={`${i}`} path={[a, b]} geodesic clickable={false} strokeOpacity={0} icons={DASH_ICONS} />` per segment (`DASH_ICONS` memoized: `[{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor, scale: 3 }, offset: '0', repeat: '12px' }]`), the same component the route-lines plan uses. vis.gl attaches and detaches the polyline with the React lifecycle, so there is no hand-rolled `setMap(null)` bookkeeping on a cached `reuseMaps` instance.
  - MapLibre: `<Source id="trip-connectors" type="geojson" data={FeatureCollection<LineString>}>` + `<Layer id="trip-connectors" type="line" paint={{ 'line-color': connectorColor, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 }} />`. These are straight lines; MapLibre has no geodesic option, and at inter-city scale the difference is negligible.

- [ ] **Step 1:** `MapPin` `color` prop (+ test: the color reaches `--pin-color`) and `CLUSTER_Z_INDEX`; `ClusterBubble`.
- [ ] **Step 2:** `OverviewLayerGoogle` and `OverviewLayerMaplibre` per the behavior above; the canvas `overview` branch and props.
- [ ] **Step 3:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 4: Commit** `feat(map): whole-trip layer with per-day colors, clusters and connectors [TP-0110]`

### Task 4: "Whole trip" chip + `PersistentMap` wiring

**Files:**
- Modify: `app/src/components/map-day-bar.tsx`
- Modify: `app/src/components/persistent-map.tsx`

**Interfaces:**
- Consumes: Task 1 `overviewPoints`, `dayConnectors`, `overviewHref`, `dayColorVar`; Task 3 canvas props.
- Produces: `MapDayBar` gains `overview: boolean` and `canOverview: boolean` props.

Decided behavior:
- `PersistentMap`:
  - `const overviewData = useMemo(() => ({ points: overviewPoints(mapDays), connectors: dayConnectors(mapDays) }), [mapDays])`
  - `const overview = searchParams.get('view') === 'trip' && isWide && overviewData.points.length > 0`
  - `canOverview = mapDays.filter((d) => d.pins.length > 0).length >= 2`
  - `canRenderMap` also true when `overview`.
  - Pass `overview={overview ? overviewData : null}`, `activePlaceId={overview ? null : shownPlaceId}`, `ghosts={overview ? [] : ghosts}`.
  - `onOverviewPick = (p) => { clearPreview(); router.push(stopActivateHref(tripId, p.dayIdx, null), { scroll: false }); }`
  - The viewport tag `dayIdRef.current = overview ? null : day?.id ?? null` (the existing `useLayoutEffect` at `:110-112` adds `overview` to its deps), so `onViewport` clears the shared viewport in overview.
- `MapDayBar`:
  - When `canOverview`, a first chip `Whole trip` is a `<button type="button" aria-pressed={overview}>`. On click (when not already in overview): `clearPreview(); window.history.pushState(null, '', overviewHref(tripId, dayIdx));`. **Not** a `<Link>`: `view` is read only on the client (`PersistentMap`), but a `<Link>`/`router.push` to `?…&view=trip` re-runs the itinerary page on the server (`app/trip/[id]/page.tsx`: auth + `loadTrip` + hotels + transport + units) for byte-identical output, and the map waits for that round-trip. Next's native `history.pushState` integration updates `useSearchParams` with no request, and Back still works.
  - In overview, ‹ › are not rendered, no day chip is active, and every day chip shows an 8px dot `background: dayColorVar(d.idx)` before its text (the color legend).
  - Day chips link to `stopActivateHref(tripId, d.idx, null)`, which drops `view` and leaves overview.

- [ ] **Step 1:** Implement both.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 3: Commit** `feat(map): whole-trip chip on the day bar [TP-0110]`

### Task 5: Verify in the real app, update docs

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b` (Mount Fuji & Kamakura, 5 days), 1440×900.
- [ ] Day bar → `Whole trip`: all days' stops show, colored per day, the day chips show matching color dots, and the camera frames everything. A dashed connector runs between the Fuji-area and Kamakura days (≥ 15 km), and there are none inside a city. Screenshot.
- [ ] Zoom out below 12 → nearby stops merge into count bubbles. Click a bubble → it zooms and splits. Zoom to ≥ 12 → no bubbles.
- [ ] Hotel spanning nights → one bed pin.
- [ ] Click a point → that day, framed, overview chip inactive. Back → overview again (push).
- [ ] Network: toggling `Whole trip` sends **no** RSC request (`?_rsc=`) for the page (pushState). Back from overview → day view with no reload. Forward → overview.
- [ ] In overview, click a row in the list → overview exits (rows build a fresh `?day&placeId` URL, `sortable-place-list.tsx:88-96`) and the map pans to that stop. Note: it pans at trip zoom (`mapFocus` → `active`, no zoom change). If that reads badly, record it as a follow-up.
- [ ] With a stop selected (`?placeId=`), click `Whole trip` → frames all and no pin card shows. Open a list search preview while in overview → preview pin and card still work.
- [ ] Network: no new requests to `/api/places/*` or Google web services while in overview.
- [ ] 390×844 with `?view=trip` in the URL → normal day map + carousel (overview ignored).
- [ ] `MAPS_PROVIDER=open`: same checks; connectors render as a MapLibre line layer.
- [ ] Theme dark: connectors and clusters visible.
- [ ] Update `AGENTS-INDEX.md`: Map section lines for `map-overview-google.tsx` / `map-overview-maplibre.tsx` (whole-trip layer; matching canvas only, no selector) and `map-cluster-bubble.tsx`. Add helper lines for `lib/map-overview.ts` (`overviewPoints`, `dayConnectors`, `dayColorVar`, `hotelBookingIdOf`, `CONNECTOR_MIN_M`) and `lib/map-cluster.ts` (`createClusterIndex`, `CLUSTER_MAX_ZOOM`). Extend the `lib/map-carousel.ts` line with `overviewHref`, and mention `supercluster` in the stack line.
- [ ] Update `REQUIREMENTS.md` §10. Replace "Pin clustering at zoom-out." with "Whole-trip view (md+, `?view=trip`, day bar chip): every day's stops colored per day, stays once per booking, clustered below zoom 12, dashed connectors between days whose centres are ≥ 15 km apart; clicking a stop opens its day."
- [ ] Commit `docs: whole-trip map view [TP-0110]`

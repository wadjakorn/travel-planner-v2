# Map Route Lines Implementation Plan

> **Tickets:** Task 1 (bug fix) = **TP-0079** · rest = **TP-0092** — use the matching key in commit messages instead of TP-XXXX.

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **Split (orchestrator, 2026-10-29):** TP-0079 ships the *data* half of Task 1 before the pin plan: `dayLegs` (by `segment.idx`), pin numbering by list position, `MapLeg` type, `buildMapLegs` / `MapDay.legs`, the `page.tsx` leg loop, and their `day-augment.test.ts` tests. It **skips** the `globals.css` tokens, `ROUTE_NONE_COLOR`/`ROUTE_CASING_COLOR` and the `map-tokens.test.ts` mirror extension — those need TP-0084's token block and move to TP-0092.
> - **D3 — cut the mid-leg time labels.** Skip every step marked *(Decision 2)* (`RouteLegLabel`, Google label `AdvancedMarker`s, MapLibre label `Marker`s, and their verification). Ship lines + arrows only.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the shown day's route on the trip map as straight dashed lines between consecutive stops in visit order, colored by leg mode, with a direction arrow and a small mid-leg time label, on both renderers and with zero new API calls.

**Architecture:** The server already builds every day's pins in the trip layout (`buildMapDays`, `lib/day-augment.ts`). It now also builds `legs` per day from the same ordered display places plus the leg modes the list uses, through a new shared pure `dayLegs` (moved out of `page.tsx`'s `augmentDayWithHotels`, so map and list cannot disagree). `MapDay.legs` flows through `PersistentMap` to the canvases as a prop. Google draws each leg with vis.gl `<Polyline>` (casing + dashed line + `FORWARD_CLOSED_ARROW` icon); MapLibre keeps one persistent GeoJSON `<Source>` with casing, line and arrow-symbol layers whose data swaps per day. Time labels are small DOM markers at leg midpoints in both renderers.

**Tech Stack:** Next.js 16 (server layout → client props), `@vis.gl/react-google-maps` 1.8.3 (`Polyline`, `AdvancedMarker`), `react-map-gl/maplibre` 8.1.3 (`Source`, `Layer`, `Marker`, `useMap`), maplibre-gl 6.14 (`line-dasharray` is data-driven in this style spec), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §2.2 M2, §2.3 (scan path), §3.1 first bullet, §7.2 route tokens, TL;DR #2. Ticket proposal MAP-03.

**Touches:** `lib/day-augment.ts` (`MapDay.legs`, `dayLegs`, `buildMapLegs`, pin numbering), `lib/map-helpers.ts` (`MapLeg` type, two mirror constants), `app/trip/[id]/page.tsx` (`augmentDayWithHotels` uses `dayLegs`), `map-renderer-props.ts`, `persistent-map.tsx` (one prop), `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx` (one child each), `globals.css` (two tokens).

**Depends on:** `2026-10-29-map-pin-redesign.md` **Task 1** (map tokens + `MODE_COLOR` hex mirror + `lib/map-tokens.test.ts`). If this plan ships first, do that task verbatim as Task 0 here. Pin plan Tasks 2–5 are not needed (lines meet the pins either way; with the pin plan, they meet the teardrop tips).

**Shared with `2026-10-29-itinerary-rows.md` (scrutiny resolution):** both plans edit `buildMapDays` (`lib/day-augment.ts:160-189`) and `augmentDayWithHotels` (`trip/[id]/page.tsx:174-248`), but only rows changes the **signature** (adds `lang`, formats `pin.time`; adds `hours` to the page's place type). This plan keeps the signature and owns `Pin.idx`, `MapDay.legs` and the leg loop (`dayLegs`). No logic conflict. Agreed order (itinerary-rows scrutiny): **route-lines first**, then rows appends `lang: ClockLang = 'en'` (defaulted, so this plan's `buildMapDays(trip, [], 'metric')` test still compiles). `dayLegs` takes `places: unknown[]` structurally, so the rows plan's wider place type passes unchanged.

**Ship Task 1 on its own if the rest slips:** it fixes two live bugs (leg modes shown on the wrong leg in the list; pin numbers drifting from list numbers, against REQUIREMENTS §10 "numbered to match itinerary order") with no UI risk.

## Decision needed

1. **Leg with no stored mode** (a real-place gap with no `segment` row — e.g. API-imported days; the list shows no segment row there): **Default:** still draw it (order is the main point, M2) in neutral `--map-route-none #64748b`, dash `1/3`, no label.
2. **Mid-leg label:** **Default:** mode icon + the stored segment time (e.g. `14m`), only when the leg has a non-empty `time`; hotel legs (no stored time) and unknown-mode legs get no label. Shown at all widths. No distance (keeps the pill short).
   **Scrutiny: no real trip has this data.** Since Routes was removed, nothing writes a non-empty `segment.time`: every insert writes `time: ''` (`segment-service.ts:29`, `place-service.ts:71-77`) and the only update sets `mode` (`segment-service.ts:25-26`). Only seed data (`lib/seed/days.ts`) has times, so labels appear on demo trips and the test trip, never on trips users build. **Recommendation:** drop the labels from this PR (skip `RouteLegLabel`, the Google label `AdvancedMarker`s and the MapLibre label `Marker`s in Task 3, and their check in Task 5) and keep lines + arrows. Revisit together with a time estimate. **User decides**; the tasks below still describe the labels, each marked *(Decision 2)* so they can be cut.
3. **Geodesic:** Google `geodesic: true` (spec); MapLibre draws straight Mercator lines. Identical at intra-day scale; at 100 km+ the difference is a few pixels. **Default:** accept.

## Global Constraints

- **Zero new API calls / SKUs.** Straight lines between stored coordinates; Routes/Directions stay removed (REQUIREMENTS §10). No new billed Google load (Polyline is part of the already-loaded Maps JS).
- Styles (§7.2): walk `#15803d` dash 2/6; drive `#1d4ed8` dash 6/4; transit `#7c3aed` solid; none (this plan) `#64748b` dash 1/3. Dash units = multiples of the line width. Line width 3px; white casing 7px at opacity 0.9 under every leg (legible on busy basemaps). Colors come from `MODE_COLOR` + the two new mirrored tokens — no hex in components.
- New tokens in `globals.css` `:root` (light-locked, same block as the pin plan): `--map-route-none: #64748b`, `--map-route-casing: #ffffff`; mirrored in `lib/map-helpers.ts` as `ROUTE_NONE_COLOR`, `ROUTE_CASING_COLOR`.
- Verified at HEAD: `Polyline` is exported by `@vis.gl/react-google-maps` 1.8.3 (`dist/index.d.ts:1845`; `PolylineProps` = `google.maps.PolylineOptions` minus `map`/`path`, so `icons`/`geodesic`/`zIndex`/`clickable` are accepted). `line-dasharray` is `cross-faded-data-driven` in the style spec maplibre-gl 6.14 ships (`@maplibre/maplibre-gl-style-spec` 26.4.4). `MapRef.addImage` is proxied (not in react-map-gl's `skipMethods`).
- Leg = consecutive stops in the day's **display order** (begin hotels → places → end hotels, as the list). Skip a leg when either end has no coords, or when the ends are < 10 m apart (same hotel morning/evening, duplicates). A day with < 2 located stops has no lines.
- Pin numbers = list numbers (§2.4): `Pin.idx` becomes the 1-based position in the display list, so a stop without coords leaves a numbering gap (1, 3) next to a line gap instead of silently renumbering.
- Persistent map: no map remount on day switch; MapLibre keeps one `Source` (data swap); Google polylines are keyed by pin ids and unmount with the day.
- Lines and labels are non-interactive: never take pin clicks, POI taps (TP-0077) or map drags. Labels are `aria-hidden` (the list carries the same info).
- Copy: none (labels are icon + stored time).

## Review Focus

1. **Stop without coords mid-day:** no line through the gap; pins read 1 and 3. Test `buildMapLegs` + pin idx (Task 1).
2. **Hotel begin and end at the same coords / a day with only the hotel:** no zero-length leg (no lone arrow on the hotel). Test (Task 1).
3. **Sparse segment rows** (user set only leg 2's mode; API import has none): leg modes are looked up by `segment.idx`, not array position — today `page.tsx:244` uses `d.segments[i - padBegin]`, which shifts modes onto the wrong legs when rows are missing. Real path: an imported day gets places but no segment rows (`import-service.ts:86`); appending a place creates only the last leg's row (`ensureSegmentForAppendedPlace`, `place-service.ts:58-77`) → `segments = [{ idx: 2 }]` renders on leg 0, and because the list passes `idx={segment.idx ?? segmentIdx}` (`sortable-place-item.tsx:224`) changing that picker edits leg 2. Test `dayLegs` (Task 1); list and map now share it.
4. **MapLibre theme switch** (`mapStyle` changes → `setStyle` drops images): arrows must come back. `styleimagemissing` re-adds them; test the id↔mode helper (Task 2), manual check (Task 5).
5. **Rapid day switching on Google:** no stale polylines left from the previous day; lines never appear before the map is ready or in degraded mode (`overlays` gate). Manual check (Task 5).

---

### Task 1: Legs data — `dayLegs`, `buildMapLegs`, `MapDay.legs`

**Files:**
- Modify: `app/src/lib/map-helpers.ts` (add `MapLeg` type; add `ROUTE_NONE_COLOR`, `ROUTE_CASING_COLOR` next to `MODE_COLOR`)
- Modify: `app/src/app/globals.css` (`--map-route-none`, `--map-route-casing` in the map token block)
- Modify: `app/src/lib/day-augment.ts:146-189` (`MapDay`, `buildMapDays`; add `dayLegs`, `buildMapLegs`)
- Modify: `app/src/app/trip/[id]/page.tsx:174-248` (`augmentDayWithHotels` maps `dayLegs` output; drop its own leg loop)
- Test: `app/src/lib/day-augment.test.ts`, `app/src/lib/map-tokens.test.ts` (extend the mirror assertion)

**Interfaces:**
- Consumes: `Segment`, `HotelBooking` from `@/db/schema`; `metersBetween` from `@/lib/map-preview`; `displayPlacesForDay`, `splitHotelsForDay` (same file).
- Produces:
  ```ts
  // lib/map-helpers.ts
  export type MapLeg = {
    from: number;            // position in MapDay.pins (0-based), not Pin.idx
    to: number;
    mode: Mode | null;       // null = no stored mode (neutral style)
    label: string | null;    // stored segment time, e.g. '14m'
  };
  export const ROUTE_NONE_COLOR = '#64748b';
  export const ROUTE_CASING_COLOR = '#ffffff';

  // lib/day-augment.ts
  export type DayLeg =
    | { kind: 'segment'; mode: Mode; segment: Segment }
    | { kind: 'hotel'; mode: Mode; hotelId: string; leg: 'departure' | 'arrival' }
    | null;                  // real-place gap with no segment row (list shows nothing)
  export function dayLegs(
    d: { idx: number; defaultMode: Mode | null; places: unknown[]; segments: Segment[] },
    hotels: HotelBooking[],
    tripStart: string | null,
  ): DayLeg[];               // length = max(0, displayPlaces.length - 1)
  export function buildMapLegs(places: DisplayPlace[], legs: DayLeg[]): MapLeg[];
  export type MapDay = { /* existing fields */ legs: MapLeg[] };
  ```

Rules (decided):
- `dayLegs` mirrors today's `augmentDayWithHotels` exactly except the lookup: with `b` begin hotels, `r` real places, leg `i`: `i < b` → `{ kind:'hotel', leg:'departure', hotelId: beginHotels[i].id, mode: h.departureMode ?? d.defaultMode ?? 'drive' }`; `i + 1 >= b + r` → arrival of `endHotels[i + 1 - (b + r)]`, same fallback; else the segment with `s.idx === i - b` → `{ kind:'segment', mode: s.mode, segment: s }`, or `null`.
- `buildMapLegs`: map each display-place position to its pin position (`null` when no coords); for `i` in `0..places.length-2` emit `{ from, to, mode: legs[i]?.mode ?? null, label }` unless an end is unlocated or `metersBetween < 10`. `label = legs[i]?.kind === 'segment' ? legs[i].segment.time.trim() || null : null`.
- `buildMapDays`: `Pin.idx` = display position + 1 (was the position among located places); `legs = buildMapLegs(places, dayLegs(d, hotels, trip.startDate))`.
- `page.tsx`: `segments` = `dayLegs(...)` mapped: hotel → today's synthetic `AugmentedSeg` (`id: \`seg-syn-${d.id}-${i}\``, `setModeAction: setHotelLegModeAction.bind(null, l.hotelId, l.leg)`), segment → `l.segment`, `null` → `null`.

- [ ] **Step 1: Write failing tests** (in `day-augment.test.ts`; build `DisplayPlace` / `Segment` / `HotelBooking` fixtures with `as unknown as` like the existing helpers)

```ts
describe('dayLegs', () => {
  it('looks segments up by idx, not array position', () => {
    const legs = dayLegs({ idx: 0, defaultMode: null, places: [p0, p1, p2], segments: [seg({ idx: 1, mode: 'walk' })] }, [], null);
    expect(legs.map((l) => l?.mode ?? null)).toEqual([null, 'walk']);
  });
  it('hotel legs use the hotel mode, then the day default, then drive', () => {
    const legs = dayLegs({ idx: 1, defaultMode: 'transit', places: [p0], segments: [] }, [hotel({ id: 'h', checkInDate: '2026-07-12', checkOutDate: '2026-07-14', departureMode: 'walk' })], '2026-07-12');
    expect(legs).toEqual([
      { kind: 'hotel', leg: 'departure', hotelId: 'h', mode: 'walk' },
      { kind: 'hotel', leg: 'arrival', hotelId: 'h', mode: 'transit' },
    ]);
  });
});
describe('buildMapLegs', () => {
  it('skips legs touching a stop without coords', () => {
    const places = [at('a', 35, 139), noCoords('b'), at('c', 35.01, 139.01)];
    expect(buildMapLegs(places, [segLeg('drive', '5m'), segLeg('walk', '')])).toEqual([]);
  });
  it('skips a zero-length leg (same hotel morning and night)', () => {
    expect(buildMapLegs([at('h1', 35, 139), at('h2', 35, 139)], [hotelLeg('drive')])).toEqual([]);
  });
  it('emits pin positions, mode and the stored time label', () => {
    const places = [at('a', 35, 139), noCoords('x'), at('b', 35.01, 139), at('c', 35.02, 139)];
    expect(buildMapLegs(places, [null, null, segLeg('walk', ' 12m ')])).toEqual([{ from: 1, to: 2, mode: 'walk', label: '12m' }]);
  });
  it('hotel and modeless legs have no label', () => {
    expect(buildMapLegs([at('a', 35, 139), at('b', 35.01, 139)], [hotelLeg('drive')])[0].label).toBeNull();
  });
});
it('buildMapDays numbers pins by list position', () => {
  // day with places [a (coords), b (no coords), c (coords)]
  expect(buildMapDays(trip, [], 'metric')[0].pins.map((p) => p.idx)).toEqual([1, 3]);
});
```

Extend `map-tokens.test.ts`: `ROUTE_NONE_COLOR === root['--map-route-none']`, `ROUTE_CASING_COLOR === root['--map-route-casing']`.

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/day-augment.test.ts src/lib/map-tokens.test.ts` → FAIL.
- [ ] **Step 3:** Implement the types, tokens, `dayLegs`, `buildMapLegs`, `buildMapDays` changes; switch `page.tsx` to `dayLegs`.
- [ ] **Step 4:** Re-run → PASS. `pnpm typecheck && pnpm lint && pnpm test` → clean (tail -3).
- [ ] **Step 5:** Commit `feat(map): per-day route legs from list order; leg modes by segment idx [TP-XXXX]`

### Task 2: Pure route rendering helpers — `lib/map-route.ts`

**Files:**
- Create: `app/src/lib/map-route.ts`
- Test: `app/src/lib/map-route.test.ts`

**Interfaces:**
- Consumes: `MapLeg`, `Mode`, `Pin`, `MODE_COLOR`, `ROUTE_NONE_COLOR` from `@/lib/map-helpers`.
- Produces:
  ```ts
  export const ROUTE_WIDTH = 3;
  export const CASING_WIDTH = 7;
  export const CASING_OPACITY = 0.9;
  export type RouteStyle = { color: string; dash: [number, number] | null };
  export function routeStyle(mode: Mode | null): RouteStyle;
  // Google dashes are repeated symbols: 'M 0,-1 0,1' at `scale` is 2*scale px long.
  export function googleDash(s: RouteStyle, width?: number): { scale: number; repeatPx: number } | null;
  export function legMidpoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }): { lat: number; lng: number };
  export function legsGeoJSON(pins: Pin[], legs: MapLeg[]): GeoJSON.FeatureCollection<GeoJSON.LineString, { mode: Mode | 'none'; color: string }>;
  export const ARROW_SIZE = 24;
  export function arrowImageId(mode: Mode | 'none'): string;        // 'tp-route-arrow-walk'
  export function modeFromArrowImageId(id: string): Mode | 'none' | null;
  // RGBA, right-pointing (east) filled triangle in `hex`, transparent elsewhere.
  export function arrowBitmap(size: number, hex: string): { width: number; height: number; data: Uint8Array };
  ```

- [ ] **Step 1: Write failing tests**

```ts
it('routeStyle', () => {
  expect(routeStyle('walk')).toEqual({ color: '#15803d', dash: [2, 6] });
  expect(routeStyle('drive')).toEqual({ color: '#1d4ed8', dash: [6, 4] });
  expect(routeStyle('transit')).toEqual({ color: '#7c3aed', dash: null });
  expect(routeStyle(null)).toEqual({ color: '#64748b', dash: [1, 3] });
});
it('googleDash converts width units to symbol scale/repeat', () => {
  expect(googleDash(routeStyle('walk'))).toEqual({ scale: 3, repeatPx: 24 });   // 2*3/2, (2+6)*3
  expect(googleDash(routeStyle('transit'))).toBeNull();
});
it('legsGeoJSON draws [lng,lat] lines between pin positions', () => {
  const fc = legsGeoJSON([pin(35, 139), pin(36, 140)], [{ from: 0, to: 1, mode: null, label: null }]);
  expect(fc.features[0].geometry.coordinates).toEqual([[139, 35], [140, 36]]);
  expect(fc.features[0].properties).toEqual({ mode: 'none', color: '#64748b' });
});
it('arrow image ids round-trip', () => {
  expect(modeFromArrowImageId(arrowImageId('drive'))).toBe('drive');
  expect(modeFromArrowImageId('some-basemap-icon')).toBeNull();
});
it('arrowBitmap is opaque at the tip side, clear in the corners', () => {
  const b = arrowBitmap(24, '#15803d');
  const alpha = (x: number, y: number) => b.data[(y * 24 + x) * 4 + 3];
  expect(b.data.length).toBe(24 * 24 * 4);
  expect(alpha(14, 12)).toBe(255);
  expect(alpha(0, 0)).toBe(0);
  expect(alpha(23, 0)).toBe(0);
});
it('legMidpoint', () => expect(legMidpoint({ lat: 35, lng: 139 }, { lat: 36, lng: 140 })).toEqual({ lat: 35.5, lng: 139.5 }));
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-route.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Triangle for `arrowBitmap`: vertices `(size*0.25, size*0.2)`, `(size*0.8, size/2)`, `(size*0.25, size*0.8)`; point-in-triangle per pixel center, fill `hex` at alpha 255.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(map): route style + geometry helpers [TP-XXXX]`

### Task 3: Renderer components — Google + MapLibre + shared label

**Files:**
- Create: `app/src/components/map-route-label.tsx` (+ `map-route-label.module.css`)
- Create: `app/src/components/map-route-google.tsx`
- Create: `app/src/components/map-route-maplibre.tsx`

**Interfaces:**
- Consumes: Task 2 helpers; `Drive`, `Walk`, `Transit` from `@/components/icons`.
- Produces:
  ```ts
  export function RouteLegLabel(props: { mode: Mode; label: string }): JSX.Element;               // aria-hidden pill
  export function RouteLinesGoogle(props: { pins: Pin[]; legs: MapLeg[] }): JSX.Element;      // inside <Map id="trip-map">
  export function RouteLinesMaplibre(props: { pins: Pin[]; legs: MapLeg[] }): JSX.Element;    // inside react-map-gl <Map>
  ```
  Used only inside the matching canvas (no selector), like `map-active-focus-*`.

Decided behavior:
- *(Decision 2)* `RouteLegLabel`: pill, `background: var(--map-route-{mode})`, text `var(--map-pin-fg)` (white on all three ≥ 5:1), 11px/600 `var(--font-sans)`, padding `2px 6px`, radius full, 12px mode icon + text, `box-shadow: var(--shadow-sm)`, `pointer-events: none`, `aria-hidden`.
- Google, per leg (key `${pins[from].id}>${pins[to].id}`): casing `<Polyline path geodesic clickable={false} strokeColor={ROUTE_CASING_COLOR} strokeOpacity={CASING_OPACITY} strokeWeight={CASING_WIDTH} zIndex={1} />`; line `<Polyline path geodesic clickable={false} strokeColor={style.color} strokeOpacity={style.dash ? 0 : 1} strokeWeight={ROUTE_WIDTH} zIndex={2} icons={…} />` where `icons` (memoized) = dash symbol `{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: style.color, strokeWeight: ROUTE_WIDTH, scale }, offset: '0', repeat: \`${repeatPx}px\` }` when dashed, plus arrow `{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: style.color, fillOpacity: 1, strokeColor: ROUTE_CASING_COLOR, strokeWeight: 1 }, offset: '50%' }`. *(Decision 2)* Label when `mode && label`: `<AdvancedMarker position={legMidpoint} anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM} clickable={false} zIndex={5}>` with the pill offset 6px up (sits just above the mid arrow). Pins use `zIndex` ≥ 10 (pin plan), so labels stay under pins.
- MapLibre: one `<Source id="tp-route" type="geojson" data={fc}>` (`fc = useMemo(() => legsGeoJSON(pins, legs), [pins, legs])`, always mounted, empty FC on days without legs) with layers in this order: `tp-route-casing` (line, `line-color` casing, width 7, opacity 0.9, `line-cap: round`), `tp-route-line` (line, `line-color: ['get','color']`, width 3, `line-dasharray: ['match', ['get','mode'], 'walk', ['literal',[2,6]], 'drive', ['literal',[6,4]], 'none', ['literal',[1,3]], ['literal',[1,0]]]`), `tp-route-arrow` (symbol, `symbol-placement: 'line-center'`, `icon-image: ['concat','tp-route-arrow-',['get','mode']]`, `icon-rotation-alignment: 'map'`, `icon-allow-overlap: true`, `icon-ignore-placement: true`; the 24px bitmap at `pixelRatio: 2` draws 12px). Arrow images: `useMap().current` → on mount add the four images if missing (`map.addImage(arrowImageId(m), arrowBitmap(ARROW_SIZE, color), { pixelRatio: 2 })`) and subscribe `styleimagemissing` → `modeFromArrowImageId(e.id)` → add that one (covers theme `setStyle`). *(Decision 2)* Labels: `<Marker anchor="bottom" offset={[0, -6]} style={{ pointerEvents: 'none', zIndex: 5 }}>`. No `interactiveLayerIds` → layers never take clicks.

- [ ] **Step 1:** Implement the three components.
- [ ] **Step 2:** `cd app && pnpm typecheck && pnpm lint` → clean (tail -3).
- [ ] **Step 3:** Commit `feat(map): route line renderers (Google Polyline, MapLibre line layers) [TP-XXXX]`

### Task 4: Wire through `PersistentMap` and both canvases

**Files:**
- Modify: `app/src/components/map-renderer-props.ts` (`RealMapCanvasProps.legs?: MapLeg[]`)
- Modify: `app/src/components/persistent-map.tsx:136-148` (`legs={day.legs}`)
- Modify: `app/src/components/real-map-canvas-google.tsx` (render `{overlays && <RouteLinesGoogle pins={pins} legs={legs ?? []} />}` before the pin markers)
- Modify: `app/src/components/real-map-canvas-maplibre.tsx` (render `<RouteLinesMaplibre pins={pins} legs={legs ?? []} />` before the pin `Marker`s)

**Interfaces:**
- Consumes: Task 1 `MapDay.legs`, Task 3 components.
- Produces: `RealMapCanvasProps.legs?: MapLeg[]` — "Visit-order legs of the shown day; positions index `pins`."

- [ ] **Step 1:** Add the prop and the two render sites (Google stays behind the existing `overlays` gate so nothing attaches to a dead/degraded map).
- [ ] **Step 2:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → all pass (tail -3).
- [ ] **Step 3:** Commit `feat(map): draw the day's route in visit order [TP-XXXX]`

### Task 5: Verify in the real app + docs

**Files:**
- Modify: `REQUIREMENTS.md` §10 — replace "No on-map route polylines (Routes/Directions API removed); …" with "Day route: straight dashed lines between consecutive stops in list order (no Routes/Directions API, no API cost), colored by leg mode (walk / drive / transit; neutral when unset), with a direction arrow and the stored leg time as a label; legs touching a stop without coordinates are not drawn. Per-leg routing is still deep-linked out to Google Maps URLs."
- Modify: `AGENTS-INDEX.md` — Map table rows for `map-route-google.tsx` / `map-route-maplibre.tsx` ("day route lines; used inside the matching canvas, no selector") and `map-route-label.tsx`; helpers line for `lib/map-route.ts` (`routeStyle`, `googleDash`, `legsGeoJSON`, `legMidpoint`, `arrowBitmap`, `arrowImageId`); `lib/day-augment.ts` line adds `dayLegs` / `buildMapLegs` / `MapDay.legs`; `map-helpers.ts` line adds `MapLeg`; rewrite the "Routes API dropped" paragraph's last sentence ("No on-map polylines") to point at the straight-line route.

- [ ] **Step 1:** `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`; `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b` at 1440×900.
- [ ] **Step 2:** Day 1: lines connect pins 1→2→3… in list order; colors match the list's segment modes; arrows point forward; time pills sit mid-leg where the list shows a time. Screenshot.
- [ ] **Step 3:** Switch days 1→5→2 quickly (list day headers and, at 390×844 full-map, the carousel `‹ ›`): map does not reload (no blank flash), only the shown day's lines are drawn.
- [ ] **Step 4:** Change one leg's mode in the list → after refresh the line recolors.
- [ ] **Step 5:** Click a pin that sits on a line, and tap a Google POI next to a line: pin card / POI preview open as before (lines take no clicks).
- [ ] **Step 6:** `MAPS_PROVIDER=open`: same as steps 2–3; toggle theme in Settings → lines and arrows still drawn after the style swap.
- [ ] **Step 7:** Edge day: add a manual place without coords between two stops on a scratch day → no line across it, pins numbered 1 and 3 like the list; a day with only the hotel → no line.
- [ ] **Step 8:** Network panel: no requests to `routes.googleapis.com` / `directions` / Places during any of the above. Expect one new `maps.googleapis.com` script fetch for the `geometry` library: vis.gl `Polyline` calls `useMapsLibrary('geometry')` unconditionally (`index.modern.mjs:2093`). That load is free (no SKU) and is not a map load.
- [ ] **Step 9:** Update the two docs; commit `docs(index): day route lines [TP-XXXX]`.

---

## Self-review notes

- Spec coverage: M2 lines in order, geodesic dashed, mode color, arrows, zero cost (Tasks 1–4); §3.1 mid-leg label from stored segment data (Tasks 1/3); §7.2 route tokens (pin plan Task 1 + two tokens here); TL;DR #2. M2's "use a stored polyline when the leg has one" does not apply: `segment` has no polyline column since Routes was dropped.
- §2.3 "nothing guides the eye between pins" is what the arrows + order lines address; no extra task.
- Not here: M4's faint "nearest stop → preview" dashed line (MAP-11, can reuse `routeStyle(null)` + `RouteLinesGoogle`-style casing); ghost routes for other days (MAP-09).

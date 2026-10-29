# Map Camera Rules Implementation Plan

> **Ticket:** TP-0095

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trip map stops losing context: picking a pin or row only moves the camera when the pin is outside the visible safe area (and then minimally), a search preview frames the day's pins together with the preview, a tapped map POI (TP-0077) is only revealed (no refit, no zoom change, because the user just tapped it on screen), an empty day frames a sensible fallback (never Tokyo), and Google camera moves stay still under `prefers-reduced-motion`.

**Architecture:** All decisions stay pure and unit-tested. `mapFocus` in `lib/map-preview.ts` switches to an object input and gains the `preview-fit` and `fallback` outcomes. A new `lib/map-camera.ts` holds the pixel math: Web-Mercator projection for Google (256-px world), `revealPan` (the minimal pan into a safe rect), and the safe-area/padding builders. `lib/map-helpers.ts` gets `emptyDayFallback` and an initial camera that never falls back to a hardcoded city. The two `map-active-focus-*` components become thin adapters: they read the camera, call the pure functions and apply the result. MapLibre already honours reduced motion inside `easeTo`/`panBy`/`fitBounds` (`node_modules/maplibre-gl/src/ui/camera.ts:851`). Google needs an explicit `moveCamera` path.

**Tech Stack:** Next.js 16, React 19, `@vis.gl/react-google-maps` 1.8.3, `react-map-gl/maplibre` 8.1.3 (maplibre-gl 6.14), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md`: §7.3 (Camera rules), §2.2 M3, M4 and M12, §5 A15, and TL;DR #4.

**Touches:** `components/map-active-focus-google.tsx`, `components/map-active-focus-maplibre.tsx`, `components/real-map-canvas-google.tsx`, `components/real-map-canvas-maplibre.tsx`, `components/persistent-map.tsx`, `components/map-renderer-props.ts`, `components/use-poi-preview.ts` (one import: the owner constant), `lib/map-helpers.ts`, `lib/map-preview.ts`, `docs/ops/maps-cost-guardrails.md` (one sentence). No `map-canvas.module.css` change (the empty-day note reuses the bottom-left slot, see Task 3).

**Order vs other plans:** independent of `map-pin-redesign`, `map-day-bar-ghost-pins`, `map-hover-sync` and `map-degraded-notice`; see "Cross-plan" at the end for the rebase notes (card-clearance constants after the pin redesign, `frameSig` for the overview plan).

## Decision needed

1. **Show the map on an empty day?** Today an empty day unmounts the canvas and shows "Add a spot to see it on the map." (`persistent-map.tsx:106,149-155`). Because of that, the Tokyo `centroid([])` is only visible for a moment, when a preview opens on an empty day. **Default: render the map on an empty day, framed on the fallback, with a small "No places on Day N yet · showing …" note.** This keeps the user's surroundings in view. It also keeps the single map instance alive (MapLibre would otherwise re-create WebGL), and it makes POI tap-to-add (TP-0077) and viewport search bias work on empty days. Cost: switching between located and empty days costs nothing today or after (Google `reuseMaps` returns the cached `google.maps.Map` on remount, `docs/ops/maps-cost-guardrails.md:145-150`). The only new billed load is a session that opens the itinerary on an empty day and never visits a located day: today that session shows the placeholder and creates no map; after this change it creates one (at most 1 Dynamic Maps load per page session, same as visiting any located day). Alternative: keep the placeholder. Then only Task 1's `initialCamera` fix is needed for M12.
2. **A far-away preview:** if the closest stop of the day is more than **50 km** from the preview, frame the preview alone, as today. Framing a stop in another city would zoom out until both are unreadable. **Default: 50 km** (`PREVIEW_FRAME_MAX_M`).

## Global Constraints

- §7.3 rules, verbatim intent: pin/row click → "if already inside the safe area → do not move; else minimal pan". Search preview → `fitBounds(day pins ∪ preview)`. Empty day → "previous day → stay → trip centre (never Tokyo)". Reduced motion → `moveCamera` instead of `panTo`.
- §7.3 says "ดูตัวอย่างผลค้นหา" (search-result preview). A **map POI tap** (TP-0077, preview `ownerId === 'poi'`, `use-poi-preview.ts:17`) is not a search result: the POI is already on screen under the user's finger, so it gets the pin rule instead (reveal: no move if its card fits, else minimal pan, never a zoom change). `fitBounds(day ∪ POI)` there would zoom out from wherever the user was looking, which is the context loss this plan exists to fix. The owner string moves to `export const POI_PREVIEW_OWNER = 'poi'` in `lib/map-preview.ts`, imported by `use-poi-preview.ts`.
- The pixel math assumes a flat camera (`tilt` 0, `heading` 0). The trip map never sets either and vector-map tilt/rotate gestures are off by default, but a Map ID can enable them. If `map.getTilt()` or `map.getHeading()` is non-zero, the Google reveal falls back to today's `panTo` (centre on the pin).
- "Safe area" = the map rect minus `fitPadding(stripVisible)` (`lib/map-helpers.ts:69-73`; on mobile the strip uses 72/48/240/48). When the active pin card will show, the rect also leaves room for the card (`ACTIVE_CARD_CLEARANCE`).
- Day-switch framing stays exactly as shipped (`FIT_PADDING` 48, `FIT_MAX_ZOOM` 14, the TP-0076 strip padding). Do not re-tune it here.
- No new Google API calls. Camera methods (`moveCamera`, `panBy`, `fitBounds`, `getCenter`/`getZoom`/`getDiv`) act on the already-loaded map and are not billed. Dynamic Maps bills per `google.maps.Map` creation, and `reuseMaps` is unchanged (`docs/ops/maps-cost-guardrails.md:145-150`). Rendering the map on empty days (Decision 1) adds at most one load per page session, and only for a session that never visits a located day (see Decision 1).
- Reduced motion: detect with `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, read at move time (same idiom as `map-stop-carousel.tsx:100`).
- Copy (EN; i18n is forced to `en`): the empty-day note is `No places on Day {d} yet · showing Day {n}`, `No places on Day {d} yet · showing your stay` or `No places on Day {d} yet · showing the whole trip`.
- No new hex. The note reuses `.mapPill` inside the existing bottom-left `data-map-dist` overlay (`.overlayBl`), in place of the distance/time chips, which have nothing to show on an empty day. That slot is already hidden in mobile full-map (`globals.css:293-296`), where the carousel shows its own "No places with a location on this day." (`map-stop-carousel.tsx:130-136`), and it is untouched by the day-bar plan, which deletes the top-left `data-map-day` chip.

## Review Focus

1. **The active pin sits under the area where its card will open** (near the top edge of a desktop map): the pin is "visible", but its card would be clipped because the InfoWindow has `disableAutoPan`. The safe area must include card clearance. Test: `activeSafeArea(pad, true)`, plus a `revealPan` case where a pin at y=100 on an 800-px map pans down (Task 2).
2. **A tiny map** (tablet split, short window) where the safe rect collapses: the minimal pan must not oscillate or throw. It centres the pin on the collapsed axis. Test: `revealPan` with an empty rect (Task 2). For a preview, `previewPadding` returns `null` and the code falls back to centring on the preview (Task 2).
3. **A preview on an empty day, or one far from every stop:** frame the preview alone (the old behaviour), never `fitBounds` with one point at max zoom-out. Test: `mapFocus` cases (Task 1).
4. **Two empty days in a row, or a day switch onto an empty day:** the camera must refit to the new day's fallback. `pinsSig` is `''` for every empty day, so the effect would not re-run. Fix it with a frame signature that includes the fallback. Manual check in Task 4. `frameSig` is unit-tested (Task 3).
5. **A whole trip with no located place:** there is still no map, and no Tokyo. `emptyDayFallback` returns `null` and the placeholder stays. `initialCamera([], null)` returns a world view, never `{35.65,139.74}`. Tests in Task 1.
6. **A tapped Google POI (TP-0077) next to the day's stops:** the camera must not zoom out to frame the day. It reveals the POI with preview-card clearance (usually no move at all). Test: `mapFocus` with `fromMap: true` → `preview-reveal` even within 50 km (Task 1); `previewSafeArea` (Task 2). Manual check in Task 4.
7. **Leaving a search preview by selecting a pin** (`activate` from a pin, `select` from the TP-0076 carousel): `savedZoom` is restored on the pin exactly as today, for both `preview` and `preview-fit`. `select` and `activate` reach `ActiveFocus` identically (both set `shownPlaceId`, `persistent-map.tsx:84-104`), so the carousel needs no special case; it only differs through `stripVisible` (no card clearance, 240 px bottom).

---

### Task 1: Pure rules: `mapFocus` object input + outcomes, empty-day fallback, initial camera

**Files:**
- Modify: `app/src/lib/map-preview.ts:79-99` (`MapFocus`, `mapFocus`; new `PREVIEW_FRAME_MAX_M`, `POI_PREVIEW_OWNER`), `:145` (drop the private `LatLng`, import it from map-helpers), `:158` (`nearestStop(pins: readonly Pin[], …)` so `FocusInput.pins` can be passed)
- Modify: `app/src/components/use-poi-preview.ts:17` (`const OWNER = POI_PREVIEW_OWNER`)
- Modify: `app/src/components/map-renderer-props.ts:8` (`export type { LatLng } from '@/lib/map-helpers'` instead of a second declaration, so there is one `LatLng`)
- Modify: `app/src/lib/map-helpers.ts:35-59` (`centroid`, `deriveZoom`, `pinBounds` generalised to points; new `LatLng`, `initialCamera`, `emptyDayFallback`, `emptyDayNote`)
- Test: `app/src/lib/map-preview.test.ts:63-85` (migrate the 11 `mapFocus` cases to the object input, then add the new ones), `app/src/lib/map-helpers.test.ts`

**Interfaces:**
- Produces (map-helpers):
  - `export type LatLng = { lat: number; lng: number }`
  - `centroid(points: readonly LatLng[]): LatLng | null`: `null` for empty input (the Tokyo literal is deleted)
  - `deriveZoom(points: readonly LatLng[]): number` and `pinBounds(points: readonly LatLng[])`: same behaviour, wider parameter type
  - `initialCamera(points: readonly LatLng[], preview: LatLng | null): { center: LatLng; zoom: number }`. Points → `centroid` + `deriveZoom`. Otherwise preview → `{ center: preview, zoom: FIT_MAX_ZOOM }`. Otherwise `WORLD_VIEW = { center: { lat: 20, lng: 0 }, zoom: 2 }`.
  - `export type DayFallback = { points: LatLng[]; from: 'prev-day' | 'stay' | 'trip'; dayIdx?: number }`
  - `emptyDayFallback(days: readonly { idx: number; pins: readonly Pin[] }[], dayIdx: number): DayFallback | null`. Order: (a) the **nearest earlier** day that has pins → all its pins, `from:'prev-day'`, `dayIdx` = that day's `idx`. (b) The first `kind==='hotel'` pin on any later day → `[that pin]`, `'stay'`. Stays are already pins on their nights via `buildMapDays`, so this only ever finds an upcoming stay. (c) All pins of the trip → `'trip'`. This frames them instead of centring on a mean point: a centroid of a two-city trip lands between the cities at zoom 14. (d) `null`. Returns `null` when `days[dayIdx]` itself has pins.
  - `emptyDayNote(dayNumber: number, f: DayFallback): string` (copy in Global Constraints; `{n}` = `f.dayIdx + 1`)
- Produces (map-preview):
  ```ts
  export const PREVIEW_FRAME_MAX_M = 50_000;
  export const POI_PREVIEW_OWNER = 'poi';
  export type MapFocus =
    | { kind: 'preview'; lat: number; lng: number }        // preview alone, card offset
    | { kind: 'preview-fit'; points: LatLng[] }            // day pins ∪ preview (search result)
    | { kind: 'preview-reveal'; lat: number; lng: number } // tapped map POI: reveal with card clearance
    | { kind: 'active'; lat: number; lng: number }         // reveal (no move / minimal pan)
    | { kind: 'fit' }                                      // frame the day's pins
    | { kind: 'fallback'; points: LatLng[] }               // empty day
    | { kind: 'stay' };
  export type FocusInput = {
    preview: (LatLng & { fromMap?: boolean }) | null; // fromMap: ownerId === POI_PREVIEW_OWNER
    activePin: Pin | null; activeChanged: boolean;
    previewExited?: boolean; pinsChanged?: boolean;
    pins: readonly Pin[]; fallback?: readonly LatLng[];
  };
  export function mapFocus(i: FocusInput): MapFocus;
  ```
  The order is the current rules 1–3 unchanged. Then: preview with `fromMap` → `preview-reveal`. Other preview → `preview-fit` with `[...pins, preview]` when `nearestStop(pins, preview)?.meters <= PREVIEW_FRAME_MAX_M`, else `preview`. Then active → `active`. Then `pins.length` → `fit`. Then `fallback?.length` → `fallback`. Otherwise `stay`.

- [x] **Step 1: Write failing tests.**
  - Migrate every existing `mapFocus(a, b, c, d, e)` call to `mapFocus({ preview: a, activePin: b, activeChanged: c, previewExited: d, pinsChanged: e, pins: [pin] })` and keep the expected values. In the `'preview beats a standing active pin'` style cases, the preview at `{5,6}` is more than 50 km from `pin` `{1,2}`, so `{kind:'preview'}` still holds.
  - New cases in map-preview.test.ts:
    - `'preview within 50 km of a stop frames the day with it'`: pins `[A(35.66,139.70), B(35.67,139.71)]`, preview `{35.68,139.72}` → `{ kind:'preview-fit', points:[A,B,preview] }` (`toEqual` on lat/lng).
    - `'preview far from every stop frames the preview alone'`: pins in Tokyo, preview in Osaka (34.69,135.50) → `{kind:'preview', lat:34.69, lng:135.50}`.
    - `'preview on an empty day frames the preview alone'`: `pins: []` → `kind:'preview'`.
    - `'empty day uses the fallback'`: `pins: [], fallback: [{lat:1,lng:2}]` with `activeChanged:true, pinsChanged:true` → `{kind:'fallback', points:[{lat:1,lng:2}]}`.
    - `'empty day without a fallback stays'`: `pins: []` → `{kind:'stay'}`.
    - `'a tapped map POI is revealed, never refit with the day'`: same pins A,B, preview `{35.68,139.72, fromMap:true}` → `{kind:'preview-reveal', lat:35.68, lng:139.72}`. Also with `pins: []` → `preview-reveal`.
    - `'a freshly selected pin still beats a POI preview'`: `fromMap:true`, `activePin: pin, activeChanged: true` → `kind:'active'` (rule 1 unchanged).
    - `'PREVIEW_FRAME_MAX_M is 50 km'`.
  - The 11 migrated cases must stay byte-identical in their expectations; if any needs a new expected value, the refactor changed behaviour. Stop and fix the rule order instead.
  - New cases in map-helpers.test.ts:
    - `centroid([])` → `null`. `initialCamera([], null)` → `{ center:{lat:20,lng:0}, zoom:2 }`. `initialCamera([], {lat:13.7,lng:100.5})` → zoom 14 at that point. `expect(JSON.stringify(initialCamera([], null))).not.toContain('139.74')`.
    - `emptyDayFallback`: days `[d0(pins A,B), d1([]), d2([])]`, idx 2 → `{from:'prev-day', dayIdx:0, points:[A,B]}`. Days `[d0([]), d1([sight S]), d2([hotel H])]`, idx 0 → `{from:'stay', points:[H]}`. Days `[d0([]), d1([S])]`, idx 0 → `{from:'trip', points:[S]}`. All empty → `null`. A day that has pins → `null`.
    - `emptyDayNote(3, {from:'prev-day', dayIdx:1, points:[]})` → `'No places on Day 3 yet · showing Day 2'`. Also `'stay'` → `'… · showing your stay'` and `'trip'` → `'… · showing the whole trip'`.
- [x] **Step 2: Run** `cd app && pnpm vitest run src/lib/map-preview.test.ts src/lib/map-helpers.test.ts`. Expected: FAIL (signature/new exports).
- [x] **Step 3: Implement** the Interfaces above. In both `map-active-focus-*` files, change only the call site to the object form, passing `pins` and nothing else yet, and treat `preview-fit` / `preview-reveal` exactly like `preview` (centre on the preview; for `preview-fit` use its last point) so this intermediate commit keeps today's behaviour instead of falling through to the day fit. The single-pin `centroid(pins)` calls (`map-active-focus-google.tsx:101`, `map-active-focus-maplibre.tsx:82`) become `initialCamera(pins, null)`, so typecheck stays green with the nullable `centroid`. Task 3 does the real wiring. In the canvases, temporarily use `initialCamera(pins, null)` where `centroid(pins)` / `deriveZoom(pins)` were (`real-map-canvas-google.tsx:95-96`, `real-map-canvas-maplibre.tsx:38-39,66-70`).
- [x] **Step 4: Run** the same tests → PASS. Then `pnpm typecheck` (tail -3) is clean.
- [x] **Step 5: Commit** `feat(map): pure camera rules — preview framing, empty-day fallback, no Tokyo [TP-0095]`

### Task 2: Pure pixel math: `lib/map-camera.ts`

**Files:**
- Create: `app/src/lib/map-camera.ts`
- Test: `app/src/lib/map-camera.test.ts`

**Interfaces:**
- Consumes: `FitPadding`, `FIT_PADDING`, `LatLng` from `@/lib/map-helpers`.
- Produces:
  ```ts
  export type Size = { width: number; height: number };
  export type Cam = { center: LatLng; zoom: number };     // Google zoom: 256-px world tiles
  export const ACTIVE_CARD_CLEARANCE = { top: 280, side: 136 }; // pin card 240 wide (+chrome), ~260 tall with photo
  export const PREVIEW_CARD_CLEARANCE = { top: 340, side: 150 }; // preview card 260 wide, photo 120 + actions
  export const MIN_SAFE = 120;                             // smallest usable safe rect (px)
  export function toViewPx(p: LatLng, cam: Cam, size: Size): { x: number; y: number };
  export function offsetCenter(cam: Cam, dx: number, dy: number): LatLng; // the centre after panBy(dx, dy)
  export function revealPan(pt: { x: number; y: number }, size: Size, safe: FitPadding): { dx: number; dy: number };
  export function activeSafeArea(pad: FitPadding, cardShown: boolean): FitPadding;
  export function previewSafeArea(pad: FitPadding): FitPadding;            // POI reveal: the preview card always shows
  export function previewPadding(size: Size, stripVisible: boolean): FitPadding | null;
  ```
  - `previewSafeArea(pad)` = `{ top: max(pad.top, PREVIEW_CARD_CLEARANCE.top), right: max(pad.right, PREVIEW_CARD_CLEARANCE.side), bottom: pad.bottom, left: max(pad.left, PREVIEW_CARD_CLEARANCE.side) }`. `previewPadding` uses the same constant (no second copy of 340/150).
  - `toViewPx` / `offsetCenter`: Web Mercator world coordinates, `worldSize = 256 * 2 ** zoom`, `x = (lng + 180) / 360`, `y = (1 - ln(tan φ + sec φ) / π) / 2`. Clamp lat to ±85.05113. `offsetCenter` is the exact inverse of a pixel shift.
  - `revealPan`: per axis, safe span `[pad.left, width - pad.right]` / `[pad.top, height - pad.bottom]`. If the span is shorter than `MIN_SAFE`, return the delta that centres the point on that axis (`x - width/2`). Else `x < lo ? x - lo : x > hi ? x - hi : 0`.
  - `activeSafeArea(pad, true)` = `{ top: max(pad.top, 280), right: max(pad.right, 136), bottom: pad.bottom, left: max(pad.left, 136) }`. `(pad, false)` returns `pad` unchanged.
  - `previewPadding`: `bottom = stripVisible ? 240 : FIT_PADDING`, `top = 340`, `side = min(150, max(FIT_PADDING, (width - MIN_SAFE) / 2))`. Return `null` when `height - top - bottom < MIN_SAFE`.

- [x] **Step 1: Write failing tests** (`describe` per function):
  - `toViewPx(cam.center, cam, {width:800,height:600})` → `{x:400,y:300}`. At zoom 1, centre `{0,0}`, size 512×512, `{lat:0,lng:90}` → `x≈384, y≈256` (`toBeCloseTo`, 6).
  - Round trip (`offsetCenter` = the centre after `panBy`): with `cam={center:{lat:35.66,lng:139.7},zoom:13}` and size 800×600, `toViewPx(offsetCenter(cam,120,-80), cam, size)` → `{x:520, y:220}` (`toBeCloseTo`, 6).
  - `revealPan({x:400,y:400}, {width:800,height:800}, pad48)` → `{dx:0,dy:0}`. `{x:10,y:400}` → `{dx:-38,dy:0}`. `{x:400,y:790}` → `{dx:0,dy:38}`.
  - Card clearance: `revealPan({x:400,y:100}, {800,800}, activeSafeArea(pad48,true))` → `{dx:0, dy:-180}`.
  - Collapsed rect: `revealPan({x:50,y:50}, {width:200,height:200}, {top:100,right:48,bottom:100,left:48})` → `{dx:-50, dy:-50}`. Both spans (104 px and 0 px) are under `MIN_SAFE`, so both axes centre.
  - `activeSafeArea(fitPadding(true), true)` → `{top:280,right:136,bottom:240,left:136}`. `activeSafeArea(p,false)` is `p`.
  - `previewSafeArea(fitPadding(true))` → `{top:340,right:150,bottom:240,left:150}`; `revealPan({x:195,y:500}, {width:390,height:844}, previewSafeArea(fitPadding(true)))` → `{dx:0,dy:0}` (a POI tapped mid-screen on a phone does not move the map).
  - `previewPadding({width:1000,height:800}, false)` → `{top:340,right:150,bottom:48,left:150}`. `({width:390,height:844}, true)` → sides `135`, bottom `240`. `({width:390,height:600}, true)` → `null`.
- [x] **Step 2: Run** `pnpm vitest run src/lib/map-camera.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3: Implement** `lib/map-camera.ts`.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(map): camera pixel math — reveal pan, card clearance, preview padding [TP-0095]`

### Task 3: Wire the renderers (Google + MapLibre) and the empty-day map

**Files:**
- Modify: `app/src/components/map-renderer-props.ts` (`RealMapCanvasProps` gains `fallbackFrame?: LatLng[]` and `emptyNote?: string | null`)
- Modify: `app/src/components/persistent-map.tsx:106,135-155`
- Modify: `app/src/components/real-map-canvas-google.tsx:95-96,113-121,195-198`
- Modify: `app/src/components/real-map-canvas-maplibre.tsx:38-40,66-70,75-85,171-174`
- Modify: `app/src/components/map-active-focus-google.tsx` (whole effect body)
- Modify: `app/src/components/map-active-focus-maplibre.tsx` (whole effect body)
- Modify: `app/src/lib/map-helpers.ts` (`frameSig`)
- Test: `app/src/lib/map-helpers.test.ts` (`frameSig`)

**Interfaces:**
- Consumes: Task 1 (`mapFocus`, `FocusInput`, `emptyDayFallback`, `emptyDayNote`, `initialCamera`, `pinBounds`, `toGoogleBounds`). Task 2 (`toViewPx`, `offsetCenter`, `revealPan`, `activeSafeArea`, `previewPadding`).
- Produces: `frameSig(pins: readonly Pin[], fallback: readonly LatLng[]): string`. This is the pin ids joined by `|`. With no pins, it is `fallback:` plus the `lat,lng` pairs. Both `ActiveFocus*` props change from `pinsSig` to `frameSig` and gain `fallback: LatLng[]`. Their `preview` prop type widens to `{ id: string; lat: number; lng: number; ownerId?: string } | null` (the canvases already pass the full `MapPreview`), and `FocusInput.preview` gets `fromMap: preview.ownerId === POI_PREVIEW_OWNER`.

Decided behaviour:
- **PersistentMap.** Compute `const fb = useMemo(() => emptyDayFallback(mapDays, dayIdx), [mapDays, dayIdx])`. Then `canRenderMap = !!day && (day.pins.length > 0 || fb != null || preview != null || shownForDay === dayIdx)`. Pass `fallbackFrame={fb?.points ?? []}` and `emptyNote={fb ? emptyDayNote(day.idx + 1, fb) : null}`. The placeholder branch stays for `fb == null` (the whole trip has no located place).
- **Canvases.** The initial camera comes from `initialCamera(pins.length ? pins : fallbackFrame, preview ?? null)`. MapLibre keeps `bounds` in `initialViewState` when `pinBounds(frame)` is non-null. Render `emptyNote` as a `.mapPill` with `role="status"` inside the existing bottom-left `data-map-dist` overlay, instead of the distance/time chips: `showDistChip || emptyNote` opens the overlay, and the note wins when set. Mobile full-map already hides that overlay (`globals.css:293-296`), so the strip's own empty message stays the only one there. Do not touch the top-left `data-map-day` chip (the day-bar plan deletes it).
- **ActiveFocus, both renderers.** Build `FocusInput` with `pins` and `fallback`, and apply:
  - `stay` → clear `savedZoom`, return (unchanged).
  - `preview`: Google uses `map.moveCamera({ zoom: z, center: offsetCenter({ center: f, zoom: z }, 0, -PREVIEW_OFFSET_Y) })` with `z = max(getZoom, PREVIEW_ZOOM)`. This replaces `setZoom`/`setCenter`/`panBy` (`:64-68`), so it is one instant move that respects reduced motion. MapLibre is unchanged (`easeTo` + `offset`). Keep the zero-size `ResizeObserver` wait for both preview kinds.
  - `preview-fit`: `pad = previewPadding(size, strip.current)`. If `null`, do the `preview` move above. Otherwise Google uses `fitBounds(toGoogleBounds(pinBounds(points)!), pad)` with the existing one-shot `idle` clamp to `FIT_MAX_ZOOM`, and MapLibre uses `fitBounds(b, { padding: pad, maxZoom: FIT_MAX_ZOOM })` (animated; MapLibre zeroes the duration under reduced motion). Save `savedZoom` first, as the preview path does today.
  - `active`: when `savedZoom != null` (leaving a preview for a pin), centre on the pin at that zoom as today. Google uses `moveCamera({ center, zoom })` and MapLibre uses `easeTo`. Otherwise **reveal** with `activeSafeArea(fitPadding(strip.current), !strip.current)` (`stripVisible` is `hidePinCard`, `real-map-canvas-google.tsx:120`, so "strip shown" ⇔ "card hidden").
  - `preview-reveal` (map POI): do **not** save `savedZoom` (review fix: the restore path re-centres on the stop, which is not a no-op; with nothing saved, a later exit-to-pin reveals the stop instead), then **reveal** the preview with `previewSafeArea(fitPadding(strip.current))`. No zoom change.
  - **reveal(point, safe)**, shared by both: read `size` from the map div. If the size is 0 or the camera is not ready (Google `getCenter()` undefined), set the centre instantly and return. Google only: if `(map.getTilt() ?? 0) !== 0 || (map.getHeading() ?? 0) !== 0`, `panTo(point)` (today's behaviour; `moveCamera` under reduced motion) and return, because the flat Mercator math is wrong on a tilted camera. Get `pt`: Google `toViewPx(point, { center: getCenter().toJSON(), zoom: getZoom() }, size)` (exact for a flat camera, fractional zoom included: the world is `256·2^zoom` CSS px; no `OverlayView`/`getProjection()` needed), MapLibre `map.project([lng, lat])`. Then `{dx,dy} = revealPan(pt, size, safe)`. If both are 0, there is no camera call. Google: `reduced ? moveCamera({ center: offsetCenter(cam, dx, dy) }) : panBy(dx, dy)`. MapLibre: `panBy([dx, dy])`.
  - `fit` / `fallback`: the existing fit closure, parameterised by `points` (`pins` or `f.points`). Google's single-point branch uses `moveCamera({ center, zoom: deriveZoom(points) })`. Google `fitBounds` does not animate. Confirm this in Task 4 with reduced motion emulated, and if it does animate, note it in the PR.
- Effect deps: `[map, activePin, frameSig, preview?.id]` (replaces `pinsSig`).

- [x] **Step 1: Failing test** `frameSig`: `frameSig([pinA,pinB],[])` → `'a|b'`, `frameSig([], [{lat:1,lng:2}])` → `'fallback:1,2'`, and `frameSig([], [])` → `''`. Run `pnpm vitest run src/lib/map-helpers.test.ts` → FAIL.
- [x] **Step 2: Implement** `frameSig`, then the wiring above. Run the tests → PASS.
- [x] **Step 3: Gates** `pnpm typecheck && pnpm lint && pnpm test` (tail -3 each) → clean.
- [x] **Step 4: Commit** `feat(map): reveal-only pin focus, preview framing, empty-day map, reduced-motion Google camera [TP-0095]`

### Task 4: Verify in the real app

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Open trip `79efe162-dfb2-46c2-ad46-a34695771b8b` with Playwright at 1440×900.
- [ ] Day 1 framed. Click a pin that is fully inside the map → **no camera move** (compare `map.getCenter()` before and after via `browser_evaluate`, or screenshots). Its card opens fully visible.
- [ ] Zoom in so a pin sits off-screen or under the top edge, then click its list row → the map pans just enough. The pin lands inside the safe area with its card unclipped, and the other pins move by the same delta (no zoom change).
- [ ] Search a place near the day's stops → the preview and all of the day's pins are framed, and the preview card is fully visible above its pin. Search one in another city (more than 50 km) → it is framed alone, as before.
- [ ] Zoom in to ~16 on part of the day, tap a Google POI in the middle of the map → **zoom unchanged, no move**, preview card fully visible. Tap a POI near the top edge → minimal pan down so the card clears the top, zoom unchanged (Review Focus 6). Then tap a stop's pin → the camera returns to the pre-preview zoom on that pin (Review Focus 7).
- [ ] With a search preview open, tap a carousel card at 390×844 (`select`) → same exit-to-pin behaviour as a pin click (Review Focus 7).
- [ ] Empty day. Use one in the test trip if it has one. Otherwise create a throwaway 3-day trip in the UI with places only on Day 1. Switch to Day 2 → the map shows Day 1's area and the note `No places on Day 2 yet · showing Day 1`. Switch to Day 3 → the note updates (Review Focus 4). A trip with no located places → placeholder, no Tokyo.
- [ ] `browser_emulate_media({ reducedMotion: 'reduce' })`, then repeat the off-screen row click and a preview → the camera jumps without a slide.
- [ ] At 390×844 in full-map, swipe the carousel to an off-screen stop → minimal pan above the strip, no card clearance (the card is hidden), and the empty-day note hidden (the strip shows its message).
- [ ] `MAPS_PROVIDER=open` (MapLibre): repeat the pin-click and preview checks.

### Task 5: Docs

- [x] `AGENTS-INDEX.md`, Map section. Add `lib/map-camera.ts` (`toViewPx`, `offsetCenter`, `revealPan`, `activeSafeArea`, `previewSafeArea`, `previewPadding`; unit-tested). Extend the `map-helpers.ts` line with `initialCamera`, `emptyDayFallback`, `emptyDayNote` and `frameSig`. Update the `map-preview.ts` line (`mapFocus(FocusInput)`, `PREVIEW_FRAME_MAX_M`, `POI_PREVIEW_OWNER`). Update the `map-active-focus-*` row to "reveal-only pin/POI focus, search-preview framing, empty-day fallback, reduced-motion Google moves".
- [x] `REQUIREMENTS.md` §10: add one bullet: "Camera: selecting a stop moves the map only if the stop is outside the visible area (minimal pan); a search preview frames the day's stops with it (alone if > 50 km away); a tapped map POI is only brought into view (no zoom change); an empty day shows the previous day / upcoming stay / whole trip; no animated pans under reduced motion."
- [x] `docs/ops/maps-cost-guardrails.md:146-147`: the "remounts (a day with no pins, …)" example is gone (empty days keep the map mounted); say instead that empty days render the map framed on a fallback, which can add one load for a session that only ever opens an empty day.
- [x] Commit `docs: map camera rules [TP-0095]`

---

## Not done here (judged not worth it in this PR)

- **§7.3 day-switch `maxZoom 15` + `top:72` padding on desktop:** TP-0076 already tuned the day fit, and changing 14→15 churns every existing frame for little gain.
- **M4 faint dashed line "nearest stop → preview":** this belongs with the route-polyline plan (MAP-03), which introduces the polyline layer. The distance label already ships (`formatNear`, TP-0077).
- **M12 last step, "geocode the trip destination":** it needs a billed geocode, and the trip has no structured destination. A trip with no located place keeps the placeholder instead.
- **Antimeridian-spanning days:** `pinBounds` and the projection assume no ±180° wrap, the same as today.

## Cross-plan (resolved during scrutiny, see `2026-10-29-map-camera-rules.scrutiny.md`)

- **`map-pin-redesign` (MAP-02):** it moves pins to bottom anchors and raises popup offsets (active card 18 → 62 px, preview 22 → 52 px, its `pinPopupOffset`). Whichever of the two lands second sets `ACTIVE_CARD_CLEARANCE.top` to 330 and `PREVIEW_CARD_CLEARANCE.top` to 370 (card height + new offset) and updates the two Task 2 tests that use them. Bottom-anchored drops also reach 44–60 px above their coordinate, so the same PR raises the non-strip reveal/fit top padding from 48 to 64 (`fitPadding(false).top`; the strip's 72 already clears it), as the pin-redesign scrutiny asks. `PREVIEW_OFFSET_Y` is still used by the far-preview `preview` kind, so pin-redesign's fallback to 150 stands. No other overlap (different lines in both canvases).
- **`map-day-bar-ghost-pins`:** it deletes the top-left `data-map-day` chip and renders `MapDayBar` from `PersistentMap` on every day. This plan therefore puts the empty-day note in the bottom-left slot, not the top-left overlay. With both merged, an empty day shows the bar (top-left) and the note (bottom-left). Either order works.
- **`map-trip-overview`:** it feeds `ActiveFocus*` with overview points and `pinsSig`. After this plan, it passes `frameSig={frameSig(overview.points, [])}` and `fallback={[]}`, and its `canRenderMap` addition goes into the new expression from Task 3. In overview a search preview may hit `preview-fit` with the whole trip; that is acceptable (it frames everything plus the preview).
- **`map-hover-sync`:** same canvases, different regions (markers/popups vs initial camera, `ActiveFocus` props and the bottom-left overlay). Either order.

# Scrutiny: map camera rules

Plan: [2026-10-29-map-camera-rules.md](2026-10-29-map-camera-rules.md). Traced against `main` @ `6f6f7a2`.

## Intent

Stop the trip map from moving when the user picks something they can already see, frame search previews with the day, and never show Tokyo on an empty day. Also stop animated Google pans under reduced motion.

### Simpler alternatives considered

- **`getBounds().contains(pin)` instead of pixel math.** This works for "is it on screen" but cannot express the safe area: 240 px of carousel, or 280 px of card clearance. Converting those to degrees needs the projection anyway. The plan's `lib/map-camera.ts` is about 40 lines of pure Web Mercator and unit-tested. **Kept.**
- **`OverlayView.getProjection().fromLatLngToContainerPixel` (Google).** This is exact, but it adds an overlay to the map's lifecycle (`onAdd`/`draw`, `reuseMaps` cleanup) just to read one projection. On a flat camera, `center`/`zoom`/`getDiv()` size plus `256·2^zoom` give the same numbers. Fractional vector zoom is fine too. The one case where they differ is tilt/heading, and that now falls back (finding 4). **Rejected.**
- **On a reveal, centre the pin (panTo) instead of a minimal pan.** This is simpler, but §7.3 asks for the minimal move, and the minimal pan is one function. **Kept the plan.**
- **Split the empty-day map into its own PR.** It shares the `mapFocus` refactor, `initialCamera` and `frameSig`. Splitting it would mean touching the same lines twice. **Kept as one PR.**

## Findings

### 1. Major: a tapped map POI (TP-0077) would zoom out to frame the whole day. **Applied.**

- **Finding:** the plan sends every preview through `preview-fit`, including `ownerId: 'poi'` previews from `use-poi-preview.ts:17,74-77`.
- **Why it matters:** the user taps a POI that is already on screen, often zoomed in at 15–17 next to a stop. `fitBounds(day ∪ POI)` then zooms out to frame a day that can span 10 km. That is the context loss this plan exists to remove. §7.3 only specifies `fitBounds` for search results ("ดูตัวอย่างผลค้นหา").
- **Evidence:** `onPoiClick` → `setPreview({... ownerId: OWNER})` → `PersistentMap` `preview` → canvas `preview` → `ActiveFocus*` `preview?.id` dep → `mapFocus` → `preview-fit` whenever a stop is within 50 km. That is the normal case for a POI next to the day.
- **Change (applied):** new `POI_PREVIEW_OWNER` constant, `FocusInput.preview.fromMap`, a new `preview-reveal` outcome, and `previewSafeArea(pad)`. A tapped POI is revealed with preview-card clearance: no zoom change, usually no move. Added tests, Review Focus 6 and Task 4 checks.

### 2. Major: the empty-day note sits in the overlay the day-bar plan deletes. **Applied.**

- **Finding:** Task 3 put the note inside the top-left `data-map-day` overlay and changed `.overlayTl` to a column.
- **Why it matters:** `2026-10-29-map-day-bar-ghost-pins.md` (Task 2) removes that chip and `dayLabel` from both canvases. Whichever plan lands second would lose the note or reintroduce a dead overlay.
- **Evidence:** day-bar plan lines 126-132, "remove the `dayLabel` param and the chip at `:195-198`" / `:171-174`.
- **Change (applied):** render the note in the bottom-left `data-map-dist` slot instead of the distance chips. An empty day has nothing to show there. Full-map already hides that slot (`globals.css:293-296`), where the carousel shows its own empty message (`map-stop-carousel.tsx:130-136`). The `map-canvas.module.css` edit is dropped from Touches.

### 3. Major: the billing claim for empty days had the wrong reason and missed one case. **Applied.**

- **Finding:** "adds no load, because the Google canvas is latched once visible". The latch (`everVisible`, `real-map-canvas-google.tsx:34-38`) lives inside a component that unmounts today on every empty day (`persistent-map.tsx:106,135`). What actually prevents a second load is `reuseMaps` (`docs/ops/maps-cost-guardrails.md:145-150`).
- **Why it matters:** there is one new billed load. A desktop session that opens the itinerary on an empty day and never visits a located day sees a placeholder today and creates no `google.maps.Map`. After this change it creates one. That is at most 1 load per page session, so it is small but real. It is not "no load".
- **Change (applied):** corrected the text in Decision 1 and Global Constraints. Task 5 also updates the guardrails sentence that cites "a day with no pins" as a remount example.

### 4. Nit: flat-camera assumption for the Google projection. **Applied.**

- **Finding:** `toViewPx` from `getCenter`/`getZoom`/div size is exact only at tilt 0 and heading 0. Tilt and rotate gestures are off by default and the app never sets them. A Map ID can enable them, though.
- **Change (applied):** if `getTilt()` or `getHeading()` is non-zero, reveal falls back to today's `panTo`. The rest of the plan's math checks out. The `offsetCenter` round trip, the `panBy` sign (positive dx moves the centre east and the content west, the same for Google and MapLibre `panBy`), and the `revealPan` and `previewPadding` numbers in the tests all hold. Spot-checked: (400,100) with clearance → dy −180; the 200×200 collapsed rect → (−50,−50); 390×844 strip → sides 135, height 264 ≥ `MIN_SAFE`; 390×600 → `null`.

### 5. Nit: the intermediate commit after Task 1 regressed previews. **Applied.**

- **Finding:** after Task 1, `mapFocus` returns `preview-fit`, but `ActiveFocus*` only learns that kind in Task 3. The unknown kind falls through to the day fit (`map-active-focus-google.tsx:81-104`).
- **Change (applied):** Task 1 Step 3 maps `preview-fit`/`preview-reveal` to the existing preview move until Task 3.

### 6. Nit: types. **Applied.**

- `nearestStop(pins: Pin[])` (`map-preview.ts:158`) does not accept `FocusInput.pins: readonly Pin[]`. Widen it.
- `LatLng` would exist three times: in `map-renderer-props.ts:8`, privately in `map-preview.ts:145`, and as the new one in map-helpers. Now there is one, in map-helpers, re-exported from the other two.

## Verified as claimed

- **`mapFocus` migration keeps every existing case.** All 11 `mapFocus` tests (`map-preview.test.ts:63-85`) use `pin = {1,2}`. Every preview in them is `{5,6}`, about 630 km away, so it stays `kind:'preview'`. `'nothing → fit'` keeps `fit` with `pins:[pin]`. The new tail (`pins.length → fit`, then fallback, then stay) only differs when `pins` is empty. Today that path also exits without a move (`map-active-focus-google.tsx:88`), and `savedZoom` is cleared in both versions. Added a rule to Step 1: a migrated case may not need a new expected value.
- **`centroid` callers.** There are exactly five (`grep`): `map-active-focus-google.tsx:101`, `map-active-focus-maplibre.tsx:82`, `real-map-canvas-google.tsx:95`, and `real-map-canvas-maplibre.tsx:38`, plus `deriveZoom` at `real-map-canvas-google.tsx:74`. The plan covers all of them, so the nullable `centroid` typechecks.
- **TP-0076 carousel.** `select` (replace, never toggles) and `activate` (push, toggles) both only set `shownPlaceId` (`persistent-map.tsx:84-104`), so `ActiveFocus` sees the same `activeChanged` either way. `stripVisible` is `hidePinCard` (`real-map-canvas-google.tsx:120`, `-maplibre.tsx:84`), so "strip shown ⇔ no card clearance" is consistent. The day-switch fit (`fitPadding`, `FIT_MAX_ZOOM`) is untouched. Recorded as Review Focus 7.
- **Reduced motion.** MapLibre's `easeTo`/`flyTo` check `browser.prefersReducedMotion` (`maplibre-gl/src/ui/camera.ts:851,1337`), and `panBy`/`fitBounds` route through them. On Google, `moveCamera` is instant. The "Google `fitBounds` might animate" case is left to the Task 4 check, which is reasonable because §7.3 only names `panTo`.
- **Empty-day mount.** `canRenderMap` (`persistent-map.tsx:106`) currently unmounts the canvas on empty days. That also disables POI taps and the viewport bias, because `clearMapViewport` runs at `:122-124`. With the fallback the map stays mounted, and `frameSig` correctly refits on empty→empty switches with different fallbacks (Review Focus 4). Note that two consecutive empty days with the same fallback do not refit, which is correct (same frame).

## Left for the user

- Decision 1 (map on empty days) and Decision 2 (50 km) stay as the plan's defaults. They are product calls, and finding 3 now states the cost precisely.

## Cross-plan

- **`map-pin-redesign`:** popup offsets grow (active 62, preview 52). Whichever plan lands second sets `ACTIVE_CARD_CLEARANCE.top` 330 and `PREVIEW_CARD_CLEARANCE.top` 370. Recorded in the plan.
- **`map-day-bar-ghost-pins`:** resolved by finding 2. The note is bottom-left and the bar is top-left, so the plans can land in either order.
- **`map-trip-overview`:** after this plan, it passes `frameSig(points, [])` and `fallback=[]` instead of `pinsSig`. Recorded in the plan.
- **`map-hover-sync`:** no conflict. The two plans edit different regions of the same files.

**Verdict: fix-then-ship (fixes applied).** The biggest issue was that a POI tap would have zoomed the user out of what they were looking at. Now it only reveals the POI.

## Cross-plan (from the map-pin-redesign scrutiny, 2026-10-29)
- Bottom-anchored drops reach 44px above their coordinate (54px + a 6px ring when active). A day fit with `top: 48` (`fitPadding`, `lib/map-helpers.ts`) can crop the top pin. Consider ≥ 64 when this plan lands after pin-redesign.
- Pin-redesign's Task 5 now falls back to `PREVIEW_OFFSET_Y = 150` if the preview card clips. If this plan replaces that constant with `PREVIEW_CARD_CLEARANCE`, it supersedes that fallback.

## Cross-plan (appended by the day-bar / overview scrutiny)
- **Day-bar** now drops `dayLabel`, the `data-map-day` overlay and `.overlayTl` outright, relying on this plan's move of the empty-day note to the bottom-left. Both plans land in either order.
- **Trip-overview** passes `frameSig(overview.points, [])` / `fallback={[]}` to `ActiveFocus*` once this plan has merged.

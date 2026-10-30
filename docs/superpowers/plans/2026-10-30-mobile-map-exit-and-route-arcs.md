# Mobile map exit + brand route arcs — Implementation Plan

> **Tickets:** Part A = **TP-0116** (mobile full-map exit) · Part B = **TP-0117** (route arcs).
> **Origin:** owner testing on prod, 2026-10-30, after the design roadmap (#92–#123):
> 1. "mobile map view ไม่มีวิธีกลับออกจาก map view, และต่อให้เป็น bottom sheet ที่ต้องลากขึ้นมา ก็จะ conflict กับ os nav ของ android/ios"
> 2. "เส้นที่ลากใน path (leg) … ไม่สวยเลย ไม่เข้ากับดีไซน์เลย"
>
> **Decisions (owner, 2026-10-30):**
> - **D-A:** exit = floating "← List" button **top-left** in full-map + the OS/browser **Back** closes the map (not the trip). The bottom List/Map pill stays in list mode only.
> - **D-B:** lines = **thin curved arcs in one brand colour** for every mode; no dashes, no arrows; the mode shows as a **small icon badge at the arc's middle**. Still self-drawn from stored coords (no Routes/Directions API, no new SKU).

> **Scrutiny:** [2026-10-30-mobile-map-exit-and-route-arcs.scrutiny.md](2026-10-30-mobile-map-exit-and-route-arcs.scrutiny.md): fixes #1–#10 are applied below; #11 is left for the owner.

**Goal:** (A) a phone user in full-map can always see and reach a way back to the list, and Back does what they expect; (B) the day route reads as a calm, on-brand overlay instead of blue/green dashed straight lines cutting across the city.

**Tech:** Next.js 16 App Router (patched `history.pushState` keeps custom keys: `copyNextJsInternalHistoryState`, `node_modules/next/dist/client/components/app-router.js:84,252`), React 19, `@vis.gl/react-google-maps` 1.8.3 (`Polyline`, `AdvancedMarker`), `react-map-gl/maplibre` 8.1.3 (`Source`/`Layer`/`Marker`), vitest.

**Guards that apply:** i18n lint (all `src/`, new strings need en + th keys), raw-colour ratchet (`hex-ok` only on parity-tested mirrors), 12px floor, motion tokens, dialog guard, map-tokens parity test.

---

## Part A — Mobile full-map exit (TP-0116)

### Root cause (verified in browser, 390×844, HEAD 83fd859)

- The only exit is the List/Map pill (`components/map-panel-toggle.tsx`), which in full-map is moved to `bottom: calc(16px + env(safe-area-inset-bottom))` (`app/globals.css:359-361`). On real phones that strip is the OS gesture area / Safari's bottom toolbar: the pill is hidden behind the toolbar or a swipe there triggers the OS gesture. (`app/layout.tsx` sets no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is 0 in the browser.)
- Header and bottom nav are hidden in full-map (`globals.css:335-339`), so nothing else leads out.
- `fullMap` is plain React state (`map-preview-context.tsx:42`), not in history: OS Back leaves the trip entirely.

### Design

- **List mode (unchanged):** the pill at `bottom-20` above the bottom nav. Its "Map" button opens full-map.
- **Full-map:** the pill is **hidden**. A new floating button, **top-left**, `top: calc(12px + env(safe-area-inset-top))`, `left: 12px`: back-chevron icon + label "List" (th "รายการ"), `aria-label` "Back to list" (th "กลับไปที่รายการ"), min 44×44, `bg-surface`, border, `shadow-[var(--shadow-md)]`, rounded-full. That is the same visual language as the carousel day switcher. z above map overlays (same `z-[60]` as the pill). The top-right corner keeps the degraded chip (`overlayTr`), so there is no collision.
- **Carousel:** **keep** `bottom: calc(82px + env(safe-area-inset-bottom))` (`map-stop-carousel.tsx:120`) and only rewrite its comment: it now clears the browser's bottom chrome and the OS gesture strip, not the pill. *Scrutiny #5:* the root cause above says the bottom ~16px strip is lost behind Safari's toolbar or the gesture area. `env()` is 0 here (no `viewport-fit=cover`), so moving the map's main control to 24px would put it back in that strip. Lower it only after the A8 real-device check shows the strip is clear.
- **History:** opening full-map on a phone pushes one same-URL entry tagged `{ tpFullMap: 1 }`. Back from it lands on the untagged list entry, and a `popstate` listener closes the map. **Ownership is a ref, not the tag** (*scrutiny #2*): every router commit rewrites `history.state` without custom keys (`HistoryUpdater`, `app-router.js:51-67`; `preserveCustomHistoryState: false` for navigate and refresh, `segment-cache/navigation.js:382`). That includes a pin tap, a swipe, a day switch, and `router.refresh()` after an add, so the tag is gone after the first in-map action. "← List" therefore calls `history.back()` whenever the provider's `owns` ref is set, so the stack stays clean; it closes directly only when we never owned an entry (md+, or after an unmount close). The tag is kept only as a "don't push twice / ignore a stale tagged entry" marker.
- **In-map navigation must not stack entries on phones:** pin taps call `router.push` today (`persistent-map.tsx:102`). With full-map open below md they use `router.replace` instead, so Back exits the map instead of walking through pins. The carousel swipe and day switch already replace (`persistent-map.tsx:112`, `map-stop-carousel.tsx:112`).
- **URL sync on Back:** replace-navigations inside the map change `?day=&placeId=` on the tagged entry only. Back restores the list entry's **older** URL, so the list would show the day the user left, not the one they were looking at. The fix: the provider keeps `lastMapHref` (updated while full-map is open). On the closing `popstate`, it reads `syncTo` synchronously and, if it differs from the landed `location.pathname + location.search`, calls `router.replace(syncTo, { scroll: false })` **in a `setTimeout(…, 0)`**. *Scrutiny #1:* Next's own `onPopState` dispatches `ACTION_RESTORE` in the same event, and a later NAVIGATE/RESTORE discards a pending one (`app-router-instance.js:143-146`). If our replace were dispatched first, which happens whenever our listener registered before AppRouter's (e.g. a hard load), Next's restore to the old URL would silently win. Deferring guarantees ours is dispatched last. Result: Back from map → list shows the same day/stop the map showed, after a possible one-round-trip flash of the old day (the restore commits first from cache; *scrutiny #6*, checked in A8).

### Tasks

- [ ] **A1 — `lib/full-map-history.ts` (pure, tested).** `FULLMAP_KEY = 'tpFullMap'`; `isFullMapEntry(state: unknown): boolean`; `closeAction({ landedState, owns, lastMapHref, currentHref }): { close: boolean; syncTo: string | null }`. It closes when `owns` is true and the landed entry is untagged. `syncTo` = `lastMapHref` when it differs from `currentHref`; both are `pathname + search` strings. Tests: not owned → no close; tagged landing (stale entry) → no close; owned + untagged → close; owned + null/foreign state → close; same href → `syncTo` null; different href → `syncTo` = lastMapHref.
- [ ] **A2 — provider (`components/map-preview-context.tsx`).** Replace the raw `setFullMap` in the context value with the functions below. Refs `fullRef`, `owns` and `leaving` are set **synchronously** in these functions, not in effects. `openFullMap` and `closeFullMap` are `useCallback(…, [])` and read only refs, so their identity never changes. *Scrutiny #4:* the `MapPanelToggle` unmount cleanup depends on that identity; an unstable `closeFullMap` would close the map right after it opens.
  - `openFullMap()`: `fullRef = true`; `setFullMap(true)`. On phones (`!matchMedia('(min-width: 768px)').matches`): if the current entry isn't tagged, `history.pushState({ ...history.state, [FULLMAP_KEY]: 1 }, '')`. There's no URL arg; the spread carries `__NA`, so Next's patched `pushState` passes it straight through (`app-router.js:255-256`) and never calls `applyUrlFromHistoryPushReplace`. Then `owns = true`, whether we pushed or reused an already tagged entry.
  - `closeFullMap(opts?: { viaHistory?: boolean })` (default `viaHistory: true`):
    - If `viaHistory && owns`, set `owns = false` and `leaving = true` **before** `history.back()`. The popstate handler then does the close, and a double tap can't walk back twice (*scrutiny #3*).
    - Otherwise set `owns = false`, `fullRef = false`, and call `setFullMap(false)`.
  - A `popstate` listener (mounted once):
    - Return unless `fullRef` and `owns || leaving`.
    - `const { close, syncTo } = closeAction({ landedState: e.state, owns: true, lastMapHref, currentHref: location.pathname + location.search })`. If `!close`, return.
    - Clear `owns` and `leaving`, set `fullRef = false`, `setFullMap(false)`.
    - If `syncTo` and still a phone, `setTimeout(() => router.replace(syncTo, { scroll: false }), 0)`. That runs after Next's `ACTION_RESTORE`; see Design and *scrutiny #1*.
  - `lastMapHref` ref: an effect keyed on `usePathname()` + `useSearchParams()` writes `location.pathname + location.search` while `fullRef`. Read `location`, not `searchParams.toString()`, so it compares like-for-like with `currentHref`.
  - Keep `fullMap` and export `setFullMap` only through the new functions. Update the context type and default value. `body[data-fullmap]` mirroring is unchanged.
  - Unmount: the existing `MapPanelToggle` cleanup becomes `closeFullMap({ viaHistory: false })`. Leaving the itinerary by a link must not call `history.back()`. The stale tagged entry left behind is harmless: the next `openFullMap` reuses it, and landing on it with the map closed does nothing.
- [ ] **A3 — callers.** `map-panel-toggle.tsx`: Map → `openFullMap()`, List → `closeFullMap()`. Use arrow handlers, never `onClick={closeFullMap}`, which would pass the event as `opts`. In full-map the component renders the back button (A4) instead of the pill, so drop the `globals.css:359-361` override. `place-search-picker.tsx:182` ("View on map") → `openFullMap()`. Grep for any other `setFullMap(`; only those two exist at HEAD.
- [ ] **A4 — back button, rendered by `MapPanelToggle`** (*scrutiny: simpler alternative*). When `fullMap`, `MapPanelToggle` returns `<div data-map-toggle className="fixed left-3 top-3 z-[60] md:hidden">` wrapping the button (top `calc(12px + env(safe-area-inset-top))` if set inline). It does not mount a second component in `page.tsx`. Reusing `data-map-toggle` means the `body[data-fullmap='1'] > div > div:not([data-map-toggle])` height rule (`globals.css:344`) already skips it, with no selector change. Without that, a 100dvh-tall wrapper would block taps down the left edge of the map. The button can live in `components/map-back-to-list.tsx` as a presentational piece if `map-panel-toggle.tsx` gets long. Icon: add `ChevronLeft` to `components/icons.tsx` (none exists; same 24-box, `strokeWidth={1.6}` style). Don't use a `←` glyph: it isn't in the i18n lint's `allowedStrings` (`eslint.config.mjs:56-61`).
- [ ] **A5 — pin tap replaces on phone full-map.** `persistent-map.tsx:102` `activate()`: `if (fullMap && !isWide) router.replace(href, opts); else router.push(href, opts);`, with a comment that Back must exit the map, not walk through pins.
- [ ] **A6 — carousel comment only** (see Design; the offset stays at 82px pending the device check).
- [ ] **A7 — i18n** (`app/src/messages/{en,th}.json`). Reuse the existing `map_view_list` ("List" / "รายการ") for the visible label. Add only `map_back_to_list_aria` = "Back to list" / "กลับไปที่รายการ". The accessible name contains the visible "List", per WCAG 2.5.3.
- [ ] **A8 — browser check, 390×844, Google mode at :3210:**
  1. Map → back button visible top-left; the pill is gone; the carousel sits where it was.
  2. "← List" returns to the list, and `history.length` hasn't grown net.
  3. Map → tap pin 2 → swipe the carousel → switch to Day 2 → `history.back()` → list mode showing Day 2 with the swiped stop, and the trip is still open. **Run it twice:** after a hard load of the trip URL, and after client-navigating from home (the listener order differs; scrutiny #1). Note whether the list visibly flashes the old day before settling (scrutiny #6).
  4. Same as 3, but exit with **"← List"** instead of Back. Then one Back leaves to home: no dead press, no rewind to the pre-map day (scrutiny #2).
  5. Double-tap "← List" quickly: the trip stays open (scrutiny #3).
  6. Back again leaves to the previous page (home), as before.
  7. "View on map" from search opens the map, and Back closes it. Add the previewed place from the map card, then "← List": the new place is in the list, and one Back leaves.
  8. md+ (1280): no push, and pin taps still push (unchanged).
  9. MapLibre degrade (`gm_authFailure()`): same.
  10. **Real devices** (iOS Safari + Android Chrome with gesture nav): the back button is reachable, the OS back gesture closes the map, and the carousel isn't under the browser's bottom bar. Decide here whether the carousel can drop lower than 82px (scrutiny #5).
- [ ] **A9 — docs.** REQUIREMENTS §10: add a bullet saying that mobile full-map has a top-left "List" button, that OS/browser Back closes the map (not the trip), and that in-map pin taps don't add history entries. AGENTS-INDEX rows for `map-preview-context.tsx` (`openFullMap` / `closeFullMap`, history entry) and `map-panel-toggle.tsx` (pill in list mode, back button in full-map), plus `lib/full-map-history.ts`.

### As built (A, 2026-10-30)

- **The list entry is tagged too (`LIST_KEY = 'tpMapList'`).** In the browser, Next restores the list entry and re-renders *before* any `popstate` listener runs: the restore `replaceState` was logged ahead of our handler even with a capture-phase listener. So the `[pathname, searchParams]` effect had already overwritten `lastMapHref` with the old URL, and the sync never fired. `openFullMap` now `replaceState`s the current entry with `tpMapList: 1` before pushing the map entry, and the effect skips recording while `history.state` carries that tag. Restores keep custom state, so the tag survives.
- **The `leaving` ref.** A second "List" tap while our `history.back()` is in flight is a no-op, and a popstate caused by our own back always closes the map.
- **Mobile fit padding top 72 → 120** (`MOBILE_FIT_TOP`, `lib/map-helpers.ts`). The 44px button at 12px inset plus a pin's ~60px height above its coordinate would otherwise collide on a day fit.
- **Verified at 390×844 on Google :3210, after both a hard load and a client-nav from home:**
  - Pin tap, next day, then Back leaves the list on `?day=1`.
  - In-map actions, then a double-tap on "List": the list shows the map's day, and one Back returns to `/`.
  - Pin tap and carousel actions don't grow `history.length`.
  - At 1280, pin taps still push and nothing is tagged.
- **Not checked here:** "View on map" from search, which uses the same `openFullMap`; the MapLibre degrade; real devices (A8.10, owner).

### Review focus (A)

- Next's `HistoryUpdater` replaces the state on every commit. The tag survives `openFullMap`, since no router commit follows (verified in scrutiny). It is **dropped by the first router commit** (replace, refresh, server-action revalidation), which is why "← List" uses the `owns` ref, never `isFullMapEntry(history.state)`.
- The sync `router.replace` must be dispatched after Next's `ACTION_RESTORE` (`setTimeout 0`). Never call it synchronously in the popstate handler.
- A `popstate` with `event.state == null` is ignored by Next. Ours still runs, which is fine.
- Double close: "← List" clears `owns` and sets `leaving`, then calls `history.back()` → popstate → `setFullMap(false)`. There's no `setFullMap` in the click path, and a second tap is a no-op.
- `openFullMap` and `closeFullMap` keep a stable identity (refs only), or the `MapPanelToggle` unmount cleanup fires on open.
- A phone rotated to ≥768px while in the map: the map closes via existing CSS (md+ layout), and the tagged entry remains. The sync is gated on phone width so a desktop Back isn't replaced. Acceptable; note only.

---

## Part B — Brand route arcs (TP-0117)

### What exists (HEAD)

- `lib/map-route.ts`: `routeStyle(mode)` gives per-mode colour + dash; `googleDash`; `legsGeoJSON` builds straight two-point LineStrings; arrow bitmaps for MapLibre.
- `components/map-route-google.tsx`: per leg, a white casing `Polyline` plus a dashed line drawn as repeated symbols, `geodesic`, and a `FORWARD_CLOSED_ARROW` at 50%.
- `components/map-route-maplibre.tsx`: one source with casing, line (data-driven dasharray) and arrow-symbol layers.
- Colours: `MODE_COLOR` / `ROUTE_NONE_COLOR` / `ROUTE_CASING_COLOR` in `lib/map-helpers.ts`, mirrored by `--map-route-*` in `globals.css:121-125` (parity-tested in `lib/map-tokens.test.ts`). **`--map-route-walk/drive/transit` are also used by the itinerary list's leg chips** (`itinerary-list.module.css:123-131`). Keep those tokens.

### Design

- **Geometry:** each leg becomes a quadratic Bézier arc from A to B. The control point is the midpoint offset **to the left of the travel direction** by `ARC_BEND = 0.18 × |AB|`, computed in Web-Mercator space (so the curve looks the same at any latitude): `x = λ`, `y = ln tan(π/4 + φ/2)` (radians, y north-up), left normal = `(-dy, dx)/|d|`. It is sampled at `ARC_SEGMENTS = 32` points and then unprojected. Guard `|AB| = 0` by returning `[a, b]`. `dayLegs` already drops < 10 m legs (`day-augment.ts:164`), but `arcPath` must not divide by zero. Output longitudes stay **unwrapped**: MapLibre needs the continuity, Google's `LatLngLiteral` wraps them itself, and non-geodesic segments take the short way. Bending to the left of travel means A→B and B→A curve apart instead of overlapping (out-and-back days stay readable). Normalise B's longitude to within ±180° of A's, so a leg crossing the antimeridian takes the short way.
- **Style:** one colour, the new token `--map-route: #0f766e` (brand teal; equals `--map-pin-sight`), mirrored as `ROUTE_COLOR`. Width **3px**, solid, round caps/joins, line opacity 0.9. White casing **6px** at 0.9 opacity. No dashes, no arrows, for every mode including `none`. Google: `geodesic={false}`, because the arc is already the shape.
- **Mode badge** at the arc's t=0.5 point, only for legs with a stored mode (`walk|drive|transit`): a 22px circle, white fill, 1.5px `--map-route` ring, a 12px mode icon (`Walk` / `Drive` / `Transit` from `components/icons`, the same icons the segment and day mode pickers use) in `--map-route`. `aria-hidden`, `pointer-events: none`, z-index below every pin. It takes the z-scale's existing **"route label 5"** slot (`lib/map-pin.ts:43`) as `ROUTE_BADGE_Z_INDEX = 5`, above ghosts (1) and below pins (10); export it and keep the comment in sync. Both renderers set it explicitly, since "every marker sets one" (`map-pin.ts:42`). Google: `AdvancedMarker` with `anchorPoint={AdvancedMarkerAnchorPoint.CENTER}`, `clickable={false}` and `zIndex={ROUTE_BADGE_Z_INDEX}`, with no `title` and no `onClick`, content a plain div. Verified in 1.8.3: non-clickable content never gets `pointer-events: all`, so taps pass through. MapLibre: `<Marker anchor="center">` with `style={{ pointerEvents: 'none', zIndex: ROUTE_BADGE_Z_INDEX }}`. One shared presentational component, `components/map-route-badge.tsx`, using CSS-module classes (no hex).
- **Short legs** (< ~40px on screen, e.g. two stops in the same block): the badge would cover both pins. Skip the badge when `|AB|` < `ARC_BADGE_MIN_M = 300` m (geo distance via `metersBetween`, `lib/map-preview.ts:180`, a renderer-agnostic proxy). The arc is still drawn. *Scrutiny #11 (owner/implementer):* 300 m is about 60px at z15 but about 8px at z12. If B7.2 looks busy at city zoom, gate on the projected length instead (Mercator length × 256·2^zoom).

### Tasks

- [ ] **B1 — `lib/map-route.ts` rewrite (TDD).**
  - Remove: `routeStyle`, `googleDash`, the arrow helpers (`ARROW_*`, `arrowBitmap`, `arrowImageId`, `modeFromArrowImageId`, `inTriangle`, `ROUTE_MODES`, `RouteStyle`), and the dash-specific tests.
  - Add: `ARC_BEND`, `ARC_SEGMENTS`, `ARC_BADGE_MIN_M`, `ROUTE_OPACITY = 0.9`. Already present: `ROUTE_WIDTH = 3` (unchanged), `CASING_WIDTH` (**7 → 6**), `CASING_OPACITY = 0.9`. Also drop `RouteMode` if nothing imports it after B5.
  - `arcPath(a: LatLng, b: LatLng): LatLng[]` (32+1 points; first = a, last = b; bends left).
  - `arcMid(a, b): LatLng`.
  - `routeArcs(pins, legs): { key; path; mid; mode; showBadge }[]`, which skips missing pins and the zero-length legs already filtered in `dayLegs`.
  - `legsGeoJSON` builds from `routeArcs`.
  - Tests: endpoints exact; the midpoint is left of A→B (`cross(B−A, M−A) > 0` in (lng, lat)) and at ~0.09·|AB| from the chord midpoint (half the control offset); A→B vs B→A mids on opposite sides; antimeridian (lng 179 → −179) stays within ±2° of 180; badge threshold; missing-pin skip.
- [ ] **B2 — tokens** (*scrutiny #9*, resolved at HEAD).
  - `globals.css` `:root`: add `--map-route: #0f766e;` (comment: map line + badge) and **delete `--map-route-none`**. Its only consumer is the `ROUTE_NONE_COLOR` mirror. **Keep `--map-route-walk/drive/transit`**: the list's leg chips use them (`itinerary-list.module.css:123-131`). Rewrite the `globals.css:111-114` comment (it names `MODE_COLOR` / `ROUTE_NONE_COLOR`).
  - `lib/map-helpers.ts`: add `ROUTE_COLOR = '#0f766e'; // hex-ok: mirrors --map-route (parity-tested)`, and **delete `MODE_COLOR` and `ROUTE_NONE_COLOR`**. After B1 their only importers are gone; the chips read the CSS vars directly.
  - `lib/map-tokens.test.ts`: parity for `ROUTE_COLOR` and `ROUTE_CASING_COLOR`, plus `contrast(--map-route, --map-route-casing) >= 3`. That turns the "Contrast" review claim into a test; it is about 5.5:1.
  - The light-lock test already covers the new token.
  - Raw-colour ratchet: no baseline change is expected. `hex-ok` lines are skipped, test files aren't scanned (`test/src-files.ts:16`), and the badge CSS uses `var(--map-route)` and `var(--map-route-casing)`, never a literal `#fff`. Run it to confirm.
- [ ] **B3 — `components/map-route-badge.tsx` + CSS** (in `map-canvas.module.css` or a new small module): `RouteBadge({ mode })` → icon in a ring. Icons are imported, not inline SVG.
- [ ] **B4 — Google renderer** (`map-route-google.tsx`): per arc, a casing `Polyline` (zIndex 1) and a line `Polyline` (zIndex 2, `strokeOpacity` `ROUTE_OPACITY`, no `icons`), both `geodesic={false}` and `clickable={false}`, path = `arc.path` (memoised per key). Badge = `AdvancedMarker` per arc with `showBadge` and a mode, using `zIndex={ROUTE_BADGE_Z_INDEX}`, `clickable={false}` and `anchorPoint={AdvancedMarkerAnchorPoint.CENTER}`. Keep the `overlays` gate in `real-map-canvas-google.tsx:167` unchanged.
- [ ] **B5 — MapLibre renderer** (`map-route-maplibre.tsx`): drop the image resolver effect, the arrow layer and `line-dasharray`. Line paint: `line-color` = `ROUTE_COLOR`, `line-width` = `ROUTE_WIDTH`, `line-opacity` = `ROUTE_OPACITY`, with layout round cap/join on both layers. Badges = `<Marker anchor="center" style={{ pointerEvents: 'none', zIndex: ROUTE_BADGE_Z_INDEX }}>` per arc. The explicit zIndex is **mandatory**, not a fallback: marker DOM order changes as ghosts remount (`real-map-canvas-maplibre.tsx:136`), so insertion order can't be relied on.
- [ ] **B6 — docs.**
  - Rewrite `REQUIREMENTS.md:298` wholesale, not just the word "dashed": its "straight dashed", "colored by leg mode", "grey dotted" and "direction arrow mid-leg" clauses all go. It should describe one brand-colour curved arc per leg with a white casing, and a mode badge at mid-arc for legs with a stored mode ≥ 300 m. The < 10 m / missing-coords skip and "never take clicks" stay.
  - `components/ui/README.md:28`: `--map-route-walk/drive/transit` are now "itinerary segment icons" only; add a `--map-route` row.
  - AGENTS-INDEX: the `map-route-*.tsx` row (`:222`), the `map-helpers` / `map-route` / map-tokens lines (`:237,239,241`), and the `map-route.ts` lib row (`:363`). Add a row for `map-route-badge.tsx`.
- [ ] **B7 — browser check (Google :3210 + MapLibre degrade), 1280 and 390:**
  1. The Tokyo test trip: arcs teal, smooth, meeting the pin tips.
  2. Badges sit at the mid-arc, under pins, and are not clickable (a pin tap still works when a badge overlaps it).
  3. An out-and-back leg pair curves apart.
  4. Pins and POI taps are unaffected.
  5. A day switch leaves no stale arcs or badges.
  6. A dark-theme switch on MapLibre still works with no image-missing console errors.
  7. Screenshot before/after for the owner.

### As built (B, 2026-10-30)

- **One `routeArcs` call per renderer.** `legsGeoJSON` takes `routeArcs` output, so MapLibre computes each arc once and uses it for both the lines and the badges. Each renderer memoises on `(pins, legs)`, which are stable per day.
- **Verified on Google :3210 at 1280 and 390:**
  - Teal arcs and badges render; out-and-back legs curve apart (Day 2, Fuji).
  - Badges sit under the pins: `pointer-events: none` on the badge.
  - A map drag that starts on a badge still pans the map.
- **Verified on the MapLibre degrade (`gm_authFailure()`):** arcs and badges render, with no image-missing console errors.
- **Not checked:** a zoom-dependent badge cutoff (scrutiny #11). 300 m was left as is.

### Review focus (B)

- Performance: 33-point arcs × ≤ ~20 legs/day is trivial; `useMemo` per leg keeps Google polylines from being re-created on hover re-renders.
- Badge vs pin overlap on dense days: the threshold plus the lower z-index. Verify visually on the densest test day.
- Contrast: teal #0f766e on a white casing over the basemap passes the 3:1 non-text contrast against the casing (asserted in `map-tokens.test.ts`, B2). The badge ring and icon on white match the AA token.
- Arc bulge (≤ 9% of a leg) can poke past the `fitBounds` padding on legs along the frame edge. Check in B7.1.
- Owner eyes (scrutiny #11): `--map-route` equals `--map-pin-sight`, and the list chips stay mode-coloured. Show both in the B7.7 before/after.

---

## Shipping

Two PRs, serial (main requires up-to-date branches): **A first** (user-blocking on phones), then **B**. Each runs the gates `pnpm typecheck && pnpm lint && pnpm test`, then the browser check, then a reviewer subagent, then a rebase → CI → merge. Both are pure client/UI changes: no migration and no env change.

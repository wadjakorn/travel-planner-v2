# Scrutiny — mobile map exit + brand route arcs

Plan: [2026-10-30-mobile-map-exit-and-route-arcs.md](2026-10-30-mobile-map-exit-and-route-arcs.md)
Code: worktree `travel-planner-v2-mobile-map-fix` at 83fd859 (Next 16.2.4, `@vis.gl/react-google-maps` 1.8.3, `react-map-gl` 8.1.3).

## Intent

(A) On a phone in full-map, give a visible top-left way back to the list, and make OS/browser Back close the map without leaving the trip. (B) Swap the per-mode dashed straight lines for one-colour curved arcs with a small mode badge. D-A and D-B are owner decisions and are not reopened here.

### Simpler alternatives considered

- **Map flag in the URL (`?map=1`).** Rejected. Only four in-map href sites need it, all through `stopActivateHref` (`persistent-map.tsx:102,112,122`, `map-stop-carousel.tsx:112`), so threading it is cheap. But it buys nothing and costs a lot:
  - `app/trip/[id]/page.tsx` reads `searchParams`, so every open and close becomes an RSC round-trip.
  - Back from `u1&map=1` still lands on the pre-map `u0`. The drift and the sync problem stay exactly the same.
  - Reloading would land in the map, which is a behaviour change.
  The same-URL `pushState` entry is the right tool.
- **Button only, no history.** This violates D-A, because Back must close the map.
- **Render the back button inside `MapPanelToggle` instead of a new mount in `page.tsx`.** Simpler, and **applied**. One component owns both states and the single unmount cleanup. It keeps the `data-map-toggle` wrapper, so the `globals.css:344` height rule already skips it (no selector change). The `globals.css:359-361` full-map pill override goes away because the pill isn't rendered in full-map. A new `map-back-to-list.tsx` stays optional, as a presentational piece only.
- **(B) MapLibre symbol-layer badges with collision.** Rejected. That brings back the image-resolver plumbing that B5 deletes. DOM markers on both renderers through one component is simpler.

## Findings

### 1. Blocker: the URL-sync `router.replace` can be discarded by Next's own Back traverse

- **Finding:** the plan calls `router.replace(syncTo)` inside our `popstate` listener. Whether it survives depends on listener order.
- **Why it matters:** in the exact flow A8.3 tests, the list sometimes comes back on the *old* day. Whether it does depends on how the user reached the trip, so a single manual run can pass while the bug ships.
- **Evidence:**
  - Next's `onPopState` (`app-router.js:284-298`) dispatches `ACTION_RESTORE` synchronously in the same event.
  - `dispatchAction` (`app-router-instance.js:143-146`): a NAVIGATE or RESTORE arriving while another action is pending "takes priority", and the pending one is marked `discarded`.
  - `router.replace` dispatches NAVIGATE synchronously (inside `startTransition`), and it stays pending on its RSC fetch.
  - So if our listener runs first, Next's RESTORE(u0) discards our NAVIGATE(u1). Our listener does run first when the provider's effect registered before AppRouter's, as on a hard load where child effects run before parent effects. Client-navigating from home flips the order.
- **Change:** read `syncTo` synchronously in the handler, then dispatch it **after** Next's handler: `setTimeout(() => router.replace(syncTo, { scroll: false }), 0)`. Add both entry paths (hard load, and client-nav from home) to A8. **Applied (A2, A8).**

### 2. Blocker: "← List" decides by `history.state` tag, but every router commit wipes the tag

- **Finding:** `closeFullMap` calls `history.back()` only "when the current entry is still our tagged one". The tag is dropped by the first router commit after opening. That covers a pin tap (now replace), a carousel swipe, a day switch, and `router.refresh()` after adding a place from the preview or a POI.
- **Why it matters:** after the most common in-map action (a swipe), "← List" falls back to `setFullMap(false)` and leaves the pushed entry behind. The user's next Back is a dead press that also rewinds the list to the pre-map day (RESTORE to E0's URL). A8.2 only checks "← List" with no in-map action, and A8.3 uses `history.back()`, so neither check catches this.
- **Evidence:**
  - `HistoryUpdater` writes `{...(preserveCustomHistoryState ? history.state : {}), __NA, tree}` on every `appRouterState` change (`app-router.js:51-67`).
  - `navigateToKnownRoute` sets `preserveCustomHistoryState: false` (`segment-cache/navigation.js:382`). Refresh routes through it too (`refresh-reducer.js:69-70`).
  - Only traverse preserves custom state (`navigation.js:413`).
  - Refresh callers that can fire in full-map: `place-search-picker.tsx:113`, `use-poi-preview.ts:52`.
- **Change:** track ownership in a ref instead of re-reading the tag. Set `owns` in `openFullMap` (pushed, or reused an already tagged entry). "← List" calls `history.back()` iff `owns`. The popstate close condition becomes `fullRef && (owns || leaving) && !isFullMapEntry(event.state)`. The tag stays only as the marker for "don't push twice" and "ignore landing on a stale tagged entry". A1's `closeAction` takes `owns`. **Applied (A1, A2, Review focus).**

### 3. Major: double-tapping "← List" walks back twice and leaves the trip

- **Finding:** `popstate` is async. A second tap before it fires still sees the entry as ours and calls `history.back()` again.
- **Change:** clear `owns` and set a `leaving` ref *before* calling `history.back()`. The handler accepts `leaving`. **Applied (A2).**

### 4. Major: the `MapPanelToggle` unmount cleanup closes the map on every identity change unless the callbacks are stable

- **Finding:** today's `useEffect(() => () => setFullMap(false), [setFullMap])` (`map-panel-toggle.tsx:20`) is safe only because `useState` setters are stable. If `closeFullMap` closes over `fullMap` state, its identity changes on open, the cleanup runs, and the map closes right after opening.
- **Change:** `openFullMap` and `closeFullMap` are `useCallback(…, [])` and read `fullRef`, `owns` and `leaving`, which are set synchronously, not in effects. Call `closeFullMap` through `() => closeFullMap()` in `onClick`, never `onClick={closeFullMap}`, which would pass the event as `opts`. **Applied (A2, A3).**

### 5. Major: the carousel move (A6) contradicts the plan's own root cause

- **Finding:** the root cause says the pill at `bottom: 16px` is lost behind Safari's bottom toolbar or the OS gesture strip. A6 then moves the carousel, the map's main control, to `bottom: 24px`, 8px higher in the same strip. `env(safe-area-inset-bottom)` is 0 here (no `viewport-fit=cover` in `app/layout.tsx`), so 24px is the whole margin. With iOS 26 Safari's floating bottom bar over content, it is plausibly covered too.
- **Why it matters:** this could recreate the reported bug for the carousel.
- **Change:** keep the carousel at its current 82px and only rewrite the comment (it now clears the browser's bottom chrome, not the pill). Lower it only after a real-device check (iOS Safari plus Android Chrome with gesture nav) shows that strip is clear. **Applied (A6, A8). Final offset left for the owner/device check.**

### 6. Major: Back after in-map navigation shows the old day for about one round-trip

- **Finding:** even with #1 fixed, Back first RESTOREs E0's older URL. The restore commits (from the bfcache), then the sync NAVIGATE(u1) refetches the page. Dynamic stale time is 0, so the RSC payload is refetched.
- **Why it matters:** the list may visibly flash the old day, and `ActivePlaceScroller` may scroll twice. The plan's "Result: … shows the same day/stop" is true only eventually.
- **Change:** no clean fix exists, because the History API can't rewrite E0 in place. Accept it, and add an explicit A8 observation. If the flash is ugly, the owner can live with it or accept list-at-pre-map-day as a fallback. **A8 step added. Severity left to the device check.**

### 7. Major: Part A had no docs task

- REQUIREMENTS §10 (and the §2 tab-bar line about full-map) and AGENTS-INDEX (`map-preview-context.tsx`, `map-panel-toggle.tsx` rows at `AGENTS-INDEX.md:224,230`) describe the current full-map. **Applied (new A9).**

### 8. Nit: B5's "if not, set `style.zIndex`" is conditional where the codebase is not

- `lib/map-pin.ts:42-44` says "every marker sets one", and `real-map-canvas-maplibre.tsx:136` explains why: DOM order changes as ghosts remount. Make it explicit on both renderers. Use the scale's existing **"route label 5"** slot (`map-pin.ts:43`) as `ROUTE_BADGE_Z_INDEX = 5` instead of adding a new 2. It still sits below pins (10) and above ghosts (1). **Applied (Design, B4, B5).**

### 9. Nit: B2's `MODE_COLOR` condition resolves one way

- After B, `MODE_COLOR` and `ROUTE_NONE_COLOR` have no runtime consumer. The only importers are `lib/map-route.ts:1` and `map-tokens.test.ts`, and the list chips read the CSS vars directly (`itinerary-list.module.css:123-131`). `--map-route-none` is used only by that mirror.
- **Change:** drop both constants and `--map-route-none`. Keep `--map-route-walk/drive/transit`. The parity test checks `ROUTE_COLOR` and `ROUTE_CASING_COLOR` and adds a contrast assertion (`--map-route` vs casing ≥ 3:1; it is 5.5:1), so the plan's contrast claim becomes a test.
- The ratchet claim is wrong but harmless. `hex-ok` lines are skipped entirely and test files are not scanned (`test/src-files.ts:16`), so the baseline doesn't move. If the badge CSS uses `var(--map-route)` and `#fff` stays out, nothing changes. Also update the `globals.css:111-114` comment and AGENTS-INDEX `:222,237,239,241,363`. **Applied (B2, B6).**

### 10. Nit: smaller corrections (all applied)

- **i18n:**
  - The files are `app/src/messages/{en,th}.json`.
  - `map_view_list` ("List" / "รายการ", `en.json:389`) already exists, so reuse it for the label and add only the aria key.
  - `"←"` is not in `allowedStrings` (`eslint.config.mjs:56-61`; `→` is), so the button must use an icon.
  - "Back to list" contains the visible "List", which satisfies WCAG 2.5.3.
- **Icons:** drive mode is `Drive` everywhere (`segment.tsx:6`, both mode pickers), not `Car`.
- **Widths:** `ROUTE_WIDTH`, `CASING_WIDTH` and `CASING_OPACITY` already exist (`map-route.ts:7-9`). The change is casing 7 → 6, not "add".
- **REQUIREMENTS:** `REQUIREMENTS.md:298` must be rewritten wholesale ("straight dashed", "grey dotted", "direction arrow mid-leg"), not just grepped for "dashed".
- **Arc maths:** use `x = λ`, `y = ln tan(π/4 + φ/2)` (radians) so the bend is isotropic. "Left" = `(-dy, dx)` with y north-up. The test sign is `cross(B−A, M−A) > 0` in (lng, lat). Guard `|AB| = 0`. `arcPath` returns *unwrapped* longitudes: MapLibre needs continuity, Google's `LatLngLiteral` wraps them itself, and non-geodesic segments take the short way.
- **`lastMapHref`:** record `location.pathname + location.search` in the effect, so it compares like-for-like with the popstate-time `currentHref`. `useSearchParams().toString()` can re-encode.
- **Line refs:** off by 1–2. `map-preview-context.tsx:44` is `:42`, and `globals.css:336-340/345/360-362` are `:335-339/344/359-361`.

### 11. Nit: left for the owner / implementer

- **Badge threshold:** 300 m geo is a weak proxy for "< 40px on screen". 300 m is about 60px at z15 but about 8px at z12, so at city zoom badges still crowd pins. The z-order keeps pins on top, so this is cosmetic. A zoom-aware gate (Mercator length × 256·2^zoom from `useMap()` zoom) is a cheap follow-up if B7.2 looks busy.
- **Colour:** the arc colour equals `--map-pin-sight` (#0f766e = `--brand-700`). Arcs and badge rings may read as part of the sight pins. The list's leg chips stay green/blue/violet while the map goes all-teal. That fits D-B, but the owner should see the before/after (B7.7).
- **Phone rotated to md+ in full-map:** the popstate sync would then replace on a desktop Back once. Gate the sync on `!isWide` (applied in A2). The orphan entry stays acceptable.
- **Arc bulge:** the bulge (≤ 9% of a leg) can poke past `fitBounds` padding on frame-edge legs. Check in B7.

## What I traced and confirmed

- **Tag survives the open:** `openFullMap`'s `pushState({...history.state, tpFullMap: 1}, '')` carries `__NA`, so the patched `pushState` passes it straight through (`app-router.js:255-256`). There's no URL, so no `ACTION_RESTORE`. No router commit follows, so `HistoryUpdater` doesn't overwrite it. The plan's claim holds.
- **Back lands correctly after a replace:** Back from a replace-navigated entry lands on the untagged E0. The landed-entry-untagged rule closes correctly. Only the "← List" path (#2) and the sync timing (#1) were wrong.
- **vis.gl 1.8.3:** `AdvancedMarker` has `clickable` (`index.modern.mjs:1499-1507`). With `false`, content never gets `pointer-events: all`, and rgm markers are `pointer-events: none !important` (`:1345-1352`), so taps pass through. `anchorPoint={AdvancedMarkerAnchorPoint.CENTER}` is supported.
- **MapLibre order:** route layers are canvas, so they sit under all DOM markers. Badge `Marker`s need an explicit `zIndex` and `pointerEvents: 'none'`. The map root is `isolation: isolate` (`real-map-canvas-maplibre.tsx:108-111`).
- **Other in-map pushes on phones:** `activate` is the only push (`persistent-map.tsx:102`). Ghosts are md+ only (`:118`), and the pin card is hidden on phones (`hidePinCard`).
- **Untouched surfaces:** the dialog guard isn't touched (no `role="dialog"`). The i18n lint covers all of `src/` with `ignoreProps`, so `aria-label={t(…)}` is fine.

## Verdict

**Fix-then-ship.** With #1–#5 applied to the plan, Part A's history mechanics are sound. The biggest risk was the primary exit ("← List") silently leaving a dead Back entry after any in-map action. Part B is sound once the badge z-index and token clean-up are made explicit.

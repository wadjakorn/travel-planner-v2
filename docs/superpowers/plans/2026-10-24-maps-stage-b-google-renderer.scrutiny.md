# Scrutiny log: Maps Stage B Google renderer plan

Plan: [2026-10-24-maps-stage-b-google-renderer.md](2026-10-24-maps-stage-b-google-renderer.md) · Ticket TP-0048

## Round 1

| Finding | Decision |
|---|---|
| **B1-M1:** map loads are under-counted. vis.gl creates a new `google.maps.Map` on every mount (StrictMode dev 2×, the no-pin day unmount/remount via `canRenderMap`, every picker open). | **Applied.** The trip map gets `reuseMaps`. The pin picker does **not**, because vis.gl's reuse cache key (`mapId:renderingType:colorScheme`) is shared with the trip map and does not reset `draggableCursor`, `clickableIcons` or controls. Picker opens are rare, so it stays at one load per open. Rewrote the Cost constraint, the Task 6 guardrails text and the Task 7 counting rule (each picker open counts as 2 in dev because of StrictMode; the trip map absorbs the double mount via reuse). |
| **B1-M2:** on mobile the section is `hidden md:block`, but the canvas still mounts: a billed load plus `fitBounds` in a 0×0 container. | **Applied.** New `useTripMapVisible()` (`matchMedia('(min-width: 768px)')` **or** `body[data-fullmap='1']`, both observed) plus a pure `isTripMapVisible` helper with tests. The Google canvas mounts on first visibility and then latches, so the first fit runs at real size. Task 7 Step 5 gains a 390×844 full-map check: no load before the toggle, a framed day after it, and no new map on re-toggle. ResizeObserver was not needed once mounting waits for visibility. |
| **B1-M3:** after `vercel rollback`, production domain auto-assignment is disabled. | **Applied.** The rollback now runs env rm → redeploy → `vercel promote <new url>`, then checks with `vercel inspect https://travel-planner-v2-eight.vercel.app` that the alias points at it. |
| **B1-M4:** the `addListenerOnce(map,'idle',clamp)` handle leaks across effects. | **Applied.** Keep the handle, arm it before `fitBounds`, and call `h.remove()` in effect cleanup. Documented that `fitBounds` with no camera move still fires one `idle`, which consumes the listener. |
| **B1-n1:** "read per request" is wrong because `MAPS_CONFIG` is a module constant. | **Applied.** Reworded: evaluated once per server instance from runtime env; an env change needs a new deployment. |
| **B1-n2:** `key={theme}` is redundant. | **Applied.** Removed from both Google maps; vis.gl recreates the map on a `colorScheme`/`mapId` change (verified at `dist/index.modern.mjs:1086-1088` in 1.8.3). |
| **B1-n3:** a wrong or raster Map ID gives no `gm_authFailure`. | **Applied.** Added Review Focus item 6. Task 7 Step 3 and the Task 8 manual check make "numbered pins visible" a hard pass/fail and require no `Map ID` console warning; failing it at go-live means rollback. |
| **B1-n4:** Task 5 capture script hardening. | **Applied.** `set -euo pipefail`, `[ -n "$K" ] \|\| exit 1`, the calls chained with `&&`, and the key passed as a header through a curl config on stdin (`-K -`, built with the `printf` builtin), so it never appears in argv or `ps`. |
| **B1-n5:** `effectiveRenderer` must also require `mapId`. | **Applied.** Spelled out in the signature, plus a test case `{browserKey:'B', mapId:''}` → `'maplibre'`. |
| **B1-n6:** `markDegraded` must warn only once. | **Applied.** A stable `useCallback` with a `useRef` guard; the warning is never inside a state updater (StrictMode runs updaters twice), so it fires once even if both `gm_authFailure` and `onError` fire. |

## Round 2

| Finding | Decision |
|---|---|
| **B2-M1:** `ActiveFocusGoogle` can still `fitBounds` in a 0×0 container after the latch, because the map stays mounted while hidden. Examples: mobile Map→List→switch day→Map, and desktop `/hotels` (`dayIdx` 0) → back with the same `pinsSig`. | **Applied.** The fit is skipped when `map.getDiv().offsetWidth === 0`. A `ResizeObserver` on `map.getDiv()` re-runs the fit on a 0→non-zero width and is disconnected in cleanup. The round 1 claim that the fit "never runs in 0×0" is corrected (this reverses round 1's "ResizeObserver not needed"). Task 7 Step 5 adds the hidden-day-switch and desktop sub-page flows. |
| **B2-M2:** `AdvancedMarker` anchors bottom-centre, while MapLibre centres. | **Applied.** `anchorPoint={AdvancedMarkerAnchorPoint.CENTER}` on `PinBadge` and `PickDot` markers; `InfoWindow` `pixelOffset={[0,-18]}` to match MapLibre `offset={18}`. |
| **B2-M3:** the Task 3 Step 5 grep is broken (it matches `maps-config-provider`, and the path is wrong after `cd app`). | **Applied.** From `app/`: `grep -rnE "lib/maps-config['\"]\|NEXT_PUBLIC_GOOGLE" src`. |
| **B2-n1:** the reuse claim is wrong: a reused map gets `setOptions(mapOptions)` (default center and zoom), so it does not keep its old camera. | **Applied.** Reworded (verified at vis.gl 1.8.3 `dist/index.modern.mjs:1017-1027`). Added that reuse skips `clearInstanceListeners` (`:1063-1070`), so the `h.remove()` and ResizeObserver cleanups are load-bearing. |
| **B2-n2:** use `useSyncExternalStore` for visibility, and say where the latch sits. | **Applied.** `useSyncExternalStore(subscribe, getSnapshot, () => false)`. The latch sits **above** `<GoogleMapsApi>`, because `APIProvider` injects the script on mount. |
| **B2-n3:** "handler in place before any Google script loads" is not accurate. | **Applied.** Reworded: child effects run first, so the script may be injected before the handler is installed. This is safe because `gm_authFailure` only fires after the script loads and checks the key, a network round trip later. |
| **B2-n4:** the key is in argv during the grep checks. | **Applied.** Task 5 and Task 7 Step 4 use `grep -c -F -f <(printf '%s\n' …)`, and Step 4 adds `{ [ -n "$K" ] && [ -n "$X" ]; } \|\| exit 1`. |
| **B2-n5:** rollback promotes before the redeploy is Ready; the pre-check 1 SHA source is fragile. | **Applied.** The rollback waits for Ready (no `--no-wait`, confirmed via `vercel inspect`) before `vercel promote`. Pre-check 1 tries `vercel inspect … --json` (`meta.githubCommitSha`), then falls back to `vercel ls travel-planner-v2 --prod` plus the dashboard, and stops if the SHA can't be matched. |

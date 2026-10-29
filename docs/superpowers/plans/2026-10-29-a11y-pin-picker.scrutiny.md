# Scrutiny: pin picker accessibility

Plan: [2026-10-29-a11y-pin-picker.md](2026-10-29-a11y-pin-picker.md). Reviewed against `main` @ `6f6f7a2`.

## Intent

Let a keyboard or screen-reader user set the location in the manual-add form (review §5 A9 / A16, §3.2): paste coordinates or a Google Maps link, or pan the map and use its centre. On phones, the picker map should stop trapping page scroll.

### Simpler alternatives considered

- **Plain lat/lng number inputs:** the smallest fix for 2.1.1. Rejected: people paste "35.68° N, 139.76° E" or a Maps link, not two numbers. The plan's single parsed field costs about the same and reuses `gmaps-link.ts`.
- **Inline in `place-manual-form.tsx` instead of a new `LocationField`:** this plan was written for three consumers, and only one is live (finding 1). An inline version would be about as large. The component is still worth keeping because it makes the form shorter and puts the a11y wiring in one place. **Kept**, nit only.
- **Cooperative gestures alone (A16)** is a two-prop change, but it doesn't fix A9. The plan bundles both, which is proportionate.

## Findings

### 1. Blocker: two of the three edited forms are dead code. *Applied.*

- **Finding:** Task 3 rewrote `hotel-manual-form.tsx` and `hotel-edit-modal.tsx`. Nothing reachable renders either file.
- **Why it matters:** about 40% of Task 3 and the Task 4 "Bookings → add stay → manual" check would be spent on dead code, and the check can't be run at all. `ds-modal-consolidation` Task 1 also deletes both files, so the two plans would conflict.
- **Evidence:** `grep -rn "from './hotel-manual-form'"` matches only `hotel-search-picker.tsx:14`. `hotel-search-picker` is imported only by `hotels-view.tsx:12`. `hotel-edit-modal` is imported only by `hotel-edit-launcher.tsx:5`, which is imported only by `hotels-view.tsx:13`. `HotelsView` has no importer. `/trip/[id]/hotels` redirects to Bookings, and the live hotel form (`hotel-form-client.tsx` → `hotel-place-picker.tsx`) has no `PinPickerMap`.
- **Change:** removed every hotel hunk, line ref, copy string, prop comment and verification step. The plan now edits `place-manual-form.tsx` only. Touches documents the dead chain.

### 2. Major: line refs in `place-manual-form.tsx` were off. *Applied.*

- **Evidence:** validation is `:66-71` (plan said 64-73). The catch is `:86-95`. The location block is `:164-184` and the error box `:186-196` (the plan merged them as 166-200). `disabled={submitting || !pos}` is at `:214`, not `:216`. `gmaps-link.ts` exports sit at `:15,42,68`, not `15,44,64`.
- **Change:** corrected. Also added the header comment (`:3-5`) and the `dynamic` import (`:10,15`) to the edit list.

### 3. Major: cross-plan collision on the submit button. *Applied (resolution recorded).*

- **Finding:** `ds-modal-consolidation` Task 6 rewrites `place-manual-form.tsx:211-218` into `Button loading` and keeps `disabled` "exactly as today", which is `submitting || !pos`. This plan removes `!pos`.
- **Resolution:** whichever lands second ends with `Button` + `loading={submitting}` + `disabled={submitting}`. This is now written into both Touches and this file.

### 4. Nit: `JSX.Element` return type does not compile. *Applied.*

`@types/react` 19.2.14 declares `JSX` only inside `namespace React` (`index.d.ts:4133`), and no file in `app/src` uses a bare `JSX.Element`. Changed to `React.JSX.Element`.

### 5. Nit: `PickerFocus` on a degraded Google map. *Applied.*

The plan skipped `onCenterChange` when `degraded` but still called `setCenter`/`setZoom`. Calls on a map after an auth failure can throw, which is the reason for the existing marker guard at `pin-picker-map-google.tsx:41-42`. `PickerFocus` is now a no-op when degraded.

### 6. Nit: desktop wheel behaviour changes. *Applied (verification step).*

Cooperative gestures also mean a plain mouse wheel over the picker scrolls the page, and zoom needs Ctrl/⌘. That is the intent, but the plan didn't say so. Added an explicit check in Task 4 so it isn't filed as a regression. A manual-add check in the modal variant was added as well, since that variant is how most users reach the form.

## Verified (no change needed)

- `PinPickerMapProps` is at `map-renderer-props.ts:29-34`. Both renderers are only reached through `pin-picker-map.tsx`.
- MapLibre: `cooperativeGestures?: boolean` exists in maplibre-gl 6.14 `MapOptions` (`maplibre-gl.d.ts:13283`, `GestureOptions = boolean`). `@vis.gl/react-maplibre` 8.1.3 passes it through via `MapInitOptions = Omit<MapOptions, …>`.
- vis.gl Google `onIdle: (event: MapEvent) => void` (index.d.ts:927) gives `e.map`.
- `Button` has `variant="outline"` and `size="sm"` (`ui/button.tsx:7,27`). `Locate` exists (`icons.tsx:151`). `baseStyles.input` is `trip-create-form.module.css:25`.
- Cost: no new requests. The picker stays one Dynamic Maps load per open with no `reuseMaps`. $0.
- The Enter-submits risk, the swapped-order risk and the Tokyo-default risk are each pinned by a named check.

## Cross-plan

- **ds-modal-consolidation:** it deletes the two hotel files, so this plan dropped its hunks. Submit-button resolution is in finding 3.
- **a11y-batch:** A18 copy for `place-manual-form.tsx` is owned here, which is consistent with a11y-batch's Touches note. If a11y-batch's `isNavigationError` lands first, use it in place of the inline digest check. That's optional.
- **i18n-extraction P2:** it extracts `place-manual-form.tsx`'s 14 literals. The new copy here goes into the same extraction.

**Verdict: fix-then-ship (fixes applied).** The biggest issue was that the plan spent two-thirds of its form work on unreachable hotel files. With those removed it's a tight, correct, single-form change.

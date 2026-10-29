# Pin Picker Accessibility Implementation Plan

> **Ticket:** TP-0090

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You can set the location in the manual place form without a pointer: type or paste coordinates, paste a Google Maps link, or pan the map with the keyboard and press "Use map center". On phones the picker map no longer traps page scroll.

**Architecture:** A pure parser `parseLocationInput` reuses `lib/places/gmaps-link.ts` for links and adds a decimal-pair regex for coordinates. A new client component `LocationField` wraps the existing `PinPickerMap` selector with a labelled `<fieldset>`: a coordinates/link text input, a fixed centre crosshair, a "Use map center" button, and a polite status line. `PinPickerMapProps` gains two optional props: `onCenterChange`, which both renderers fire when the camera settles, and `focus`, a recentre request. Both renderers switch to cooperative gestures. The manual place form (`place-manual-form.tsx`, the only live picker consumer) swaps its hand-rolled label, map and hint markup for `LocationField`. The other two `PinPickerMap` importers (`hotel-manual-form.tsx`, `hotel-edit-modal.tsx`) are unreachable dead code (see Touches) and are not edited.

**Tech Stack:** Next.js 16, React 19, `@vis.gl/react-google-maps` 1.8.3, `react-map-gl/maplibre` 8.1.3 (MapLibre 6.14), Tailwind v4, vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md`: §5 A9 (🔴, WCAG 2.1.1), §5 A16 (WCAG 2.1.2), §3.2 last bullet ("pin picker ในฟอร์มต้องเป็น `cooperative`"), §10 ticket MAP-12. §5 A17 is covered here only for the fields this plan adds.

**Touches:** `map-renderer-props.ts`, `pin-picker-map-google.tsx`, `pin-picker-map-maplibre.tsx`, `place-manual-form.tsx`, `trip-create-form.module.css`, new `location-field.tsx` + `lib/places/parse-location.ts`. This plan does **not** touch the trip map (`real-map-canvas-*`, `persistent-map.tsx`) or `globals.css`.

**Not touched (dead code, scrutiny 2026-10-29):** `hotel-manual-form.tsx` and `hotel-edit-modal.tsx` are only reachable through `hotels-view.tsx`, which nothing imports (`/trip/[id]/hotels` redirects to Bookings). Chains: `hotels-view` → `hotel-search-picker` → `hotel-manual-form`; `hotels-view` → `hotel-edit-launcher` → `hotel-edit-modal`. `2026-10-29-ds-modal-consolidation.md` Task 1 deletes them. The live hotel forms (`hotel-form-client.tsx` + `hotel-place-picker.tsx`) have no pin picker.

**Cross-plan:** `ds-modal-consolidation` Task 6 turns `place-manual-form.tsx:211-218` into `<Button type="submit" loading={submitting} …>` and keeps `disabled` "exactly as today". Whichever lands second applies the other's change: the final button is the shared `Button` with `loading={submitting}` and `disabled={submitting}` (no `!pos`). `i18n-extraction` P2 extracts this form's literals; land this plan first or extract the new copy with it.

## Decision needed

1. **Short links (`maps.app.goo.gl/…`) in the picker field.** Default: **not expanded**. The field shows a message pointing to the search box, which already expands short links server-side. Reason: expanding them needs a server round-trip (`expandShortLink`) and a new route. The picker's job is coordinates, and the search box already covers short links.
2. **Submit button when no location is set.** Default: **enabled, and validate on submit**. Today it is `disabled={submitting || !pos}` (`place-manual-form.tsx:214`), so a screen-reader user hears a dead button with no reason given. On submit without a location, the form shows the location error and moves focus to the coordinates input.
3. **Copy spelling:** "Use map center" (US). This matches the code's `center` and the rest of the app's US copy.

## Global Constraints

- No new network calls and no new Google SKU. Parsing is client-side, so the cost is $0. Picker map loads are unchanged: Google is still one Dynamic Maps load per picker open, with no `reuseMaps` (`pin-picker-map-google.tsx:16-19`).
- Picker only: Google `gestureHandling="cooperative"`, MapLibre `cooperativeGestures`. The trip map (`real-map-canvas-*`) stays `greedy` per review §3.2.
- Import renderers only through `pin-picker-map.tsx`. Never import `pin-picker-map-google`/`-maplibre` directly.
- Links are parsed only through `extractGmapsUrl`, `isShortLink` and `parseGmapsUrl` from `@/lib/places/gmaps-link`. Do not add a second URL regex.
- Display format for coordinates is `lat.toFixed(5), lng.toFixed(5)`, the same as the existing hints (`place-manual-form.tsx:181`).
- Colours use tokens only (`text-danger`, `text-muted`, `border-border`, `var(--danger)`). No new hex. Delete the hex you replace (`#c8102e`, `#86868b`, `rgb(228 228 231)`) in the lines you touch.
- Exact copy (EN):
  - legend `Location`
  - input label `Coordinates or Google Maps link`, placeholder `35.6812, 139.7671`
  - hint `Paste coordinates or a Google Maps link, tap the map, or move the map and use its center.`
  - button `Use map center`
  - status `Location set: {lat}, {lng}` / `No location yet.`
  - required error `Set a location: paste coordinates, use the map center, or tap the map.`
  - parse errors: see Task 1 `LOCATION_ERROR_COPY`
  - submit failure: `Couldn't add place. Try again.`

## Review Focus

1. **Enter in the coordinates field submits the whole form.** Expected: Enter applies the text to the location and does not submit. Pinned by a manual check in Task 4. `LocationField` handles it with `onKeyDown` + `preventDefault`.
2. **Swapped order (`139.7671, 35.6812`).** Expected: an out-of-range error, not a silent pin in the ocean. Tested in Task 1 (`out_of_range`). A swap where both values are in range (e.g. `-74.0, 40.7`) can't be detected. The status line reads the result back and the map recentres, so the user sees it.
3. **Map failed (Google auth failure → `degraded`) or not loaded yet.** Expected: the text path still works, and "Use map center" stays disabled rather than offering the default Tokyo centre. The button is enabled only after the renderer reports a centre. Manual check in Task 4.
4. **Phone: one-finger scroll over the picker.** Expected: the page scrolls and tap still picks. Two fingers pan the map. Manual check in Task 4 at 390×844.
5. **Formats people actually paste:** Apple Maps `35.6812° N, 139.7671° E`, southern/western `33.8688° S, 151.2093° E`, no space `35.6812,139.7671`, a `/maps/place/...!3d..!4d..` link, a `/maps/search/ramen` link without coordinates, and a short link. All are tested in Task 1.

---

### Task 1: `parseLocationInput` — coordinates and links → lat/lng

**Files:**
- Create: `app/src/lib/places/parse-location.ts`
- Test: `app/src/lib/places/parse-location.test.ts`

**Interfaces:**
- Consumes: `extractGmapsUrl(text): string | null`, `isShortLink(u: URL): boolean`, `parseGmapsUrl(raw): GmapsLink | null` (`app/src/lib/places/gmaps-link.ts:15,42,68`).
- Produces:
  ```ts
  export type LocationParseError = 'empty' | 'out_of_range' | 'short_link' | 'no_coords' | 'unrecognized';
  export type LocationParse =
    | { ok: true; lat: number; lng: number; source: 'coords' | 'link' }
    | { ok: false; reason: LocationParseError };
  export function parseLocationInput(raw: string): LocationParse;
  export function formatLatLng(p: { lat: number; lng: number }): string; // "35.68120, 139.76710"
  export const LOCATION_ERROR_COPY: Record<Exclude<LocationParseError, 'empty'>, string>;
  ```

Decided behaviour:
- Trim first. An empty string returns `empty`.
- **Coordinates.** Two decimals separated by a comma and/or whitespace, optionally wrapped in `( )`. Each number may carry `°` and a hemisphere letter: `N`/`S` for the first, `E`/`W` for the second. `S` and `W` negate the value. Out of range (`|lat|>90 || |lng|>180`) returns `out_of_range`.
- **Links.** If `extractGmapsUrl(raw)` finds a URL: a short link returns `short_link`. Otherwise run `parseGmapsUrl`, and `lat`/`lng` non-null returns `{ ok, source:'link' }`, else `no_coords`. The `viewport` precision (`/@lat,lng,z`) is accepted.
- Anything else returns `unrecognized`.
- Copy:
  - `out_of_range`: `Latitude must be between -90 and 90, longitude between -180 and 180.`
  - `short_link`: `Short links can't be read here. Paste it in the place search instead, or paste the coordinates.`
  - `no_coords`: `That link has no coordinates. Use a link to a place or dropped pin, or paste the coordinates.`
  - `unrecognized`: `Enter coordinates like 35.6812, 139.7671 or paste a Google Maps link.`

- [ ] **Step 1: Write the failing tests** (`describe('parseLocationInput')`)
  - `'35.6812, 139.7671'`, `'35.6812,139.7671'`, `'35.6812 139.7671'` and `'(35.6812, 139.7671)'` → `{ ok:true, lat:35.6812, lng:139.7671, source:'coords' }`
  - `'35.6812° N, 139.7671° E'` → `(35.6812, 139.7671)`. `'33.8688° S, 151.2093° E'` → `(-33.8688, 151.2093)`. `'40.7128° N, 74.006° W'` → `lng === -74.006`
  - `'-33.8688, 151.2093'` → `lat === -33.8688`
  - `'139.7671, 35.6812'` → `{ ok:false, reason:'out_of_range' }`. `'91, 0'` → `out_of_range`
  - `'https://www.google.com/maps/place/Tokyo+Tower/@35.6585,139.7454,17z/data=!3d35.6585805!4d139.7454329'` → `{ ok:true, lat:35.6585805, lng:139.7454329, source:'link' }`
  - `'https://maps.google.com/?q=35.6812,139.7671'` → `source:'link'`, `lat === 35.6812`
  - `'https://www.google.com/maps/search/ramen'` → `no_coords`
  - `'https://maps.app.goo.gl/abc123'` → `short_link`
  - `''` and `'   '` → `empty`. `'Tokyo Tower'` → `unrecognized`. `'35,6812 139,7671'` → `unrecognized`
  - `formatLatLng({ lat: 35.6812, lng: 139.7671 })` → `'35.68120, 139.76710'`
- [ ] **Step 2: Run to verify fail.** `cd app && pnpm vitest run src/lib/places/parse-location.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `parse-location.ts` per the decided behaviour. Coordinates first, then link: a pasted URL never matches the pair regex.
- [ ] **Step 4: Run to verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `feat(places): parse pasted coordinates and Google Maps links for the pin picker [TP-0090]`

### Task 2: Picker renderers — cooperative gestures, centre reporting, recentre on request

**Files:**
- Modify: `app/src/components/map-renderer-props.ts:29-34` (`PinPickerMapProps`)
- Modify: `app/src/components/pin-picker-map-google.tsx`
- Modify: `app/src/components/pin-picker-map-maplibre.tsx`

**Interfaces:**
- Produces (added to `PinPickerMapProps`, both optional so `PinPickerMap` callers compile unchanged):
  ```ts
  /** Fires with the map centre whenever the camera settles (and once after load). */
  onCenterChange?: (c: LatLng) => void;
  /** Recentre request: a new object = a new request (identity, not value, triggers it). */
  focus?: LatLng | null;
  ```
  plus `export const PICKER_FOCUS_ZOOM = 15;` in the same file. On a focus request, zoom becomes `max(current, PICKER_FOCUS_ZOOM)`.

Decided behaviour:
- **Google.**
  - `gestureHandling="cooperative"` (was `"greedy"`).
  - `onIdle={(e) => { const c = e.map.getCenter(); if (c) onCenterChange?.(c.toJSON()); }}`. `onIdle` also fires after the first render. `real-map-canvas-google.tsx` already uses `e.map` the same way.
  - A child `PickerFocus` inside `<Map>` uses `useMap()` and runs `useEffect(..., [map, focus])` → `map.setCenter(focus)` + `setZoom`. Use `setCenter`, not `panTo`: there is no animation, so reduced motion is respected.
  - When `degraded`, skip `onCenterChange` and make `PickerFocus` a no-op. This mirrors the existing marker guard (calls on a dead map can throw), so "Use map center" stays disabled on a dead map.
- **MapLibre.**
  - `cooperativeGestures` prop on `<Map>` (a MapLibre `MapOptions` field, passed through by `@vis.gl/react-maplibre`).
  - `onLoad` and `onMoveEnd` both report `e.target.getCenter()` as `{ lat, lng }`.
  - A child `PickerFocus` uses `useMap()` from `react-map-gl/maplibre` and calls `current.jumpTo({ center: [lng, lat], zoom: Math.max(current.getZoom(), PICKER_FOCUS_ZOOM) })`.
- Click-to-pick and `PickDot` are unchanged.

- [ ] **Step 1: Implement** the prop additions and both renderers.
- [ ] **Step 2: Verify.** `cd app && pnpm typecheck && pnpm lint` (tail -3). Expected: clean, with no `react-hooks/exhaustive-deps` warning, because `focus` is a dependency by identity.
- [ ] **Step 3: Commit.** `feat(map): picker maps report their centre, recentre on request, use cooperative gestures [TP-0090]`

### Task 3: `LocationField` and the manual place form

**Files:**
- Create: `app/src/components/location-field.tsx` (`'use client'`)
- Modify: `app/src/components/place-manual-form.tsx:3-5` (header comment), `:10,15` (drop the local `dynamic` import), `:66-71` (validation), `:86-95` (catch copy), `:164-184` (location block), `:186-196` (error box), `:212-218` (submit `disabled` at `:214`)
- Modify: `app/src/components/trip-create-form.module.css`: add `.input[aria-invalid='true'] { border-color: var(--danger); }`. This module is shared by every form that uses `baseStyles.input`, and none of them set `aria-invalid` today, so nothing else changes.

**Interfaces:**
- Consumes: Task 1 (`parseLocationInput`, `formatLatLng`, `LOCATION_ERROR_COPY`) and Task 2 (`onCenterChange`, `focus`). `PinPickerMap` is loaded via `dynamic(() => import('./pin-picker-map'), { ssr: false })`, the same pattern the forms use today. `Locate` comes from `@/components/icons`.
- Produces:
  ```ts
  export type LocationFieldProps = {
    value: LatLng | null;
    onChange: (p: LatLng) => void;
    center: LatLng;            // initial map centre (forms pass what they pass today)
    zoom?: number;             // default 12, as the renderers default today
    mapHeight: number;         // place-manual passes 300 (today's height)
    error?: string | null;     // form-level "required" message, tied to the input
    inputRef?: React.Ref<HTMLInputElement>; // forms focus it on a required-error submit
  };
  export function LocationField(props: LocationFieldProps): React.JSX.Element; // no global JSX namespace in @types/react 19
  ```

Decided behaviour (`LocationField`):
- **Structure.** `<fieldset>` with `<legend>Location</legend>`. Ids come from `useId()`.
- **Text input.**
  - `<label htmlFor>` gives the visible label. The input has `className={baseStyles.input}`, `inputMode="text"`, `autoComplete="off"` and the placeholder from Global Constraints.
  - `aria-describedby` = hint id + (error id when an error shows). `aria-invalid` is set when a parse error or the `error` prop shows.
- **Applying text.**
  - Text is applied on Enter (`preventDefault`, so the form is not submitted) and on blur when the text changed since the last apply.
  - Success: call `onChange(p)`, set `focus` to a new `{lat,lng}` object, clear the parse error, and replace the text with `formatLatLng(p)`.
  - `empty`: do nothing.
  - Any other failure: show `LOCATION_ERROR_COPY[reason]`.
  - When `value` changes from a map click or the centre button, set the text to `formatLatLng(value)` and clear the parse error.
- **Error slot.** One `<p id={errorId} className="text-danger text-[13px]">`. Shows `parseError ?? error`.
- **Map box.**
  - Container: `relative` with `height: mapHeight`, `rounded-xl overflow-hidden border border-border`.
  - Inside it: `<PinPickerMap center zoom value={value} onPick={onChange} onCenterChange={setMapCenter} focus={focus} />`.
  - A crosshair overlay: absolutely centred, 24 px, `pointer-events-none`, `aria-hidden`, drawn with two 2 px `bg-foreground/70` bars.
- **Button.** `<Button type="button" variant="outline" size="sm">` (from `@/components/ui`) with the `Locate` icon and the label `Use map center`. It is `disabled={!mapCenter}`. On click: `onChange(mapCenter)`.
- **Status line.** `<p aria-live="polite" className="text-xs text-muted">` showing `Location set: {formatLatLng(value)}` or `No location yet.` It replaces the old `pos.lat.toFixed(5)` hint spans and the `✓ / — tap the map` label text.

Form changes (`place-manual-form.tsx`):
- Replace the location `<div className={baseStyles.field}>…</div>` block with `<LocationField …/>`.
- Remove the form's local `dynamic(() => import('./pin-picker-map'))`; `LocationField` owns it now.
- Missing location on submit: set the required error copy, pass it as `error`, focus `inputRef`, and return. The form-level `error` state keeps handling dates and name. The location error is separate state, so it renders next to the field and not in the bottom box.
- Remove `!pos` from the submit `disabled` (`place-manual-form.tsx:214`). Keep `submitting`.
- Bottom error box: add `role="alert"`, swap the hex for `text-danger`, and use the submit-failure copy from Global Constraints in place of `msg || '…'`. Raw server messages stop reaching the user here (design review A18). Keep the existing `NEXT_REDIRECT` digest rethrow logic unchanged.

- [ ] **Step 1: Implement** `location-field.tsx` and the `place-manual-form.tsx` edits.
- [ ] **Step 2: Gates.** `cd app && pnpm typecheck && pnpm lint && pnpm test` (tail -3) → pass.
- [ ] **Step 3: Commit.** `feat(forms): keyboard + screen-reader path to set a manual place location [TP-0090]`

### Task 4: Verify in the real app, then update docs

- [ ] Start the app: `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`. Test trip `79efe162-dfb2-46c2-ad46-a34695771b8b`. Manual place form: `/trip/79efe162-dfb2-46c2-ad46-a34695771b8b/day/<day-1 id>/place/new?manual=1`, or Add place → **Manual Add**.
- [ ] **Keyboard only, 1440×900:**
  1. Tab to the coordinates field and type `35.6586, 139.7454`, then Enter. The form does **not** submit, the pin moves there, the map recentres, and the status reads `Location set: 35.65860, 139.74540`.
  2. Fill name and category, then submit. The place is added.
- [ ] **Map centre path:** Tab into the map and use the arrow keys to pan (both renderers support keyboard pan when the map has focus). Tab to **Use map center** and press Space. The pin lands under the crosshair.
- [ ] **Errors:**
  - Paste `139.7671, 35.6812` and press Enter: you see the out-of-range copy and the input is `aria-invalid`.
  - Paste a `maps.app.goo.gl` link: you see the short-link copy.
  - Submit with no location: you see the required copy next to the field, and focus moves to the input.
- [ ] **Paste a full `/maps/place/…` link:** the pin is set from `!3d/!4d`.
- [ ] **Mobile 390×844:** in the manual form (page variant), swipe one finger over the picker. The page scrolls, and Google shows "Use two fingers to move the map". A single tap still sets the pin.
- [ ] **Open mode (`MAPS_PROVIDER` unset):** repeat the keyboard path and the one-finger scroll on MapLibre. You see MapLibre's cooperative-gesture overlay.
- [ ] **Degraded / not loaded:** with the network throttled so the map hasn't loaded, **Use map center** is disabled and the text path works.
- [ ] **Modal variant:** Add place search → **Manual Add** opens the form in the picker's dialog. Same keyboard path; Tab reaches the map and "Use map center" inside the dialog.
- [ ] **Desktop wheel:** over the picker map, a plain wheel scroll now scrolls the page and shows the ctrl + scroll hint (cooperative). Ctrl/⌘ + wheel zooms. Expected, not a regression.
- [ ] **Screen reader smoke** (VoiceOver or Orca, if available): the input is announced with its label and hint; applying text announces `Location set: …`.
- [ ] **Docs:**
  - `AGENTS-INDEX.md`:
    - Map section: add `location-field.tsx`, the shared picker field (coords/link input, crosshair, "Use map center", status). Update the `pin-picker-map-*` row to "click/tap or keyboard pan; cooperative gestures; `onCenterChange`/`focus`".
    - Maps lib: add `places/parse-location.ts`.
    - `place-manual-form.tsx` row: drop "Lat/lng picked by clicking", which is also in its header comment, so update that comment.
  - `REQUIREMENTS.md`: §5 Itinerary gets one bullet: "Manual add: set the location by coordinates, a Google Maps link, the map centre, or a tap; keyboard-only works (WCAG 2.1.1)."
- [ ] **Commit.** `docs: pin picker a11y [TP-0090]`

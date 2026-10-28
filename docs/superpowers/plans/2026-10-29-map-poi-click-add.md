# Map POI Click → Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a Google POI on the trip map opens our preview card (name, category, address, photo, distance to the nearest stop) with "Add to Day N", instead of Google's own info window.

**Architecture:** A new Places detail field set `poi` (= `preview` + `displayName`, Pro SKU) with its own non-latching daily cap and a kill switch. The Google `<Map onClick>` intercepts POI clicks (`e.detail.placeId`, `e.stop()`), and a `usePoiPreview` hook in the persistent map resolves the place and publishes it through the existing `MapPreviewProvider` (TP-0062) — so the existing preview marker, popup and camera focus are reused. "Add" resolves `full` details (as the search picker does) and calls `addPlaceInlineAction`.

**Tech Stack:** Next.js 16, React 19, `@vis.gl/react-google-maps`, Google Places API (New), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §13 + §3.4. User decision 2026-10-29: build it; if it doesn't work out, disable (flag) or remove.

## Global Constraints

- Field mask for `poi` exactly: `id,displayName,formattedAddress,location,types,photos` (Pro SKU; 5,000 free/month).
- Daily cap env `GOOGLE_PLACES_DETAILS_POI_DAILY_CAP`, default **100**, bucket `gplaces:details:poi`. Exhausted cap returns `null` and must **not** latch Google off (same rule as `preview`).
- Kill switch env `MAPS_POI_ADD`: `off`/`0`/`false` disables (client never intercepts → Google's native info window shows). Default on when provider is `google`.
- Only for editors/owners (`canWrite(role)`); viewers get Google's native info window (don't intercept).
- Google mode only. MapLibre/open mode: no change.
- No storage of details until Add (ToS); in-memory per page session cache by place id only.
- Copy (EN): toast on failure `Couldn't load that place` / description `Try again or search for it.`; distance line `≈ {dist} from {name}`.

## Review Focus

1. **Cap exhausted / Google error / invalid place id:** must not leave the user with nothing — after `e.stop()` we owe feedback: show the error toast. Test `getPlaceDetail` with `fields:'poi'` + denied cap → `null` and Google not latched (Task 1).
2. **Rapid taps on several POIs:** only the last one's preview lands (reuse `begin()/setPreview(token)`); test the token race in Task 3 hook logic via the existing `previewReducer` semantics (no new reducer) — assert in manual check + unit test of `poiPreviewFrom` purity.
3. **Tapping a POI while a search-picker preview is open:** the POI preview replaces it (picker's preview cleared, picker input untouched). Manual check Task 4.
4. **Add while viewing another day:** Add goes to the map's current `?day=` day, and the label says that day. Test `poiPreviewFrom(...).dayLabel` (Task 3).
5. **Add after a POI tap bills twice** (Pro on tap + Enterprise `full` on add) and the add consumes the shared `details:full` cap (30/day, latches Google off when spent — same as picker adds). Expected; document in `maps-cost-guardrails.md` (Task 1).

---

### Task 1: Server — `poi` field set, cap, kill switch

**Files:**
- Modify: `app/src/lib/places/types.ts` (`Fields` adds `'poi'`)
- Modify: `app/src/lib/places/google.ts` (`GOOGLE_MASKS.poi`; `photo` returned for `preview` **or** `poi`)
- Modify: `app/src/lib/places/session.ts` (`parseFieldsParam` accepts `'poi'`)
- Modify: `app/src/lib/places/search.ts` (non-latching denial for `preview` **and** `poi`)
- Modify: `app/src/lib/maps/config.ts` (`caps.poi = cap(env.GOOGLE_PLACES_DETAILS_POI_DAILY_CAP, 100)`; `poiAdd: boolean` on `MapsConfig` from `MAPS_POI_ADD`, true unless `off|0|false`, and false whenever provider is `open`)
- Modify: `app/src/lib/maps/client-config.ts` + `toClientMapsConfig` (`poiAdd: boolean` in `ClientMapsConfig`; `OPEN_CLIENT_CONFIG.poiAdd = false`)
- Modify: `app/.env.example`, `docs/ops/maps-cost-guardrails.md` (new cap + SKU row + kill switch)
- Test: `app/src/lib/places/search.test.ts`, `app/src/lib/maps/config.test.ts`, google mask test wherever `GOOGLE_MASKS` is asserted (grep)

**Interfaces:**
- Produces: `Fields = 'basic' | 'full' | 'preview' | 'poi'`; `ClientMapsConfig.poiAdd: boolean`; `/api/places/details?id=…&fields=poi` returns `{ place: PlaceDetail | null }` with `name` and `photo`.

- [ ] **Step 1: Failing tests**
  - config: `readMapsConfig({...googleEnv})` → `poiAdd === true`, `caps.poi === 100`; with `MAPS_POI_ADD: 'off'` → `false`; open provider → `false`; `GOOGLE_PLACES_DETAILS_POI_DAILY_CAP: '7'` → `caps.poi === 7`.
  - `toClientMapsConfig` google → `poiAdd` mirrors config.
  - search: `getPlaceDetail(gid, 'en', { fields: 'poi', consume: denied })` → `null` **and** a following `fields:'basic'` call still reaches the fetch (not latched). With an allowed consume and a fake fetch asserting header `X-Goog-FieldMask === 'id,displayName,formattedAddress,location,types,photos'` → result has `name` and `photo`.
  - `parseFieldsParam('poi') === 'poi'`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/places src/lib/maps` → FAIL
- [ ] **Step 3:** Implement the changes listed in Files.
- [ ] **Step 4:** Re-run → PASS; `pnpm typecheck` (tail -3) clean.
- [ ] **Step 5:** Commit `feat(places): poi details field set with own cap + MAPS_POI_ADD switch [TP-0077]`

### Task 2: Pure helpers — nearest stop + preview data from a POI

**Files:**
- Modify: `app/src/lib/map-preview.ts` (add helpers; keep TP-0062 model)
- Test: `app/src/lib/map-preview.test.ts`

**Interfaces:**
- Produces:
  - `metersBetween(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number` (haversine, R = 6371008.8 m)
  - `nearestStop(pins: Pin[], at: {lat:number;lng:number}): { name: string; meters: number } | null` (null when no pins; uses `pin.name ?? \`Stop ${pin.idx}\``)
  - `formatNear(n: { name: string; meters: number } | null, units: Units): string | null` → `≈ 350 m from Tsuta Ramen` / `≈ 1.2 km from …` (metric string `< 1000 → "{round to 10} m"`, else `"{toFixed(1)} km"`, then through `formatDistance(raw, units)`)
- `MapPreview`/`MapPreviewData` unchanged. `near` is computed **at render time** in `PersistentMap` from `preview` + `day.pins` and passed to the canvas as `previewNear?: string | null` (new prop on `RealMapCanvasProps`, forwarded to `PreviewPopupBody`). This also gives search-picker previews the distance line (design review M5) with no picker change (scrutiny 2026-10-29).

- [ ] **Step 1: Failing tests**
  - `metersBetween` Tokyo Tower (35.6586,139.7454) ↔ Shibuya Station (35.6580,139.7016) ≈ 3970 m (±30).
  - `nearestStop([], p)` → `null`; with two pins returns the closer one's name.
  - `formatNear({name:'Tsuta Ramen', meters: 347}, 'metric')` → `'≈ 350 m from Tsuta Ramen'`; `meters: 1234` → `'≈ 1.2 km from Tsuta Ramen'`; imperial → contains `mi` or `ft`; `null` → `null`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Add `previewNear` prop (both renderers → `PreviewPopupBody` → `PlacePreviewCard` compact): one muted 12px line under the address when present. `PersistentMap` computes it with `formatNear(nearestStop(day.pins, preview), units)` (`units` prop added in Task 3 — move that layout/prop change into this task). Commit `feat(map): nearest-stop distance on map previews [TP-0077]`.

### Task 3: Client — intercept POI clicks, publish preview, add to day

**Files:**
- Create: `app/src/components/use-poi-preview.ts`
- Modify: `app/src/components/map-renderer-props.ts` (`onPoiClick?: (placeId: string) => void`)
- Modify: `app/src/components/real-map-canvas-google.tsx` (`<Map onClick>`)
- Modify: `app/src/components/persistent-map.tsx` (new props `canEdit: boolean`, `units: Units`; call the hook; pass `onPoiClick`)
- Modify: `app/src/app/trip/[id]/layout.tsx` (pass `canEdit={canWrite(role)}` and `units`)
- Modify: `app/src/lib/places/pick.ts` (export `placeFormData(dayId: string, p: PlaceDetail): FormData` built from `placeFormFrom`; refactor `place-search-picker.tsx` `submitPlace` to use it — no behavior change)
- Test: `app/src/lib/places/pick.test.ts` (create if absent) for `placeFormData`

**Interfaces:**
- Consumes: Task 1 (`fields: 'poi'`, `ClientMapsConfig.poiAdd` via `useGoogleMapsConfig()` — extend that hook's return if it doesn't expose it), Task 2 helpers, `useMapPreview()` (`begin`, `setPreview`, `clearPreview`), `fetchDetail` (export it — currently module-private) / `resolvePlace` from `@/lib/places/client`, `addPlaceInlineAction` from `@/app/actions/places`, `useToast`.
- Produces:
  ```ts
  export function usePoiPreview(o: {
    enabled: boolean;        // poiAdd && canEdit
    dayId: string | null;
    dayLabel: string;        // `Day ${idx+1}`
  }): ((placeId: string) => void) | undefined   // undefined when disabled → canvas won't intercept
  ```

Decided behavior:
- Canvas: `onClick={(e) => { const id = e.detail.placeId; if (id && onPoiClick && isValidGoogleId(id)) { e.stop(); onPoiClick(id); } }}`. When `onPoiClick` is undefined, don't stop → Google's info window.
- Hook, on click: `const token = begin()`; `fetchDetail({ id, name: '', secondary: null, address: null, lat: null, lng: null, kind: 'sight', timeZone: null }, null, 'poi')` through a module-level `createCachedLookup` keyed by place id; if `!isCurrent(token)` → drop; if `null` → toast error (copy above) and return; else `setPreview({ ...toMapPreviewData(located), ownerId: 'poi', dayLabel, onAdd, onClose: () => clearPreview('poi') }, token)`.
- `onAdd`: `resolvePlace(detail, { session: null, fields: 'full' })` (a `PlaceDetail` is assignable to `PlaceSuggestion`) → `addPlaceInlineAction(placeFormData(dayId, place))` → `router.refresh()` → toast `Place added` → `clearPreview('poi')`; returns `true` when started, `false` on failure (toast `Couldn't add place`). Rethrow Next redirect/notFound digests exactly like `place-search-picker.tsx` does.
- `PersistentMap` passes `onPoiClick` only for the Google renderer path (the MapLibre canvas ignores the prop).

- [ ] **Step 1:** Failing test for `placeFormData` (dayId set, `googlePick` present for a Google id, `kind` copied). Run → FAIL. Implement + refactor picker. Run → PASS.
- [ ] **Step 2:** Implement the hook, canvas `onClick`, layout/persistent-map props.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 4:** Commit `feat(map): tap a Google POI to preview and add it [TP-0077]`

### Task 4: Verify in the real app (prod Google keys allowed)

- [ ] `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`.
- [ ] Desktop: tap a museum POI → our card with name, photo, "≈ … from …", "Add to Day 1"; Google's own info window does **not** appear. Add → new numbered pin, toast.
- [ ] Tap 3 POIs quickly → only the last card shows.
- [ ] Open a search preview, then tap a POI → POI card replaces it.
- [ ] Mobile 390: same flow in full-map.
- [ ] `MAPS_POI_ADD=off` → Google's native info window, no interception. Viewer role (if a viewer account exists) → native info window.
- [ ] Network: one `/api/places/details?fields=poi` per new POI; re-tapping the same POI → no new request.
- [ ] Update `AGENTS-INDEX.md` (Map section: `use-poi-preview.ts`; Maps lib: `poi` fields) + `REQUIREMENTS.md` §10 one bullet "Tap a map POI → preview → add to the active day (Google mode, editors)". Commit `docs: poi click-to-add [TP-0077]`.

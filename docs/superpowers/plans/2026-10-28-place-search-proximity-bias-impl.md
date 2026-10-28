# Place search proximity bias — PR 1 Implementation Plan (TP-0061)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every place/hotel/transport search box biases results toward where the user is planning, instead of always Bangkok.

**Architecture:** The trip layout computes per-day + trip centers once with a pure chain (`lib/places/bias-center.ts`) and provides them via context; pickers pick theirs (or override, e.g. transport's other endpoint); the hook sends it as `near=lat,lng`; the internal autocomplete route parses it into a `Bias` and `searchPlaces` maps it onto each provider's own bias param. No bias → byte-identical requests to today.

**Tech Stack:** Next.js App Router, TypeScript, Vitest (node env, no component tests), pnpm.

**Spec:** `docs/superpowers/plans/2026-10-28-place-search-proximity-bias.md` (design, verified at `dd55f19`). This plan covers **PR 1 only**. PR 2 (map viewport) gets its own plan after PR 1 merges.

**Copy both docs into the worktree** (they are untracked in the main checkout).

## Global Constraints

- Bias only — never `locationRestriction` / Geoapify `filter`. A full distant name must still be found.
- No extra provider calls, no quota change.
- No bias → every provider request is byte-identical to today (`GOOGLE_BIAS` circle, `bias=countrycode:th`, Photon `lat=13.75&lon=100.5`).
- Internal route: malformed `near`/`radius` → **ignored** (no bias, still 200). Never 400.
- Radius: default **10 000 m**, clamp **[1 000, 50 000]** m.
- `near` rounded to **2 decimals** (~1.1 km, noise against a 10 km radius) client side, before the URL is built — it is part of the Geoapify/Photon 30-day fetch-cache key (Geoapify free tier is 3k credits/day, `geoapify.ts:5-7`). Spec said 3; 2 keeps more cache hits.
- Geoapify with a bias appends `|countrycode:none` (otherwise `auto` guesses from Vercel's IP).
- `lib/api/place-link.ts:164` (v1 import) stays **unbiased**. `suggestFromLink` **does** forward the bias.
- **v1 `/api/v1/places/search` is not touched.** (Deviation from spec, see "Decisions" below.)
- Verify gate per task: `pnpm -C app typecheck && pnpm -C app lint && pnpm -C app test` (tail -3).

## Decisions taken in this plan (deviations from the spec)

1. **Don't share the parser with v1.** The spec moves `parseNear`/`parseRadius` out of `v1/places/search/route.ts` into result-returning functions to share them. The two paths want different behaviour (v1: throw 400, no floor, 50 km default, no lat/lng range check; internal: ignore, floor, 10 km default, range check), so the shared part is ~4 lines of `split(',')`/`Number`. Refactoring a live v1 route for that is risk with no payoff. `toGoogleBias` is likewise not retrofitted into `text-search.ts`.
2. **Photon: `lat`/`lon` only, no `zoom`.** YAGNI until a manual test shows Photon results ranking badly.
3. **Day chain gains one step** — before the trip centroid, walk back to the nearest earlier day that has a center. On a multi-city trip (Bangkok → Chiang Mai) the trip centroid is in between both cities; the previous day is where the user actually is.
4. **Centers come from a React context set in the trip layout**, not per-picker props. The layout already loads `loadTrip` + `loadHotelsForTrip` for every trip page (`app/trip/[id]/layout.tsx:44-62`). This deletes the spec's per-picker plumbing (6 pages + `HotelsView`/`BookingsView`/form wrappers) and the add-place page's "pass the day's places" step. Hotel pickers use the trip center (spec: hotel centroid, else trip centroid — same thing via `tripBiasCenter`).
5. **Begin vs end hotel** is told apart by the synthetic id suffix (`hotel-<id>-begin|end`, `lib/day-augment.ts:72`), not position — a day with no real places is `[begin…, end…]` and position alone is ambiguous.

## Review Focus

1. **Out-of-range coords** (`near=999,999`, `near=NaN,1`, `near=13.7,`) → no bias, 200, Google never sees them (a Google 400 would silently drop every query to the Geoapify/Photon fallback — `search.ts:89-92`).
2. **Trip with hotels but no `startDate`** → no synthetic rows; chain falls through to previous-day / centroid, never throws.
3. **Bias change mid-typing** (layout refresh after adding a place shifts the day center, or transport "From" picked while "To" is debouncing) → debounce and session token are not reset.
4. **Existing exact-arg tests** (`route.test.ts:28,33,40-42`, `client.test.ts:88-89`) keep passing — bias keys appear only when a bias exists.
5. **Places/hotels with `lat` but null `lng`** (or 0,0 from a bad import) → skipped by the chain; `0,0` is a valid coordinate and is **not** special-cased.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/lib/places/bias.ts` | create | `Bias` type, `parseBiasParams`, `biasQuery`, provider mappers |
| `app/src/lib/places/bias.test.ts` | create | |
| `app/src/lib/places/bias-center.ts` | create | pure center chain (no React, no DB) |
| `app/src/lib/places/bias-center.test.ts` | create | |
| `app/src/components/place-bias-context.tsx` | create | provider + `usePlaceBias(dayId?)` |
| `app/src/app/trip/[id]/layout.tsx` | modify | compute centers once, wrap children |
| `app/src/lib/places/{google,geoapify,photon}.ts` | modify | optional `bias` |
| `app/src/lib/places/search.ts` | modify | `Deps.bias` threading |
| `app/src/app/api/places/autocomplete/route.ts` | modify | parse + forward |
| `app/src/lib/places/client.ts` | modify | `fetchSuggestions(..., near?)` |
| `app/src/components/use-place-search.ts` | modify | `near` option via ref |
| 3 pickers + `place-form` + `transport-form-client` | modify | Task 7 |

---

### Task 1: `Bias` type, internal parser, provider mappers

**Files:**
- Create: `app/src/lib/places/bias.ts`, `app/src/lib/places/bias.test.ts`

**Interfaces — Produces:**
```ts
export type LatLng = { lat: number; lng: number };
export type Bias =
  { kind: 'point'; lat: number; lng: number; radius: number }; // PR 2 adds `| { kind: 'rect'; … }`
export const DEFAULT_BIAS_RADIUS_M = 10_000;
export const MIN_BIAS_RADIUS_M = 1_000;
export const MAX_BIAS_RADIUS_M = 50_000;
export function parseBiasParams(sp: URLSearchParams): Bias | null;           // never throws
export function biasQuery(near: LatLng | null | undefined): string;          // '' or '&near=13.757,100.502'
export function toGoogleBias(b: Bias): { circle: { center: { latitude: number; longitude: number }; radius: number } };
export function toGeoapifyBias(b: Bias): string;
export function toPhotonParams(b: Bias): { lat: string; lon: string };
```

- [ ] **Step 1: Write failing tests** in `bias.test.ts`:
  - `parseBiasParams(new URLSearchParams('near=13.7563,100.5018'))` → `{ kind:'point', lat:13.7563, lng:100.5018, radius:10000 }`
  - `radius=500` → `radius:1000`; `radius=999999` → `50000`; `radius=abc` → `10000`
  - `near` values `''`, `'13.7,'`, `',100'`, `'a,b'`, `'91,0'`, `'0,181'`, `'1,2,3'`, `'Infinity,0'` → `null`
  - no `near` → `null`; `near=0,0` → point at 0,0 (not null)
  - `biasQuery(null)` → `''`; `biasQuery({lat:13.75634,lng:100.50177})` → `'&near=13.76%2C100.50'` (encoded comma; 2-decimal rounding)
  - `toGoogleBias(point)` → `{ circle: { center: { latitude, longitude }, radius } }`
  - `toGeoapifyBias(point lat 13.75 lng 100.5 r 10000)` → `'circle:100.5,13.75,10000|countrycode:none'` (lon first)
  - `toPhotonParams(point)` → `{ lat:'13.75', lon:'100.5' }`
- [ ] **Step 2:** `pnpm -C app test src/lib/places/bias.test.ts` → FAIL (module missing)
- [ ] **Step 3:** Implement. Lat ∈ [-90,90], lng ∈ [-180,180], both finite, exactly 2 comma parts, empty part rejected (same `Number('') === 0` trap as `v1/places/search/route.ts:30-32`).
- [ ] **Step 4:** test → PASS
- [ ] **Step 5:** commit `feat(places): Bias type + internal parser + provider mappers [TP-0061]`

### Task 2: Providers accept an optional bias

**Files:**
- Modify: `app/src/lib/places/google.ts:65-76`, `geoapify.ts:81-88`, `photon.ts:38-42`
- Test: `google.test.ts`, `geoapify.test.ts`, `photon.test.ts`

**Interfaces — Consumes:** Task 1 mappers. **Produces:** `googleAutocomplete(q, { ..., bias?: Bias | null })`, `geoapifyAutocomplete(text, { ..., bias?: Bias | null })`, `photonSearch(q, { ..., bias?: Bias | null })`.

- [ ] **Step 1: Failing tests** — one new case per provider asserting the biased request (Google body `locationBias` equals `toGoogleBias(b)`; Geoapify URL `bias` equals `circle:…|countrycode:none`; Photon URL `lat`/`lon`). Existing default assertions (`google.test.ts:34-40`, `geoapify.test.ts:73`, `photon.test.ts:39`) stay untouched.
- [ ] **Step 2:** run the three files → new cases FAIL
- [ ] **Step 3:** `bias ? map(bias) : <today's constant>` in each.
- [ ] **Step 4:** PASS (old and new)
- [ ] **Step 5:** commit `feat(places): providers take optional bias [TP-0061]`

### Task 3: `searchPlaces` / `suggestFromLink` thread the bias

**Files:** Modify `app/src/lib/places/search.ts:15-26,72-108`; Test `search.test.ts`

**Interfaces — Produces:** `Deps.bias?: Bias | null`. `place-link.ts:164` passes nothing → unbiased.

- [ ] **Step 1: Failing tests** in `search.test.ts`:
  - google mode, `searchPlaces('Lawson', { bias: P, ... })` → Google request body has the circle of `P`.
  - Google returns `[]` → Geoapify URL carries `circle:…|countrycode:none`; Geoapify fails → Photon URL carries `lat`/`lon` of `P`.
  - `suggestFromLink` with a link that has a query but no coords (existing fixture pattern) and `bias: P` → the downstream provider request carries `P`.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** pass `bias: deps.bias` into `googleAutocomplete` (in `tryGoogle`), `geoapifyAutocomplete`, `photonSearch`. `suggestFromLink` already forwards `deps` — verify, don't change.
- [ ] **Step 4:** PASS; also `search.routes.test.ts` green.
- [ ] **Step 5:** commit `feat(places): thread bias through searchPlaces [TP-0061]`

### Task 4: Internal route + client URL

**Files:** Modify `app/src/app/api/places/autocomplete/route.ts`, `app/src/lib/places/client.ts:5-15`; Test `route.test.ts`, `client.test.ts`

**Interfaces — Produces:** `fetchSuggestions(q, signal?, session?, near?: LatLng | null)`.

- [ ] **Step 1: Failing tests**
  - route: `?q=Lawson&near=35.69,139.70` → `searchPlaces` called with `{ session: null, bias: { kind:'point', lat:35.69, lng:139.7, radius:10000 } }`; same for the link path → `suggestFromLink(..., { session: null, bias })`.
  - route: `?q=Lawson&near=garbage` → `searchPlaces('Lawson', { session: null })` exactly (no `bias` key), status 200.
  - client: `fetchSuggestions('x', undefined, 'S', { lat: 35.6895, lng: 139.6917 })` → URL `/api/places/autocomplete?q=x&session=S&near=35.69%2C139.69`. Existing two URL asserts unchanged.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** route: `const bias = parseBiasParams(req.nextUrl.searchParams); const deps = bias ? { session: sess, bias } : { session: sess };`. Client: append `biasQuery(near)`. Use `toFixed(2)` — trailing zeros are fine, the cache key just has to be stable.
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `feat(places): autocomplete accepts near= bias [TP-0061]`

### Task 5: Pure center chain

**Files:** Create `app/src/lib/places/bias-center.ts`, `bias-center.test.ts`

**Interfaces — Produces:**
```ts
export type BiasPoint = { id?: string; lat?: number | null; lng?: number | null; synthetic?: boolean };
export function centroidOf(points: BiasPoint[]): LatLng | null;              // mean of points with finite lat & lng
export function dayCenter(places: BiasPoint[]): LatLng | null;               // steps 1-3 of the chain
export function dayBiasCenter(days: { id: string; places: BiasPoint[] }[], dayId: string): LatLng | null;
export function tripBiasCenter(days: { places: BiasPoint[] }[], hotels?: BiasPoint[]): LatLng | null;
```
Chain for `dayBiasCenter`: (1) last `!synthetic` place with coords → (2) synthetic id ending `-end` with coords (tonight) → (3) synthetic id ending `-begin` (last night) → (4) `dayCenter` of the nearest **earlier** day that has one → (5) `tripBiasCenter(days)` → `null`. `tripBiasCenter` prefers the centroid of `hotels` with coords, else of all places.

- [ ] **Step 1: Failing tests** (`dayBiasCenter`):
  - real places A(1,1), B(2,2) + end hotel H(9,9) → `{2,2}`
  - real place without coords + end hotel H → H
  - only begin hotel → begin hotel; begin + end hotels, no real → end hotel
  - synthetic rows are never picked in step 1 even when last
  - trip with no `startDate` (no synthetic rows), Day 3 empty, Day 2 last place X → X
  - Day 1 empty, later days have places → trip centroid; nothing anywhere → `null`
  - unknown `dayId` → `tripBiasCenter(days)`
  - `centroidOf` ignores `{lat: 5, lng: null}`; keeps `{0,0}`
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** commit `feat(places): pure bias-center chain [TP-0061]`

### Task 6: Trip-layout context + hook reads it

**Files:**
- Create: `app/src/components/place-bias-context.tsx` (`'use client'`)
- Modify: `app/src/lib/places/bias-center.ts` (+ test), `app/src/components/use-place-search.ts`, `app/src/app/trip/[id]/layout.tsx:89-92`

**Why a context, not props:** the trip layout already loads `loadTrip` + `loadHotelsForTrip` for **every** page under `/trip/[id]` (`layout.tsx:44-62`) and re-renders on the same refreshes that update the persistent map's pins. Every picker except trip-create lives under that layout. One provider there replaces threading a prop through 6 pages + 6 components.

**Interfaces — Consumes:** Task 4 `fetchSuggestions(..., near)`, Task 5 chain. **Produces:**
- `buildBiasCenters(trip: LoadedTrip, hotels: HotelBooking[]): BiasCenters` in `bias-center.ts`, where `type BiasCenters = { trip: LatLng | null; byDay: Record<string, LatLng | null> }`. Per day it uses `displayPlacesForDay(d, hotels, trip.startDate)` then `dayBiasCenter`; `trip` = `tripBiasCenter(days, hotels)`. Plain JSON — crosses the RSC boundary.
- `PlaceBiasProvider({ centers, children })` and `usePlaceBias(dayId?: string): LatLng | null` → `byDay[dayId]` if `dayId` given and present, else `trip`; `null` outside the provider.
- `usePlaceSearch({ ..., dayId?: string, near?: LatLng | null })` — effective center = `near !== undefined ? near : usePlaceBias(dayId)`. Kept in a ref updated each render, read inside the debounced callback, **not** in `onQueryChange`'s deps (bias change must not reset debounce or session).

- [ ] **Step 1: Failing test** `buildBiasCenters` in `bias-center.test.ts`: fixture trip (startDate, 2 days, one hotel spanning night 1) → `byDay[day1]` = last real place, `byDay[day2]` = begin hotel when day 2 is empty, `trip` = hotel centroid; trip with no places/hotels → `{ trip: null, byDay: { d1: null, … } }`.
- [ ] **Step 2:** FAIL · **Step 3:** implement `buildBiasCenters`, provider, `usePlaceBias`, hook changes · **Step 4:** PASS
- [ ] **Step 5:** layout: `const biasCenters = tripFull ? buildBiasCenters(tripFull, hotels) : { trip: null, byDay: {} }`; wrap `{children}` in `<PlaceBiasProvider centers={biasCenters}>`.
- [ ] **Step 6:** verify gate green · commit `feat(places): trip-layout bias context [TP-0061]`

### Task 7: Pickers opt in

**Files:** Modify `place-search-picker.tsx:41`, `place-autocomplete.tsx` (+ `place-form.tsx:120`), `transport-place-picker.tsx`, `transport-form-client.tsx:321,347`, `bias-center.ts` (+ test). `HotelSearchPicker` / `HotelPlacePicker`: **no change** — they get the trip center from context for free.

**Interfaces — Consumes:** Task 6 hook options.

- [ ] **Step 1: Failing test** for the transport helper in `bias-center.test.ts`:
  `transportNear(other: { lat: number | null; lng: number | null } | null): LatLng | null | undefined` → `{lat,lng}` when the other endpoint has both coords, else `undefined` (= "fall back to context"). Cases: picked with coords → coords; airport code with null coords → `undefined`; `null` → `undefined`.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5:** wire:
  - `PlaceSearchPicker` → `usePlaceSearch({ minChars, limit: 8, dayId })` (covers itinerary accordion **and** the add-place page — both pass `dayId` already).
  - `PlaceAutocomplete` gets optional `near?: LatLng | null`; `place-form.tsx:120` passes `{lat: v.lat, lng: v.lng}` when both set. Trip-create is outside the trip layout → no provider → no bias (unchanged).
  - `TransportPlacePicker` gets optional `near?: LatLng | null` → hook; From picker `near={transportNear(to)}`, To picker `near={transportNear(from)}`. `transport_booking` stores no coords, so a re-opened edit form falls back to the trip center — intended.
- [ ] **Step 6:** verify gate green
- [ ] **Step 7: Manual** (`pnpm -C app dev`, Network tab): Tokyo trip Day-1 inline picker sends `near=35.69,…`; hotel search sends trip center; transport To after picking a From with coords sends the From coords; trip-create sends no `near`.
- [ ] **Step 8:** commit `feat(places): pickers use day/trip/endpoint bias [TP-0061]`

### Task 8: Ship PR 1

- [ ] Manual (from spec): Tokyo trip w/ startDate + Shinjuku hotel, Day 1 "Lawson" → Shinjuku first; Bangkok trip with no places → same results as today.
- [ ] Open PR `feat(places): proximity-bias place search [TP-0061]` (CI `verify` + Vercel required). Link it to the thread.
- [ ] Keep TP-0061 in `doing`; PR 2 (viewport) plan is written after merge.

## Not in this plan (PR 2)

Map-viewport bias (`lib/maps/viewport-store.ts`, `bbox=` param, both map renderers) — see spec §"PR 2". PR 2 adds the `rect` variant + its mapper branches, the store, the `bbox` parse, and viewport-over-context precedence inside `usePlaceBias`.

## Scrutinize log (2026-10-28, applied above)

| # | Severity | Finding | Change made |
|---|---|---|---|
| 1 | major | Draft threaded `near` props through 6 pages + 6 components and added a `loadBiasCenter` server helper, but `app/trip/[id]/layout.tsx:44-62` already loads trip + hotels for every trip page. | One `PlaceBiasProvider` in the layout (Task 6); pickers read it. Hotel pickers need zero changes. |
| 2 | major | 3-decimal `near` (~100 m) shatters the Geoapify/Photon 30-day fetch cache (key = URL), and Geoapify free tier is 3k credits/day (`geoapify.ts:5-7`) — contradicts "no quota impact". | Round to 2 decimals (~1.1 km vs a 10 km radius). |
| 3 | minor | Review Focus #1 claimed a Google 400 empties results; `tryGoogle` catches and falls through to Geoapify/Photon (`search.ts:89-92`). | Reworded; range check still kept. |
| 4 | nit | Task 1 built `rect` mappers for PR 2 (YAGNI). | Point-only now; PR 2 adds `rect`. |
| ✓ | verified | Synthetic hotel ids end `-begin`/`-end` on both the page augment (`trip/[id]/page.tsx:208-211` → `hotelToSyntheticPlace`) and `day-augment.ts:72`; real `Place` rows carry `lat`/`lng` into the accordion; route/client exact-arg tests are protected by "add key only when present". | — |

# Search-Result Distance + Map Search Shortcut Implementation Plan

> **Ticket:** TP-0100

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D6 — send origin rounded to 3 decimals; hide the distance line when it would read ≈ 0 m** (default kept).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each add-place search result shows "≈ 1.2 km from <stop>" for the day being planned, with no extra billed lookups. On desktop, a "Search places" button on the map (plus the `/` key) jumps straight to the active day's search box.

**Architecture:** The layout already builds every day's pins (`buildMapDays`). A small `DayStopsProvider` hands them and the user's units to the search pickers. A pure `suggestionNear` picks the distance source per row: the row's own coordinates measured to the nearest stop (Geoapify, Photon, pasted links), or, for Google rows, which carry no coordinates, Google's own `distanceMeters` from the day's anchor stop. Google returns that value inside the same Autocomplete response once the request carries an `origin`. The map shortcut does not add a second search box. It opens the active day in the list and focuses that day's existing `PlaceSearchPicker`, so sessions, previews and adds keep one owner.

**Tech Stack:** Next.js 16, React 19, Google Places API (New) Autocomplete (`origin` → `distanceMeters`), vitest.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §2.2 M5 ("≈ 2.3 กม. จากจุดที่ใกล้สุดในวันนี้" under each result, client-side haversine, free), §3.4 bullet 3 (search box floating on the map, so you don't scroll to the bottom of the day), §7.4 (≥1024: "ช่องค้นหาลอย"), roadmap MAP-11 (distance part; preview framing is MAP-04's camera work).

**Touches:** `place-search-picker.tsx` (+ `.module.css`), `use-place-search.ts`, `lib/places/{google,search,bias,client,types}.ts`, `app/api/places/autocomplete/route.ts`, `app/trip/[id]/layout.tsx`, `persistent-map.tsx` (one button in the day bar's top row), `days-accordion.tsx` (one listener), `lib/map-preview.ts`, `docs/ops/maps-cost-guardrails.md`.

**Depends on:** nothing for Tasks 1–3. Task 4 (map button) goes into the md+ top row that `2026-10-29-map-day-bar-ghost-pins.md` adds to `PersistentMap` (bar left, this button right; no width math). Tasks 1–3 can ship as their own PR ahead of the day bar, and Task 4 then follows the day bar. If they ship together, merge after the day bar. Scrutiny: `2026-10-29-map-search-distance.scrutiny.md`.

## Which providers give coordinates in autocomplete (verified in code)

| Provider (order in `searchPlaces`, `lib/places/search.ts:101-112`) | Coords in suggestion? | Distance source |
|---|---|---|
| Google Autocomplete (New), `google` mode, prod | **No**: `lat: null, lng: null` (`lib/places/google.ts:96-104`) | `distanceMeters` from `origin` (Task 2) |
| Geoapify autocomplete | Yes (`geoapify.ts:28-38`) | nearest stop, client haversine |
| Photon fallback | Yes (`photon.ts:20-29`) | nearest stop, client haversine |
| Pasted Google Maps link (`suggestFromLink`) | When the link carries coords | nearest stop, else none |

Prod runs `google` mode, so a client-only M5 would show the distance on almost no rows there. Resolving coordinates per row would cost a billed Details call each (Essentials, ≥ 1 per row × 8 rows), which is exactly what we must not add.

## Decision needed

1. **Google rows: send `origin` so Autocomplete returns `distanceMeters`?** Default: **yes.**
   - Verified 2026-10-29 against the official docs ([Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete): `origin` is "the origin point from which to calculate straight-line distance to the destination… If this value is omitted, straight-line distance will not be returned"; `distanceMeters` sits on `placePrediction`. It is omitted for `route` predictions and when the value is `0` (< 1 m), and Google says "don't display a zero distance". [Usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing): Autocomplete is billed per request / session (Autocomplete Requests, Autocomplete Session Usage), with no field-mask or parameter tiers; `origin`/`distanceMeters` aren't mentioned as billing inputs.) Our autocomplete call sends **no** `X-Goog-FieldMask` (`lib/places/google.ts:84-89`), so the full prediction, including `distanceMeters`, comes back. If a mask is ever added, it must list `suggestions.placePrediction.distanceMeters`.
   - Cost: `origin` is a request field of the same `places:autocomplete` call. The request stays on the Autocomplete Requests / Session Usage SKU, with no new call, no field mask and no Details (see `docs/research/2026-10-23-google-places-billing-verification.md` §SKU table; nothing there is priced per field for Autocomplete). The in-app cap `gplaces:autocomplete` (300/day) is unchanged.
   - Semantics: Google measures geodesic distance from **one** origin, so a Google row reads "≈ 1.2 km from <anchor>", where the anchor is the day's **last located stop**: tonight's hotel when there is one, else the last place. A Geoapify/Photon row reads "from <nearest stop>". Both name the stop they measure from, so neither is misleading.
   - Privacy: `origin` is rounded to 3 decimals (≈ 110 m), coarser than the stop itself and finer than the 2-decimal `near` bias (`bias.ts:78-81`), because the distance is shown to the user. Trade-off: rounding moves the origin by up to ~55 m, so a result 50 m from the hotel can read "≈ 100 m". 4 decimals (≈ 11 m) would fix that and add little exposure, since Google already gets the query and a 2-decimal `near`. Left to the user (see scrutiny).
   - If declined: drop Task 2, and Google rows simply show no distance line.
2. **Floating search on the map (§3.4).** Default: **build only the cheap shortcut** (Task 4): a top-right "Search places" button plus the `/` key, which open and focus the active day's existing picker in the list. A real search input floating on the map is **not** recommended now:
   - It would be a second `PlaceSearchPicker` instance with its own autocomplete session token, preview `ownerId` and busy state.
   - It would compete for the map's top edge with the day bar and the POI/preview card.
   - On desktop the list (with its picker) is always beside the map, so the real pain is only "scroll to the bottom of the day", which the shortcut removes.
   - Revisit with the mobile bottom sheet (§12 ขั้น B), where the list isn't visible.

## Global Constraints

- **No new billed calls.** No per-row Details/geocode; the distance comes from coords already in the suggestion or from `distanceMeters` in the existing Autocomplete response.
- Copy (EN): the row line uses `formatNear`'s format `≈ {dist} from {stop name}` (`lib/map-preview.ts:167-173`), in the user's units. Button `Search places`, with `aria-keyshortcuts="/"` and visible hint `/`.
- Distances ≥ 100 km print as whole km (`≈ 812 km`, not `≈ 812.3 km`). This changes `formatNear`, which the map preview popup shares; that's intended.
- Row line style: 12px, `color: var(--muted)`, one line with ellipsis, under `.itemSecondary` (`place-search-picker.module.css:141`). No new hex.
- `/` shortcut only: on md+, on the itinerary route, for editors (`canEdit`), and never while focus is in an `input`, `textarea`, `select` or `[contenteditable]`, or with a modifier key held.
- Payload: `DayStopsProvider` receives the same `Pin[]` arrays already passed to `PersistentMap`. Don't build new objects for it, so the RSC payload reuses the references rather than adding a second copy.

## Review Focus

1. **Day with no located stops:** no anchor and no nearest stop → no distance line and no `origin` param. Must not show "≈ 0 m" or "from Stop undefined". Test `suggestionNear` / `dayAnchor` with `[]` (Task 1).
2. **Google row while the autocomplete breaker is open:** the results are Geoapify rows with coords and no `distanceMeters`, so the nearest-stop path must kick in. Test: a row with coords **and** `distanceMeters` prefers coords (Task 1).
3. **Very far result** (Photon returns a namesake in another country): the line must stay readable (`≈ 9012 km`, whole km) because it flags the wrong city. Test `formatNear` ≥ 100 km (Task 1).
4. **Invalid `origin` query param** (NaN, out of range, 3 parts) must be ignored, never forwarded to Google. Test `parseOriginParam` (Task 2).
5. **Shortcut when the active day is collapsed in the list:** the picker isn't mounted when the button is pressed. The day must open, and the picker must focus once it mounts (pending-request handoff). Test `takeDaySearchFocus` semantics (Task 4) plus a manual check.

---

### Task 1: Pure helpers: row distance, day anchor, whole-km format

**Files:**
- Modify: `app/src/lib/map-preview.ts`
- Modify: `app/src/lib/places/types.ts` (`PlaceSuggestion.distanceMeters?: number | null`, the Google geodesic distance from the request `origin`)
- Test: `app/src/lib/map-preview.test.ts`

**Interfaces:**
- Consumes: `nearestStop`, `formatNear` (same file); `Pin`; `PlaceSuggestion`; `Units`.
- Produces:
  - `dayAnchor(pins: Pin[]): Pin | null`: the last pin (end-of-day hotel or last stop); `null` for `[]`
  - `suggestionNear(s: PlaceSuggestion, pins: Pin[], units: Units): string | null`. When `s.lat`/`s.lng` are numbers → `formatNear(nearestStop(pins, s), units)`. Else, when `s.distanceMeters` is a number and `dayAnchor(pins)` exists → `formatNear({ name: anchor.name ?? \`Stop ${anchor.idx}\`, meters: s.distanceMeters }, units)`. Else `null`.
  - `formatNear`: `meters >= 100_000` → `` `${Math.round(meters / 1000)} km` `` before `formatDistance`

- [ ] **Step 1: Failing tests**

```ts
const pins: Pin[] = [
  { id: 'a', idx: 1, kind: 'sight', lat: 35.6586, lng: 139.7454, name: 'Tokyo Tower' },
  { id: 'h', idx: 2, kind: 'hotel', lat: 35.6580, lng: 139.7016, name: 'Shibuya Stream Hotel' },
];
const sug = (o: Partial<PlaceSuggestion>): PlaceSuggestion =>
  ({ id: 'x', name: 'X', secondary: null, address: null, lat: null, lng: null, kind: 'food', timeZone: null, ...o });

describe('suggestionNear', () => {
  it('coords → nearest stop', () =>
    expect(suggestionNear(sug({ lat: 35.6584, lng: 139.7018 }), pins, 'metric')).toBe('≈ 50 m from Shibuya Stream Hotel'));
  it('no coords + distanceMeters → anchor (last pin)', () =>
    expect(suggestionNear(sug({ distanceMeters: 1234 }), pins, 'metric')).toBe('≈ 1.2 km from Shibuya Stream Hotel'));
  it('coords win over distanceMeters', () =>
    expect(suggestionNear(sug({ lat: 35.6586, lng: 139.7454, distanceMeters: 99999 }), pins, 'metric')).toBe('≈ 0 m from Tokyo Tower'));
  it('empty day → null', () => {
    expect(suggestionNear(sug({ lat: 1, lng: 2 }), [], 'metric')).toBeNull();
    expect(suggestionNear(sug({ distanceMeters: 500 }), [], 'metric')).toBeNull();
  });
  it('neither → null', () => expect(suggestionNear(sug({}), pins, 'metric')).toBeNull());
});
it('dayAnchor', () => {
  expect(dayAnchor(pins)?.id).toBe('h');
  expect(dayAnchor([])).toBeNull();
});
it('formatNear: whole km from 100 km', () =>
  expect(formatNear({ name: 'X', meters: 812_345 }, 'metric')).toBe('≈ 812 km from X'));
```

(`35.6584,139.7018` is 48 m from the hotel and 3.9 km from the tower → `≈ 50 m`.)

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/map-preview.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Existing `formatNear` tests (`≈ 350 m`, `≈ 1.2 km`) must stay green.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(search): row distance helpers (nearest stop / day anchor) [TP-0100]`

### Task 2: Server: Autocomplete `origin` → `distanceMeters` (Google only)

**Files:**
- Modify: `app/src/lib/places/bias.ts` (add `parseOriginParam`, `originQuery`)
- Modify: `app/src/lib/places/google.ts` (`googleAutocomplete` option `origin?: LatLng | null`; body `origin: { latitude, longitude }` when set; `Prediction.distanceMeters?: number`; map it to `distanceMeters` when it is a finite number ≥ 0)
- Modify: `app/src/lib/places/search.ts` (`Deps.origin?: LatLng | null`, forwarded by `tryGoogle` only, `:75-95`)
- Modify: `app/src/app/api/places/autocomplete/route.ts` (today `deps` is built as a union literal at `:17`. Rebuild it as `{ session: sess, ...(bias ? { bias } : {}), origin: parseOriginParam(req.nextUrl.searchParams) }` and pass `origin` only to `searchPlaces`, not to `suggestFromLink`)
- Test: `app/src/lib/places/bias.test.ts`, `app/src/lib/places/google.test.ts`, `app/src/lib/places/search.test.ts`

**Interfaces:**
- Produces:
  - `parseOriginParam(sp: URLSearchParams): LatLng | null`: reads `origin=lat,lng`. Exactly 2 finite numbers, lat within [-90, 90], lng within [-180, 180], else `null`.
  - `originQuery(o: LatLng | null | undefined): string` → `` `&origin=${encodeURIComponent(`${lat.toFixed(3)},${lng.toFixed(3)}`)}` `` or `''`
  - `PlaceSuggestion.distanceMeters` populated for Google rows when `origin` was sent

- [ ] **Step 1: Failing tests**
  - `parseOriginParam(new URLSearchParams('origin=35.658,139.702'))` → `{ lat: 35.658, lng: 139.702 }`. `'origin=NaN,1'`, `'origin=91,0'`, `'origin=1,2,3'`, and no param each → `null`.
  - `originQuery({ lat: 35.65812, lng: 139.70161 })` → `'&origin=35.658%2C139.702'`; `originQuery(null)` → `''`.
  - google.test (pattern of `'uses a supplied proximity bias'`, `:65`): with `origin: { lat: 35.658, lng: 139.702 }` the POSTed body has `origin: { latitude: 35.658, longitude: 139.702 }`. A fixture prediction carrying `distanceMeters: 1234` maps to `distanceMeters: 1234`. Without `origin`, the body has no `origin` key.
  - search.test: `searchPlaces('ramen', { origin, …googleDeps })` forwards origin to the Google fetch. In the Geoapify path (no google), the Geoapify URL has no `origin`.
- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/places` → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** In `docs/ops/maps-cost-guardrails.md`, add one sentence to the Google Places API (New) table row (`:26`; there is no separate Autocomplete bullet): "Autocomplete sends `origin` (the day's last stop, 3 decimals) to get `distanceMeters`: a request field, no extra call or SKU."
- [ ] **Step 6: Commit** `feat(places): autocomplete origin for result distances (no new SKU) [TP-0100]`

### Task 3: Client: day stops context + distance line on result rows

**Files:**
- Create: `app/src/components/day-stops-context.tsx`
- Modify: `app/src/app/trip/[id]/layout.tsx:70-86` (build `stopsByDay`, wrap `{children}`)
- Modify: `app/src/lib/places/client.ts` (`fetchSuggestions(q, signal, session, near, bbox, origin?: LatLng | null)` appends `originQuery(origin)`)
- Modify: `app/src/components/use-place-search.ts` (option `origin?: LatLng | null`, kept in a ref like `nearRef`, passed to `fetchSuggestions`)
- Modify: `app/src/components/place-search-picker.tsx` (`:47` hook call; the row body at `:276-282`)
- Modify: `app/src/components/place-search-picker.module.css` (`.itemNear`, plus a dark override next to `:304`)

**Interfaces:**
- Consumes: Task 1 `suggestionNear`, `dayAnchor`; Task 2 `originQuery`.
- Produces:
  ```ts
  export function DayStopsProvider(p: { stopsByDay: Record<string, Pin[]>; units: Units; children: React.ReactNode }): JSX.Element
  export function useDayStops(dayId: string | undefined): { pins: Pin[]; units: Units } | null   // null outside the provider or for an unknown day
  ```

Decided behavior:
- Layout: `const stopsByDay = Object.fromEntries(mapDays.map((d) => [d.id, d.pins]))`. Render `<DayStopsProvider stopsByDay={stopsByDay} units={units}><PlaceBiasProvider …>{children}</PlaceBiasProvider></DayStopsProvider>`. Both the inline picker and the `/day/[dayId]/place/new` page picker sit under it.
- Picker: `const stops = useDayStops(dayId)` and `const anchor = dayAnchor(stops?.pins ?? [])`. Pass `origin: anchor ? { lat: anchor.lat, lng: anchor.lng } : null` to `usePlaceSearch`. Per row, `const near = stops ? suggestionNear(p, stops.pins, stops.units) : null`, rendered as `<div className={styles.itemNear}>{near}</div>` after `.itemSecondary` when non-null.
- Hotel/transport pickers: unchanged (no day context, out of scope).

- [ ] **Step 1:** Implement per the above.
- [ ] **Step 2:** `cd app && pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 3: Commit** `feat(search): "≈ 1.2 km from <stop>" under add-place results [TP-0100]`

### Task 4: Map "Search places" button + `/` shortcut → focus the day's picker

**Files:**
- Create: `app/src/lib/day-search-focus.ts`
- Create: `app/src/components/map-search-button.tsx`
- Modify: `app/src/components/days-accordion.tsx` (listener next to the open-state logic, `:98-116`)
- Modify: `app/src/components/place-search-picker.tsx` (inline variant consumes a pending focus)
- Modify: `app/src/components/persistent-map.tsx` (render the button)
- Test: `app/src/lib/day-search-focus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DAY_SEARCH_EVENT = 'tp:day-search';           // CustomEvent<{ dayId: string }> on window
  export function requestDaySearchFocus(dayId: string): void // sets pending, dispatches (no-op dispatch without window)
  export function takeDaySearchFocus(dayId: string): boolean // true once if pending === dayId, then clears
  export function MapSearchButton(p: { dayId: string; enabled: boolean }): JSX.Element
  ```

Decided behavior:
- `MapSearchButton`: `<button type="button" aria-keyshortcuts="/" className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-[var(--shadow-md)]">`. It is placed as the right-hand child of the day-bar plan's top row (`absolute inset-x-4 top-4 z-10 hidden md:flex justify-between`), so it never overlaps the bar and the canvas's top-right overlay (degraded chip) sits below the row on md+, containing the `<Search>` icon, `Search places`, and `<kbd className="text-xs text-muted">/</kbd>`. Click → `requestDaySearchFocus(dayId)`. The component also registers a `window` `keydown` handler for `/` (rules in Global Constraints) → `preventDefault()` + the same call. The component stays mounted below md (only the row is `hidden`), so the handler must check `useIsWide()` itself. Otherwise `/` on a phone with a hardware keyboard would open a day the user can't see the map for.
- `PersistentMap`: `{everOpened && canEdit && day ? <MapSearchButton dayId={day.id} enabled={onItinerary} /> : null}` as the second child of the top row. The section is `hidden` off the itinerary route, but the `keydown` handler must also check `onItinerary`, so pass `enabled={onItinerary}` (add `enabled: boolean` to the props).
- `DaysAccordion`: `useEffect` adds a `DAY_SEARCH_EVENT` listener → `setOpenIds((prev) => new Set(prev).add(e.detail.dayId))`.
- `PlaceSearchPicker` (inline only): one `useEffect` on mount and one `DAY_SEARCH_EVENT` listener. Each calls `takeDaySearchFocus(dayId)`, and if true → `boxRef.current?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })` then `inputRef.current?.focus({ preventScroll: true })`. This covers both an already-open day (event) and a day that opens because of the event (mount).

- [ ] **Step 1: Failing test**

```ts
it('pending focus is taken once, by the matching day only', () => {
  requestDaySearchFocus('d2');
  expect(takeDaySearchFocus('d1')).toBe(false);
  expect(takeDaySearchFocus('d2')).toBe(true);
  expect(takeDaySearchFocus('d2')).toBe(false);
});
```

- [ ] **Step 2:** `cd app && pnpm vitest run src/lib/day-search-focus.test.ts` → FAIL. **Step 3:** implement the module. **Step 4:** → PASS.
- [ ] **Step 5:** Implement the button, accordion listener, picker consumer, and day-bar width.
- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm test` → pass (tail -3).
- [ ] **Step 7: Commit** `feat(map): Search places shortcut focuses the day's picker [TP-0100]`

### Task 5: Verify in the real app, update docs

- [ ] `cd app && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210`, trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
- [ ] 1440×900: on day 1 type `ramen`. Google rows show `≈ … from <day 1's last stop>`. In DevTools, the `/api/places/autocomplete` request carries `&origin=` with 3 decimals, and there are **no** extra `/api/places/details` requests while typing. Screenshot.
- [ ] Empty day: no distance lines and no `origin` param.
- [ ] `MAPS_PROVIDER=open` (Geoapify/Photon): rows show `from <nearest stop>`. Search a namesake far away (e.g. `Kamakura` from a Bangkok trip, if available) → whole-km line.
- [ ] Imperial units (Settings) → `mi`/`ft`.
- [ ] Press `/` on the itinerary (focus on the page body) → the active day opens if collapsed, its search box scrolls into view and is focused. Pressing `/` while typing in a note or input types a slash. Click `Search places` on the map → same.
- [ ] Viewer account (if one exists): no button, `/` does nothing.
- [ ] 390×844: no button; row distance lines show in the list.
- [ ] Update `AGENTS-INDEX.md`: Map section `map-search-button.tsx`. Place pickers section: `day-stops-context.tsx` (`DayStopsProvider`, `useDayStops`; trip layout). Maps lib: `day-search-focus.ts`. Extend the `lib/map-preview.ts` line with `dayAnchor` / `suggestionNear`. Extend the `places/google.ts` line: autocomplete `origin` → `distanceMeters`.
- [ ] Update `REQUIREMENTS.md`. §10 adds "Add-place search results show the distance to the day: '≈ 1.2 km from <stop>' (nearest stop when the result has coordinates; Google results measure from the day's last stop via Autocomplete `origin`, no extra lookup)." and "Desktop: a 'Search places' button on the map (and the `/` key) focuses the active day's search."
- [ ] Commit `docs: search result distance + map search shortcut [TP-0100]`

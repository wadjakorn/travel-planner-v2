# TP-0142 Transport endpoints (from/to coordinates) + ride lines on the map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transport booking (flight, train, car, ferry) can carry coordinates for both ends. An agent sends `from` / `to` as `{ name?, lat, lng }`, `{ googleMapsUrl }` or `{ query, near? }`, and the server resolves them through the same `applyPlaceLink` pipeline places and hotels use. The web form saves the coordinates its place picker already resolves (and drops today). The trip map then draws each of the day's rides as a line between its two ends. Two warnings help agents: `transport_without_day` and `iata_code_invalid`.

**Architecture:** Six additive `transport_booking` columns (`from_lat`, `from_lng`, `from_place_id`, `to_lat`, `to_lng`, `to_place_id`). A thin adapter `lib/api/transport-link.ts` mirrors `hotel-link.ts`: it reads the `from`/`to` objects, calls `applyPlaceLink` once per end, and never searches by itself. REST POST resolves before the idempotent tx (same as hotels). REST PATCH re-resolves only the end that was sent. Import resolves transport after hotels and places on the same `LinkBudget`. The display layer adds `rides` to `MapDay`; both renderers draw them with one shared pure helper (`rideArcs` in `lib/map-route.ts`) so MapLibre and Google stay in sync.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + drizzle-kit, Neon Postgres (`db` = neon-http, `dbNode` = postgres-js), Vitest, Playwright (`pnpm e2e:mobile`).

**Ticket:** TP-0142 (epic TP-0138, wave 2). Decision comment 2026-11-04 on the ticket narrows the scope:
- DO: `from`/`to` via coords / `googleMapsUrl` / `query` through `place-link.ts`; draw the leg on the map; `transport_without_day`; 3-letter IATA check as a **warning only**; decide on `segment.transportId`.
- DON'T: an IATA → airport-coordinates table (agents send `from: { query: "Kansai International Airport" }`).
- MOVED OUT: SKILL.md `dayIdx`/`fromDate` (done in TP-0148). This plan still documents the new `from`/`to` shape in SKILL.md and API.md.

**Delivery: two PRs under TP-0142** (scrutiny `2026-11-04-tp-0142-transport-endpoints.scrutiny.md`, recommendation accepted):
- **PR A — data** (Tasks 0–6, 9a, 10a): columns, REST, import, web form, warnings, API/SKILL docs. Self-contained; agents can store ends as soon as it merges.
- **PR B — map** (Tasks 7–8, 9b, 10b): branched from `origin/main` **after PR A merges**, worktree `../travel-planner-v2-tp-0142-map`, branch `feat/tp-0142-ride-lines`.

**Spec:** none beyond the ticket. The AAUX2 design doc (`docs/superpowers/specs/2026-11-04-aaux2-legs-and-tbd-hotels-design.md`) only says the airport → first stop leg and hotel-to-hotel move days are "TP-0142's job" (§1 lines 65, 68, 119). Rulings below settle how far this ticket goes there.

## Rulings (made before execution — scrutiny may overturn)

| # | Question | Ruling | Why | Cost if wrong |
|---|---|---|---|---|
| R1 | Link transport to segments (`segment.transportId`)? | **No.** Rides stay keyed by `dayIdx` / `fromDate` (`ridesForDay`). | A segment is a leg between two adjacent places; a ride's ends are usually not places of the day (airport, station). Linking adds a FK, cascade rules and reorder bugs (TP-0150 class) for no current consumer. | A later ticket adds the FK; no data migration needed because nothing is stored now. |
| R2 | Connect a ride to the day's first/last stop on the map (airport → first stop)? | **No connector line in v1.** Only the ride itself (from → to) is drawn. | Deciding which stop a ride connects to needs time ordering (ride `fromTime`/`toTime` vs place `time`), which is often missing (`flight_without_time`). A wrong connector is worse than none. The ride's arrival end is drawn as a small marker, so the gap to the first stop is visible. | Follow-up ticket for a connector once times are reliable; purely additive. |
| R3 | Camera: include ride ends in the day's fit bounds? | **No** — the canvases keep framing `pins.length ? pins : fallbackFrame`, and rides are never passed to `ActiveFocus`. Exception: a day with **no pins** but a located ride end frames that day's ride ends through a new `DayFallback` variant `'ride'` (Task 7), checked **before** the prev-day/stay/trip fallbacks. | A BKK→KIX ride would zoom day 1 out to all of East Asia and hide the stops. A line that runs off the screen still shows "came from that way". | Pass ride ends into the canvases' fit input later. |
| R4 | Which rides are drawn? | Only rides with **both** ends located. A ride with one located end draws only the endpoint marker. | A line needs two points; a lone marker still shows where the ride arrives/departs. | — |
| R5 | Ride lines interactive? | **No** (no tap target, no badge click). One non-interactive type badge (plane/train/car/boat) at the mid-point. Hidden together with route lines when the legs toggle is off. | Keeps the tap model (pins + legs select a stop) unchanged; a ride has no stop to select. | Add a tap → Bookings deep link later. |
| R6 | Approximate ends (`coords_approx`)? | **Not stored.** No `from_coords_approx` column. | Ride ends are drawn as small neutral markers; precision has no display. YAGNI. | One additive column later. |
| R7 | Does `from: { name }` alone (or top-level `fromName`) trigger a lookup? | **No.** Only `googleMapsUrl`, `lat`/`lng` or `query` resolve. `name` is the label (copied to `fromName` when `fromName` is absent). A `googleMapsUrl` that fails to read **never falls back to a name search**: the end shell uses kind `'transit'` (which `applyPlaceLink` never searches, `place-link.ts:224`, but whose link is still read before that line) unless the end carries a `query`, in which case kind `'sight'` (so the query is searched). No post-hoc guard, no wasted lookup. | Back-compat, and a label like "BKK" is a poor search string. | Agents add `query`. |
| R8 | Import resolve order | hotels → **places** → transport, one shared `LinkBudget`. | Places are the plan's core; transport ends are few and airports are easy to send as `lat`/`lng`. A skipped end yields `lookup_skipped` with a `/transport/<i>/from` path. | Swap two calls in `resolveImport`. |
| R9 | `from` object and flat `fromLat`/`fromLng`/`fromPlaceId` in the same body | **The object wins**; the flat `from*` coordinate keys are dropped silently (documented in API.md). Flat fields stay writable when no object is sent. | A GET round-trip of any row plus a new `from` must work (re-review R5). | Ambiguity → explicit error is cheaper than a precedence rule agents must learn. | Relax later. |
| R10 | Clearing / writing an end with flat fields | `from: null` clears `fromLat`/`fromLng`/`fromPlaceId` (labels untouched). Flat fields are a **unit**: if any of `fromLat`/`fromLng` is present in a body, **both** must be present (400 otherwise); a pair of nulls clears all three; a new non-null pair without `fromPlaceId` sets `fromPlaceId` null (no stale id). Same for `to*`. | No half pairs ever stored (scrutiny M4). | — |
| R11 | IATA check | Only `type === 'flight'`. Warn `iata_code_invalid` (path `/transport/<i>/fromCode` on import; `/fromCode` on POST) when a **non-empty trimmed** `fromCode`/`toCode` is not `/^[A-Z]{3}$/`. Value stored as sent (no upper-casing). | Ticket: warning, not error. `OSA` is a valid IATA metro code, so only the format is checked. | — |
| R12 | `transport_without_day` | Emitted when `dayIdx == null` **and** (`fromDate` is empty **or**, on import only, `fromDate` matches none of the plan's day dates) — on import (path `/transport/<i>`) and on REST POST (no path; POST checks only the empty case). Not on PATCH. | These rides never appear on any itinerary day (`ridesForDay`). PATCH is partial; checking it needs the stored row — skip for v1. | — |
| R13 | REST response shape | POST/PATCH return `{ transport, warnings }` (warnings `[]` when none). Additive to today's `{ transport }`. | Same as hotels (TP-0143). | — |
| R15 | Order of checks on POST/PATCH | Validate everything (body shape, `type`, coords, ends) and check trip write access **before** any lookup, so a 400/403 spends nothing. Idempotent replays of POST still re-resolve (inherited from hotels; documented). | Scrutiny N2/N3. | — |
| R16 | Changing `fromCode`/`fromName` without a new `from` | Coords are kept (R7). Documented in API.md: send a new `from` when you change the place. | Scrutiny N10. | — |
| R17 | Overnight ride | Drawn only on its departure day (same as `ridesForDay`). Stated in REQUIREMENTS. | Scrutiny N12. | — |
| R14 | Bias for `query` | Only the `near` the agent sends (same parser as places). No automatic trip bias. | `applyPlaceLink` already takes `near`; a trip-centre bias would pull "Suvarnabhumi Airport" toward Osaka. | — |

## Global Constraints

- Work in a fresh worktree branched from the latest `origin/main`: `git worktree add ../travel-planner-v2-tp-0142 -b feat/tp-0142-transport-endpoints origin/main`. Never in the main checkout.
- Every commit subject carries `[TP-0142]`; every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Generate the migration with `pnpm db:generate --name transport_endpoints` (in `app/`). Never hand-write/number it. Expect `0025_transport_endpoints.sql`. All columns nullable, additive (Preview DB is shared, TP-0050).
- Column names verbatim: `from_lat double precision`, `from_lng double precision`, `from_place_id text`, `to_lat double precision`, `to_lng double precision`, `to_place_id text`. Drizzle keys `fromLat`, `fromLng`, `fromPlaceId`, `toLat`, `toLng`, `toPlaceId`.
- The adapter must not fork search logic: `transport-link.ts` calls `applyPlaceLink` only (never `searchPlaces*` / geocoders directly). No edits to `place-link.ts`.
- `from`/`to` objects, `googleMapsUrl`, `query`, `near` are resolve-time inputs and are never stored as-is.
- No new paid Google calls beyond what `applyPlaceLink` makes; transport spends the same `LinkBudget`. The web form never geocodes server-side (the picker already resolved).
- Warning shape stays `{ code, path?, message }`. New codes: `transport_without_day`, `iata_code_invalid`. Import paths are 0-based: `/transport/<i>`, `/transport/<i>/from`, `/transport/<i>/to`, `/transport/<i>/fromCode`, `/transport/<i>/toCode`.
- UI strings via `messages/en.json` + `th.json` (flat snake_case, same placeholders), read via `useT()`.
- Tests: Vitest from `app/` (`pnpm vitest run <file>`). Integration suites need `TEST_DATABASE_URL` (local docker `tp-test-pg`, migrate with `DATABASE_URL_UNPOOLED=postgres://postgres:pw@127.0.0.1:55433/tp_test pnpm db:migrate` — never `DATABASE_URL=`, which `drizzle.config.ts` shadows). A skipped integration suite is not a pass.
- e2e targeted only: one `pnpm build`, grep the affected spec on `pixel-7` + `desktop`. Mobile verified via `pnpm e2e:mobile` emulation.
- `pnpm typecheck` after the last edit; keep only the last 3 lines of build/verify output.

## Review Focus

1. **Back-compat body.** Today's body `{ type, title, fromCode, fromName, toCode, toName }` must create exactly as before: zero lookups, `fromLat` null, `warnings` possibly containing only `transport_without_day`/`iata_code_invalid`. Test: Task 3 `legacy body makes no lookup`.
2. **PATCH without endpoint input** (e.g. `{ seats }`) makes zero lookups and keeps stored coords. PATCH `{ to: {...} }` re-resolves only `to`. Test: Task 4.
3. **PATCH lookup fails**: a Google Maps link that `readLink` cannot read (`https://maps.app.goo.gl/x` with `readLink → null`) plus a search dep that **would** hit → stored `from` coords kept, `url_unresolved` returned, search never consulted. `https://example.com` alone is not enough (it never reaches the search path). Test: Task 4.
4. **Web-form edit that doesn't re-pick an end** (including editing only the code chip) must not wipe stored coords: the picker's initial selection carries the stored coords, and the form always emits the three hidden fields from the current selection. Test: Task 6.
5. **Import budget exhausted** before transport: ends get `lookup_skipped` with `/transport/<i>/from|to` path; import still succeeds. Test: Task 5.
6. **Shell kind (scrutiny B1 + re-review R1).** `applyPlaceLink` returns before any search when `kind === 'transit'` (`place-link.ts:224`). The end shell uses `'sight'` **only when the end has a `query`**, else `'transit'` (link still read, never a name search). Test: Task 3 query hit + query miss run the **real** `applyPlaceLink` with only search deps injected.
7. **Map (PR B):** a BKK→KIX flight on day 1 does not change day 1's camera fit (R3). Test: e2e viewport assertion (no pure fit function exists).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/src/db/schema.ts` (modify) | six `transportBookings` columns |
| `app/drizzle/0025_transport_endpoints.sql` + meta (generated) | migration |
| `app/src/lib/api/transport-input.ts` (create) | pure: `readTransportEnds(body)` → `{ from, to }` endpoint inputs; object-wins cleanup of flat keys; `transportWarnings(t, path?, dayDates?)` (`transport_without_day`, `iata_code_invalid`) |
| `app/src/lib/api/transport-link.ts` (create) | `resolveTransportEnd`, `prepareTransportCreate`, `patchTransport`, `resolvePlanTransport` |
| `app/src/lib/services/booking-service.ts` (modify) | `TRANSPORT_FIELDS` += six flat columns, `validateTransportFields`, `parseTransportPatch` |
| `app/src/lib/transport-form-fields.ts` (create) | pure FormData → transport fields (moved out of `actions/bookings.ts`) |
| `app/src/lib/api/import-warnings.ts` (modify) | two codes + messages; `collectTripWarnings` calls `transportWarnings` |
| `app/src/lib/api/import-input.ts`, `app/src/lib/api/import-orchestrator.ts` (modify) | `readImportTransportEnds`; resolve transport after places |
| `app/src/app/api/v1/trips/[tripId]/transport/route.ts`, `app/src/app/api/v1/transport/[transportId]/route.ts` (modify) | resolve + warnings |
| `app/src/components/transport-form-client.tsx`, `transport-place-picker.tsx`, `app/src/app/actions/bookings.ts`, transport edit page (modify) | picker initial carries stored coords; always emit hidden coord fields |
| `app/src/lib/trip-queries.ts`, `app/src/app/trip/[id]/layout.tsx` (modify, PR B) | `cache()` `loadTransportForTrip`, layout loads it for the map |
| `app/src/lib/day-augment.ts` (modify) | `MapDay.rides: MapRide[]` from `ridesForDay` rows with coords |
| `app/src/lib/map-helpers.ts` (modify) | `MapRide` type; `emptyDayFallback` uses ride ends on a pin-less day |
| `app/src/lib/map-route.ts` (modify) | `rideArcs(rides)` + `ridesGeoJSON` (pure, shared by both renderers) |
| `app/src/components/map-rides-maplibre.tsx`, `app/src/components/map-rides-google.tsx` (create) | draw ride lines, end markers, type badge |
| `app/src/components/real-map-canvas-maplibre.tsx`, `real-map-canvas-google.tsx`, `map-renderer-props.ts`, `persistent-map.tsx` (modify) | pass `rides` through |
| `app/src/lib/map-a11y.ts` (modify) | summary mentions rides ("1 ride: BKK → KIX") |
| `app/src/messages/en.json`, `app/src/messages/th.json` | `map_ride_summary` etc. |
| `app/e2e/mobile-layout.spec.ts` (modify) | `TP-0142 ride line` describe |
| `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `REQUIREMENTS.md`, `AGENTS-INDEX.md`, `docs/maps-cost-guardrails.md` | docs |

---

### Task 0: Worktree

- [ ] `git fetch origin && git worktree add ../travel-planner-v2-tp-0142 -b feat/tp-0142-transport-endpoints origin/main`, then `cd ../travel-planner-v2-tp-0142/app && pnpm install --frozen-lockfile`. Copy `app/.env` from the main checkout (never commit it).

### Task 1: Schema + migration + flat-field validation

**Files:** `schema.ts`, generated migration, `booking-service.ts`, test `booking-service.test.ts` (or the existing transport parse test — locate with `grep -rln parseTransportInput app/src`).

- [ ] Add the six columns after `toTerminal` (Global Constraints names). Run `pnpm db:generate --name transport_endpoints`; confirm the SQL is six `ALTER TABLE "transport_booking" ADD COLUMN …` lines and nothing else.
- [ ] `TRANSPORT_FIELDS` += `'fromLat','fromLng','fromPlaceId','toLat','toLng','toPlaceId'`.
- [ ] In `parseTransportInput` **and** `updateTransport`, validate flat coords via one helper `checkEndCoords(fields, 'from' | 'to')`:
  - lat/lng each `null` or finite number; lat ∈ [-90, 90], lng ∈ [-180, 180] → else 400 `"fromLat" must be a number from -90 to 90` (same wording pattern for others).
  - Pair as a unit (R10): if either `fromLat` or `fromLng` is **present** (key in body, even `null`), both must be present → else 400 `"fromLat" and "fromLng" go together`; both null or both numbers, never one of each.
  - A non-null pair without `fromPlaceId` in the body → set `fromPlaceId: null`. A null pair → set `fromPlaceId: null` too (clear all three).
  - `fromPlaceId`: `null` or string ≤ 512 chars.
  - Export the validator as a pure `validateTransportFields(fields)` used by both `parseTransportInput` and a new pure `parseTransportPatch(body)` (type + coords + currency, the checks `updateTransport` does today), so PATCH can validate **before** any lookup (R15). `updateTransport` calls `parseTransportPatch` too (no behaviour change for existing callers).
- [ ] Tests (TDD, RED first): valid pair passes; lat 91 → 400; only `fromLat` (number) → 400; only `fromLat: null` → 400; `null` pair → all three null; new pair without placeId → `fromPlaceId: null`; legacy body without coords unchanged (no coordinate keys added).
- [ ] Commit `feat(transport): from/to coordinate columns [TP-0142]`.

### Task 2: Endpoint input parsing + transport warnings (pure)

**Files:** create `app/src/lib/api/transport-input.ts` + `transport-input.test.ts`; modify `import-warnings.ts`.

```ts
export type TransportEndInput = {
  name: string | null;          // label; copied to fromName/toName when that is absent
  lat: number | null; lng: number | null; placeId: string | null;
  googleMapsUrl: string | null; query: string | null; near: PlaceNear | null;
};
// undefined = end not sent; null = clear it (R10); object = resolve input.
export type TransportEnds = { from: TransportEndInput | null | undefined; to: … };
export function readTransportEnds(body: Record<string, unknown>): TransportEnds
export function transportWarnings(t: Record<string, unknown>, path?: string, dayDates?: Set<string>): ImportWarning[]
```

- [ ] `readTransportEnds`: for key `from`/`to`:
  - absent → `undefined`; `null` → `null`; non-object (string, array) → 400 `"from" must be an object or null`.
  - Object: `name` (string ≤ 200, trimmed, blank → null), `lat`/`lng` (same range + pair rules as Task 1), `placeId` (string ≤ 512), `googleMapsUrl` via `readPlaceLink(obj)`, `query`/`near` via `readPlaceExtras({ query: obj.query, near: obj.near })` — pass **only** those two keys so `status`/`sourceUrl` in the end object are ignored, never validated (scrutiny N4). Do not re-implement `parseNear`.
  - Wrap each end's parsing in `withContext` — it lives unexported in `import-input.ts:84`; export it from there (no behaviour change) and import it — with label `from` / `to`, so errors read `from: "near" must be …`.
  - An object with none of `lat`/`lng`/`googleMapsUrl`/`query`/`name` → 400 `"from" needs lat/lng, googleMapsUrl, query or name`.
  - R9: when an end object (or `null`) is sent, the flat `fromLat`/`fromLng`/`fromPlaceId` keys are dropped from the body (the object wins). Return the cleaned body alongside the ends.
  - Wrap errors with `withContext`-style prefixes already used by import (`transport 2: …`) in the import reader (Task 5), not here.
- [ ] `transportWarnings(t, path?, dayDates?: Set<string>)`:
  - `transport_without_day` when `t.dayIdx == null && (!t.fromDate || (dayDates && !dayDates.has(t.fromDate)))` (R12; import passes the trip's day ISO dates for `i < (days.length || expectedDayCount(startDate, endDate))` built with the existing `dayIso(day.date, startDate, i)` helper — the same day count rule `import-warnings.ts:224` uses; pass `undefined` (skip the date check) when that set is empty) → message `'This ride has no dayIdx or fromDate; it will not appear on any itinerary day.'`, path `path` (if given).
  - `iata_code_invalid` per end when `t.type === 'flight'` and `t.fromCode`, **trimmed**, is non-empty and not matching `/^[A-Z]{3}$/` → message `'Flight fromCode should be a 3-letter IATA code (e.g. KIX); it is stored as sent.'` (`toCode` analogous), path `${path}/fromCode` / `${path}/toCode` when `path` given.
- [ ] `import-warnings.ts`: add both codes to `ImportWarningCode` (comment `// Transport codes (TP-0142).`), messages in `MESSAGES`, and in `collectTripWarnings` iterate `plan.sections.transport` → `transportWarnings(t, '/transport/' + i, dayDates)`. Confirm the existing E-city-style fixture tests still pass (append-only to the warning list order: put transport warnings **after** hotel warnings, before per-place).
- [ ] Tests: every 400 branch; `from: { status: 'x', query: 'KIX' }` → no 400; error message carries the `from:` prefix; GET round-trip body (with or without stored coords) + `from: {…}` → no 400, flat keys dropped; `from: null` → null; absent → undefined; `{ query: 'Kansai International Airport', near: '34.4,135.2' }` parses near; warnings: no day → 1; `fromDate` set → 0; flight `OSA` → 0; flight `' KIX'` → 0; flight `osa` → 1; flight `Osaka` → 1; train `Namba` → 0; empty code → 0; `fromDate` outside `dayDates` → 1; range-only plan (no `days`, startDate+endDate) with `fromDate` inside the range → 0; no dates known → only the empty check.
- [ ] Commit `feat(transport): from/to endpoint input + ride warnings [TP-0142]`.

### Task 3: `transport-link.ts` + REST POST

**Files:** create `app/src/lib/api/transport-link.ts` + `transport-link.test.ts`; modify the POST route.

- [ ] `resolveTransportEnd(end: TransportEndInput, budget, deps)` → `{ lat, lng, placeId, address: null, warnings, source }`:
  - Build a `PlaceFields` shell like `resolveHotelLink` with **kind = `end.query !== null ? 'sight' : 'transit'`**. Comment why in the code: `applyPlaceLink` never searches a transit place (`place-link.ts:224`) but reads its link before that check, so a query is searched while a failed link never falls back to a name search (scrutiny B1 / re-review R1). `name: end.name ?? end.query ?? ''`, `address: null`, `lat/lng/placeIdExternal` from the end, everything else null/[].
  - `applyPlaceLink(fields, end.googleMapsUrl, budget, deps, { query: end.query, near: end.near })`.
  - Return `{ lat, lng, placeId, warnings, source }`. (No `LINK_FAILED` guard is needed — the kind choice above prevents the name fallback. If both `googleMapsUrl` and `query` are sent and the link fails, the query search is the intended fallback.) R7 holds: with no url and no query and `address: null`, `applyPlaceLink` does not search (assert with a spy search dep that throws).
- [ ] `prepareTransportCreate(userId, tripId, body, deps)`:
  0. `requireTripAccess(userId, tripId, 'write')` first (R15: a 403 spends no lookups).
  1. `parseTransportInput(body)` (it already drops `from`/`to` via `pick`) and `readTransportEnds(body)` — both before any lookup.
  2. `readTransportEnds(body)`; for each end that is an object, resolve (one `LinkBudget` for both ends).
  3. Build the prepared body: drop `from`/`to`; set `fromLat/fromLng/fromPlaceId` from the resolved end; set `fromName = body.fromName ?? end.name ?? null` (only when `fromName` absent). `null` end → flat fields null.
  4. Warnings: link warnings of each end (no path on REST; prefix the message? **No** — add `path: '/from'` / `'/to'` so the agent knows which end), plus `transportWarnings(preparedBody)` (no path).
- [ ] POST route: same shape as the hotels POST route (resolve outside `withIdempotencyAtomic`, original body stays the hash input), response `{ transport, warnings }`.
- [ ] Tests (the **real** `applyPlaceLink` with injected `PlaceLinkDeps` fakes for `readLink`/search only, never network, never a mocked `applyPlaceLink`):
  - `legacy body makes no lookup` (Review Focus 1): spies on `readLink`/search deps record zero calls; prepared body has no `from` key.
  - `{ from: { name: 'BKK', lat: 13.69, lng: 100.75 } }` → coords stored, `source` input, zero lookups, `fromName` = `BKK`.
  - `{ to: { query: 'Kansai International Airport' } }` with fake search hit → `toLat/toLng/toPlaceId` from the hit.
  - `fromName` sent + `from.name` sent → `fromName` wins.
  - bad body (`type: 'bus'`) → 400 and zero lookups.
  - search miss → `toLat` null + the place-link warning (whatever code `applyPlaceLink` emits on a miss — read it, don't guess) with `path: '/to'`.
  - `from: { name: 'BKK', googleMapsUrl: 'https://maps.app.goo.gl/x' }`, `readLink → null`, search dep would hit → `fromLat` null, `url_unresolved`, search dep **not called**.
  - no write access → 403 and zero lookups.
- [ ] Commit `feat(transport): resolve from/to on create [TP-0142]`.

### Task 4: REST PATCH

**Files:** `transport-link.ts`, `booking-service.ts` (`parseTransportPatch` from Task 1), PATCH route.

- [ ] `patchTransport(userId, id, body, deps)`:
  - `resolveTransport(id)` + `requireTripAccess(write)` (no stored-row read needed), then `parseTransportPatch(body)` and `readTransportEnds(body)` — all before any lookup (R15). Drop `getTransportForWrite` from the file list. For each end: `undefined` → untouched; `null` → set the three flat fields null; object → resolve; **write the three fields only when `resolved.lat != null`** (Review Focus 3: a failed resolve keeps the stored pin); a `name` in the object updates `fromName` only when the body has no `fromName`.
  - Then `updateTransport(userId, id, preparedBody)` (flat fields + any other columns).
  - Warnings: per-end link warnings with `path: '/from'|'/to'`. No `transportWarnings` on PATCH (R12).
- [ ] PATCH route returns `{ transport, warnings }`.
- [ ] Tests: `{ seats: '12A' }` → zero lookups, coords kept (Review Focus 2); `{ to: {...hit} }` → only `to*` change; `{ from: { googleMapsUrl: 'https://example.com' } }` → `url_unsupported`, coords kept; `{ from: { name: 'BKK', googleMapsUrl: 'https://maps.app.goo.gl/x' } }` with `readLink → null` and a search dep that would hit → `url_unresolved`, stored coords kept (Review Focus 3); `{ from: null }` → from coords null, `fromName` unchanged; `{ from: {...hit}, fromLat: 1 }` → object wins, `fromLat` from the hit.
- [ ] Commit `feat(transport): re-resolve only the sent end on PATCH [TP-0142]`.

### Task 5: Import

**Files:** `import-input.ts` (`readImportTransportEnds`), `import-sections.ts` (`parseTransportInput` must ignore `from`/`to` — it already picks only `TRANSPORT_FIELDS`, verify), `transport-link.ts` (`resolvePlanTransport`), `import-orchestrator.ts` (deps `resolveTransport`), `import-service.ts` (no change expected: it spreads the parsed row — verify the six fields flow through), tests `import-orchestrator.test.ts`, `transport-link.test.ts`.

- [ ] `readImportTransportEnds(body)` → `TransportEnds[]` via `withContext('transport ' + (i+1), …)` like `readImportHotelLinks`. Runs during parse so a bad `from` is a 400 before any lookup.
- [ ] `resolvePlanTransport(plan, ends, budget, deps)` → `{ plan, warnings }`: concurrency 4 (same pattern as `resolvePlanHotels`), each end resolved independently, `plan.sections.transport[i]` gets `fromLat…toPlaceId` (+ `fromName`/`toName` from `name` when absent). Link warnings path `/transport/<i>/from` / `/to`.
- [ ] `resolvePlanTransport` uses the same `resolveTransportEnd` (kind `'sight'`, link-failed guard).
- [ ] `collectTripWarnings` passes the plan's day ISO dates to `transportWarnings` (R12).
- [ ] `resolveImport`: after `resolveLinks`, call `deps.resolveTransport(plan, transportEnds, budget)`; merge its warnings **after** place-link warnings and before `collectTripWarnings` (which now includes `transportWarnings`). Update the comment above `resolveImport` (order: hotels → places → transport, R8).
- [ ] dryRun preview: `sections.transport` already echoes the parsed rows; verify resolved coords appear (they will, since the plan object is replaced).
- [ ] Tests:
  - `resolves transport after places on a shared budget` (Review Focus 5): budget of N where places use all N → both transport ends get `lookup_skipped` with `/transport/0/from` and `/transport/0/to`; import still returns 201.
  - E-city-shaped fixture: flight `{ fromCode:'BKK', toCode:'KIX', dayIdx:0, from:{lat,lng}, to:{query:'Kansai International Airport'} }` → preview `sections.transport[0].toLat` set; `transport_without_day` absent.
  - A ride with neither `dayIdx` nor `fromDate` → `transport_without_day` at `/transport/1`.
  - Integration (`TEST_DATABASE_URL`, `import-service.integration.test.ts` or the existing import integration suite): committed row has `from_lat`/`to_place_id` columns set.
- [ ] Commit `feat(import): resolve transport from/to after places [TP-0142]`.

### Task 6: Web form persists picker coordinates (always-emit, like the hotel form)

**Files:** `transport-form-client.tsx`, `transport-place-picker.tsx`, `actions/bookings.ts`, `app/src/app/trip/[id]/booking/transport/[bookingId]/edit/page.tsx`, `bookings-view.tsx` (verify it passes the whole row, `:571`), new `app/src/lib/transport-form-fields.ts` (+ test) — `readTransportFields` moved out of `'use server'` like TP-0143's `hotel-form-fields.ts`.

Scrutiny M3: a "touched" flag breaks when the user edits only the code chip (`setCode` → `onChange({...prev, code})` with the initial selection's null coords, `transport-place-picker.tsx:42-53,113-120`). So:

- [ ] `TransportInitial` += `fromLat, fromLng, fromPlaceId, toLat, toLng, toPlaceId`. The edit page passes them (it lists fields one by one, `edit/page.tsx:56-75`).
- [ ] Picker `initial` accepts `{ name, code, lat, lng, placeId }`; the initial `selected` carries them, so a code edit keeps the stored coords. Build the initial selection when a name **or** coords exist (coords-only end from an agent: label falls back to the code, else the coordinates' short form) — otherwise any web edit would wipe it (re-review R4). Test the coords-only case.
- [ ] Form effective ends: `fromSel = from ?? initialFrom` (the picker reports the current selection; after a clear it reports `null`). Always emit hidden `fromLat`/`fromLng`/`fromPlaceId` from the current selection (`''` when null). Track "cleared" distinctly from "never reported": keep the parent's `from` state as `PlaceSelection | null | undefined` (undefined = no report yet → use initial; null = cleared → emit `''`).
- [ ] `readTransportFields`: the six keys always read; `''` → null; numbers via `Number` (non-finite → null). The service pair rule (R10) then applies — a pair is always sent together.
- [ ] Clear behaviour (scrutiny N11, pre-existing): when an end is cleared, also emit `fromName`/`fromCode` as `''` so label and pin vanish together. Check this matches what the picker shows after clear; if the current UI intentionally falls back to the stored label, keep the label and note it in the report instead.
- [ ] Tests: pure reader (untouched initial → stored coords round-trip; picked → new numbers; cleared → nulls). Plus an e2e-free client check is not required; the code-chip path is covered by the picker carrying initial coords — add a unit test for the picker's initial-selection builder if it is a pure function, otherwise extract it (`initialSelection(initial)`) and test it.
- [ ] Commit `feat(transport): web form saves picked from/to coordinates [TP-0142]`.

### Task 7: Map — ride lines (both renderers)

**PR B.** **Files:** `trip-queries.ts`, `app/trip/[id]/layout.tsx`, `map-helpers.ts`, `day-augment.ts`, `map-route.ts`, new `map-rides-maplibre.tsx` / `map-rides-google.tsx`, the two `real-map-canvas-*.tsx`, `map-renderer-props.ts`, `persistent-map.tsx`, `map-a11y.ts`, messages; tests `day-augment.test.ts`, `map-route.test.ts`, `map-helpers.test.ts`, `map-a11y.test.ts`.

- [ ] Types (`map-helpers.ts`):
  ```ts
  export type MapRide = {
    id: string;                       // transport booking id
    type: 'flight' | 'train' | 'car' | 'ferry';
    from: LatLng | null; to: LatLng | null;
    fromLabel: string | null; toLabel: string | null;   // same labels ridesForDay builds
  };
  ```
  `MapDay.rides: MapRide[]`.
- [ ] Extract `rideOnDay(t, dayIdx, dayIso)` predicate from `ridesForDay` (which then uses it). `buildMapDays(trip, hotels, transport, units, lang)` — `transport` **required** (a missed caller is a type error): rides = `transport.filter(t => rideOnDay(t, d.idx, iso))` mapped to `MapRide`; keep rides with at least one located end (R4).
- [ ] Data loading (scrutiny M1): the trip layout does **not** load transport today (`app/trip/[id]/layout.tsx:52-74`; only the itinerary page does, `page.tsx:63`). Wrap `loadTransportForTrip` in React `cache()` (like `loadHotelsForTrip`, `trip-queries.ts:267`), add it to the layout's `Promise.all`, pass it to `buildMapDays`. The itinerary page's own call then dedupes. Edits already revalidate `/trip/${tripId}` (`actions/bookings.ts:76-80`).
- [ ] `emptyDayFallback` (scrutiny M5): add `DayFallback.from = 'ride'`; when the shown day has no pins but has located ride ends, frame them (one end → that single point; the existing single-point zoom handling applies) **before** prev-day/stay/trip. `emptyDayNote` maps `'ride'` to a new key `map_empty_day_ride` (en `"No places on Day {n} yet · showing its ride"`, th `"วันที่ {n} ยังไม่มีสถานที่ · แสดงการเดินทางของวันนี้"` — same `{n}` as the sibling keys, `app/src/messages/en.json:381`). `mapSummary` (`map-a11y.ts:11`) returns early on empty days: add the ride sentence to that branch too.
- [ ] `map-route.ts`: `rideArcs(rides)` → for rides with both ends: `{ key: 'ride:'+id, path: arcPath(from,to), mid: arcMid(from,to), type }`; `rideEnds(rides)` → located ends `{ key, pos, end: 'from'|'to' }`; `ridesGeoJSON(arcs)`. Ride colour: one token `RIDE_COLOR` = the neutral `--map-route-ride` (add to `globals.css` light-locked map tokens next to `--map-pin-*`; mirror the hex in `map-helpers` like `ROUTE_CASING_COLOR`). Dashed: `line-dasharray [2, 2]` (MapLibre) / Google `icons` dash pattern (copy how dashes are drawn today if any; else `strokeOpacity 0` + repeated `'M 0,-1 0,1'` symbol icons).
- [ ] Renderers: MapLibre — second persistent `Source id="tp-rides"` + casing + dashed line layers rendered **after** `<RouteLinesMaplibre>` in JSX **and** with `beforeId="tp-route-hit"` (MapLibre rejects a missing `beforeId`; draw order must not depend on JSX mount order; theme switches reload the style — scrutiny N6), `visibility` from the legs toggle, **not** in `interactiveLayerIds`; end markers + mid badge as non-interactive `Marker`s (`pointer-events: none`). Google — `Polyline`s `clickable={false}` + `AdvancedMarker clickable={false}`. Badge reuses `RouteBadge`'s look with the ride-type icon (`Plane/Train/Car/Boat` from `components/icons`, same mapping as `itinerary-ride-row.tsx` — extract `rideIcon(type)` there and import it, do not duplicate).
- [ ] z-order: ride lines under route legs, end markers under pins (`zIndex` below `ROUTE_BADGE_Z_INDEX`).
- [ ] `map-a11y` summary appends `t('map_ride_summary', { from, to })` per drawn ride (en: `"Ride {from} → {to}"`, th: `"เดินทาง {from} → {to}"`).
- [ ] Tests: `buildMapDays` puts the BKK→KIX ride on day 0 only (overnight ride: departure day only, R17); a ride with no coords is absent; a ride with one end yields one end and no arc; `emptyDayFallback`: pin-less day with a ride → `'ride'`, pin-less day with a one-ended ride → single point, pin-less day with ride while previous day has pins → still `'ride'`; `emptyDayNote('ride')`; a11y string on a normal day and on an empty day. R3 has no pure fit function (canvases frame `pins.length ? pins : fallbackFrame` inline) — it is covered by the e2e viewport assertion.
- [ ] Commit `feat(map): draw the day's transport rides [TP-0142]`.

### Task 8: e2e

**Files:** `app/e2e/mobile-layout.spec.ts`.

- [ ] Extend `createFixture(page, baseURL, days, hotels)` (`e2e/mobile-layout.spec.ts:396-413`) with an optional `transport` parameter sent inside the existing import body (`transport[]` with flat `fromLat/fromLng/toLat/toLng` — no key, no quota). State in the describe comment which renderer the e2e runs on (the other renderer is covered by unit tests only).
- [ ] New describe `TP-0142 ride line`: seed a trip with one day, two places, and a flight on day 0 with both ends located. Assert on `pixel-7` and `desktop`: the map has the ride layer/markers (`[data-ride-end]` count 2, `[data-ride-badge]` 1 — add these data attributes in Task 7), toggling route lines hides them, and the day's pins are still within the viewport (camera unaffected).
- [ ] One `pnpm build`, then `pnpm e2e:mobile --grep "TP-0142" --project=pixel-7 --project=desktop` (check the exact script/flags in `package.json`; copy what TP-0143 used).
- [ ] Commit `test(e2e): ride line on the trip map [TP-0142]`.

### Task 9: Docs (9a in PR A: API.md, SKILL.md, REQUIREMENTS data part, AGENTS-INDEX, maps-cost-guardrails; 9b in PR B: REQUIREMENTS map part, AGENTS-INDEX map files)

- [ ] `API.md` transport section: `from`/`to` shapes, precedence (R9), PATCH semantics (R10, Review Focus 3), R16 (changing the code keeps coords — send a new `from`), response `{ transport, warnings }`, new warning codes, import paths, budget order (R8), the six new columns on GET.
- [ ] `SKILL.md` §4 transport example: flight with `from: { name: 'BKK', lat, lng }`, `to: { query: 'Kansai International Airport' }`; mention `iata_code_invalid` / `transport_without_day`.
- [ ] `REQUIREMENTS.md`: transport endpoints + ride lines (R2/R3 limits stated).
- [ ] `AGENTS-INDEX.md`: new files. `docs/maps-cost-guardrails.md`: transport ends spend the import `LinkBudget` after places; dryRun + commit resolve twice and POST replays re-resolve (same as hotels/places).
- [ ] Commit `docs: transport from/to endpoints [TP-0142]`.

### Task 10: Verification + real-world check (10a closes PR A: unit + integration + lint + typecheck + measurement + PR; 10b closes PR B: unit + lint + typecheck + one build + targeted e2e + PR)

- [ ] `pnpm vitest run` (full unit), integration suites against `tp-test-pg` (migrate the branch first, confirm not skipped), `pnpm lint`, `pnpm typecheck`.
- [ ] Local measurement with the user's `GOOGLE_PLACES_SERVER_KEY` (repo-root `.env`, never printed): dryRun the E-city import plus three rides (BKK→KIX flight day 0, rental car KIX→Osaka day 7, rapi:t Namba→KIX day 9) from `~/development/_scratch/tp-import/`; record resolved ends + warnings in the PR body.
- [ ] PR A `feat(transport): from/to coordinates for rides [TP-0142]`; PR B `feat(map): draw the day's transport rides [TP-0142]`. Link each via t3-code. TP-0142 moves to review after PR B opens.

## Self-review notes

- Ticket DoD "itinerary day 1 / 8 / 10 shows the ride" is already satisfied by `ridesForDay` once `dayIdx`/`fromDate` are sent (TP-0148 documented them); this plan adds the map half and the measurement proves both.
- Out of scope (follow-ups if wanted): connector ride ↔ first/last stop (R2), tappable rides (R5), approximate-end styling (R6), PATCH-time `transport_without_day` (R12).

## Scrutiny log

- Round 1 (`…scrutiny.md`): fix-then-ship — B1, M1–M5, N1–N14 folded into the rulings and tasks above.
- Round 2 (re-review): ship after R1 (kind by `query`, no post-hoc guard) and R2 (date check uses the trip's day range, skipped when unknown); R3–R6 nits folded in.

# Scrutiny — TP-0142 transport endpoints plan

Reviewed: `docs/superpowers/plans/2026-11-04-tp-0142-transport-endpoints.md` against `app/src` on `main` (502b1bc). Read-only.

**Verdict: fix-then-ship.** The data half is sound and closely follows TP-0143. One blocker: the adapter, as written, never resolves `query`. Five majors: one is a false claim about data loading, and four are edge cases that wipe or corrupt stored pins.

---

## 1. Intent

**Goal:** let a transport booking store coordinates for both ends (from the REST API, import and the web form) and draw each day's rides on the trip map.

**Simpler-alternative pass**

| Option | Assessment |
|---|---|
| Split map half into its own PR | **Recommended.** The data half (columns, REST, import, form, warnings) is self-contained and testable. The map half doubles the surface: two renderers, a token, a11y, empty-day fallback and e2e. It also carries most of the open questions (M1, M5, N5–N7). Keep both under TP-0142, but ship them as two PRs so the data lands while the map is reviewed. |
| Ride ends as synthetic pins / `MapLeg`s | **Rejected, rightly.** `MapLeg.from/to` index into `pins` (`map-route.ts:118-136`). Legs are tap targets that select a stop, and pins are numbered list rows. A ride has no stop, so synthetic pins would break numbering, the stop carousel, `ghostPins` and `stopsByDay`. Reusing `arcPath`/`arcMid`/`RouteBadge` (as the plan does) is the right level of reuse. |
| Extend `hotel-input`/`place-input` instead of a new `transport-input.ts` | The new module is justified: the end object is nested, and the R9 flat-vs-object conflict check is transport-specific. One simplification: `readHotelLink(obj)` already returns `{ googleMapsUrl, query, near }` from an object (`hotel-input.ts:133-142`), so the end reader can call it instead of calling `readPlaceLink` + `readPlaceExtras` separately (see N4 about `status`). |
| Flat `fromQuery`/`fromGoogleMapsUrl` instead of `from` objects | Smaller, but the object is cleaner for agents and matches the ticket. Keep. |
| Web form: "touched" state machine | **Simpler alternative is better (see M3).** Pass the stored coords into the picker's initial selection and always emit the hidden fields, as the hotel form does (`hotel-form-fields.ts`). |

---

## 2. Claims verified OK

- `parseTransportInput` keeps only `TRANSPORT_FIELDS` (`booking-service.ts:191-205`, `pick` at :43). `from`/`to` are dropped without help, so `stripEnds` is a no-op (harmless).
- Import: `parseSections` → `parseTransportInput` (`import-sections.ts:101`). `importPlan` inserts `{ ...t, tripId }` (`import-service.ts:117-118`), so the six flat fields flow through once they are in `TRANSPORT_FIELDS`. No `import-service` change is needed.
- dryRun preview echoes `plan.sections` verbatim (`import-orchestrator.ts:141-144`). Resolved coords will show up, and the `from`/`to` objects will not, because they are never in the parsed row.
- Import resolution runs **after** `claimKey` (`import-orchestrator.ts:233`), so an import replay spends no lookups.
- R7 holds **once the kind is not `'transit'`** (see B1). With no url, `address === null` and `query === null`, `applyPlaceLink` returns before any lookup (`place-link.ts:224`).
- `PlaceSelection` does carry `lat/lng/placeId` after a pick. `transportSelectionFrom` → `ensureCoords` (`pick.ts:33-44`, `client.ts:55-61`), and `placeId` is the provider-prefixed suggestion id, the same format hotels store.
- `loadApiTrip` (GET `/trips/:id`) does not include transport (`trip-queries.ts:239-262`), so its contract is unchanged. GET `/trips/:id/transport` uses `select()` and gains the six columns on its own. Document them in API.md.
- Other readers are unaffected because the columns are nullable and none of them uses a column list that would break: `calendar-queries`, `ics-queries`, `bookings-merge`, `expense-queries`, `actions/budget.ts`, `actions/seed.ts`, restore/undo.
- The last migration is `0024_hotel_tbd_status.sql`, so `0025_transport_endpoints` is correct.

---

## 3. Findings

### BLOCKER

#### B1 — `kind: 'transit'` shell makes `applyPlaceLink` skip every search; `query` never resolves
- **Finding:** Task 3 says to build the `PlaceFields` shell "exactly like `resolveHotelLink` (kind `'transit'` …)". But `applyPlaceLink` returns early for transit: `if (hasCoords || out.kind === 'transit' || …) return` (`place-link.ts:224`).
- **Why it matters:**
  - `to: { query: 'Kansai International Airport' }` → no lookup, no coords and **no warning** (`place_unresolved` is never reached).
  - A Google Maps link without exact coords cannot fall back either.
  - This breaks the main agent path the ticket asks for ("agents send `from: { query: … }`"), and it fails silently.
  - `resolvePlanLinks` skips transit places on purpose (`place-link.ts:292`), which is why the shortcut exists.
- **Evidence:** `place-link.ts:221-226`. `hotel-link.ts:58` uses `kind: 'hotel'`, not transit.
- **Suggested change:**
  - Use a non-transit kind (e.g. `'sight'`) with a comment saying why.
  - Pin it with a test that runs the **real** `applyPlaceLink` (inject only the `textSearch`/`search` deps, not a mocked `applyPlaceLink`): `{ to: { query } }` + fake hit → `toLat` set. Plus `{ to: { query } }` + empty hits → `place_unresolved` with `path: '/to'`.
  - The Task 3 test list already contains the hit case. Make it explicit that it must go through `applyPlaceLink`.

### MAJOR

#### M1 — The trip layout does not load transport; "reuse that query, no new DB round trip" is false
- **Finding:** Task 7 says "the trip layout already loads them for the itinerary (`ridesForDay` callers); reuse that query".
  - The layout loads trip, hotels, units, counts and lang only (`app/trip/[id]/layout.tsx:52-74`).
  - Transport is loaded only by the itinerary **page** (`page.tsx:63`).
  - `loadTransportForTrip` is **not** `cache()`-wrapped (`trip-queries.ts:282`), unlike `loadHotelsForTrip` (:267).
- **Why it matters:**
  - As written, the implementer either passes nothing (with the proposed default `transport = []`, rides silently never draw), or adds an uncached second query on every itinerary render.
  - The map also lives in the layout on `/bookings` and `/transport`, where the page never loads transport.
- **Suggested change:**
  - Wrap `loadTransportForTrip` in `cache()`, add it to the layout's `Promise.all`, and pass it to `buildMapDays`. The itinerary page's own call then dedupes.
  - Make the `transport` parameter **required** so a missed caller is a type error.
  - Edits need no extra work: `revalidateTransport` already revalidates `/trip/${tripId}` (`actions/bookings.ts:76-80`), the same path hotels rely on to refresh map pins.

#### M2 — PATCH (and POST) after a failed Google Maps link falls back to a *name* search and overwrites the stored pin
- **Finding:** Task 4 writes the end's three fields "only when `resolved.lat != null`". But with a valid-looking Google Maps URL that fails to read (`url_unresolved`, or a short link skipped by the budget), `linkSent` is true. `applyPlaceLink` then searches `[name, address]`, e.g. `"BKK"`, and returns those coords with `source: 'search'` (`place-link.ts:212-226, 228-260`).
- **Why it matters:**
  - It breaks Review Focus 3 ("a failed link never wipes a pin"): the stored airport pin is replaced by whatever "BKK" or "Osaka" geocodes to.
  - Hotels guard exactly this case with `LINK_FAILED` and `accepted = !(linkFailed && source === 'search')` (`hotel-link.ts:93, 200-206`).
  - The plan's test uses `https://example.com`, which gives `url_unsupported` → `linkSent = false` → no search, so **the test does not exercise the real failure path**.
- **Suggested change:**
  - Export `LINK_FAILED` (or a `linkAccepted(input, r)` helper) from `hotel-link.ts` and apply it in `patchTransport`.
  - On POST, consider the same rule: a failed link plus a name-only end should store no coords, rather than a name-search guess. An end label like "BKK" is a poor search string.
  - Add a test with `readLink` returning `null` for `https://maps.app.goo.gl/x` and a fake search hit → stored coords unchanged, plus `url_unresolved`.

#### M3 — Web form: editing the code chip on an untouched end wipes the stored coordinates
- **Finding:**
  - The picker's initial selection is built with `lat: null, lng: null, placeId: null` (`transport-place-picker.tsx:42-53`).
  - `setCode` calls `onChange({...prev, code})` (`:113-120`), so editing the code chip (e.g. `BKK` → `DMK`) on an edit form reports a selection with null coords.
  - Under Task 6's rule ("`fromTouched` set in the `onChange` handler"), that counts as touched and emits `''` → null, which wipes the pin.
- **Why it matters:** this is Review Focus 4's exact risk, through a path the plan does not list (pick / clear / untouched are listed; code edit is not).
- **Suggested change (simpler, too):**
  - Add `fromLat/fromLng/fromPlaceId` (and the `to*` fields) to `TransportInitial`.
  - Pass them into the picker's `initial` so `selected` carries them, and **always** emit the three hidden inputs from the current selection. The hotel form does the same.
  - `bookings-view.tsx:571` already passes the whole row. The edit page lists its fields one by one (`booking/transport/[bookingId]/edit/page.tsx:56-75`) and needs the six fields added.
  - This removes the touched state machine and the `formData.has()` partial-patch reader.
  - If you keep the touched approach, set touched only in `pick`/`clear`, never in `setCode`, and add a test for the code-edit case.

#### M4 — Flat-field PATCH half pairs: `fromLat: null` alone stores a half pair; `fromLat: 13.7` alone 400s
- **Finding:** Task 1's rule is "exactly one of `fromLat`/`fromLng` **non-null** → 400". On PATCH `{ fromLat: null }` (which R10 says "also clears"), `fromLng` is absent, so the check passes. `updateTransport` then writes `from_lat = NULL` and leaves `from_lng` and `from_place_id` stored (`booking-service.ts:252-262` writes only the sent keys).
- **Why it matters:**
  - It leaves an inconsistent row, which every map consumer must defend against.
  - It also contradicts R10's "clears", which implies all three fields.
  - The reverse case, `{ fromLat: 13.7 }` alone, is rejected even though the stored `fromLng` would complete the pair.
- **Suggested change:**
  - On PATCH, if either key of a pair is present, require both keys present (400 otherwise).
  - Or define it: a `null` on either key clears all three fields.
  - State whether a new pair without `fromPlaceId` clears the stored `fromPlaceId`, because a stale id paired with new coords is misleading.
  - Add tests for both cases.

#### M5 — The R3 empty-day ride frame is underspecified: `DayFallback`, `emptyDayNote` and `mapSummary` all need changes the plan does not list
- **Finding:**
  - `DayFallback.from` is `'prev-day' | 'stay' | 'trip'`, and `emptyDayNote` maps each value to an i18n key (`map-helpers.ts:149-174`). A ride frame needs a new variant (`'ride'`) and a new `map_empty_day_ride` key in en and th. Otherwise the chip tells the user "showing Day 1" while it actually frames the flight.
  - `mapSummary` returns `map_summary_empty` before looking at anything else when `pins.length === 0` (`map-a11y.ts:11`). So "1 ride: BKK → KIX" is never announced on exactly the days the R3 exception targets.
  - The ride frame also pre-empts the upcoming-stay fallback on a pin-less arrival day. Decide whether that is the intent.
- **Suggested change:**
  - Add the variant, the note key, and the empty-day branch of the summary.
  - Add `emptyDayFallback` tests for: a pin-less day with a ride; a pin-less day with a one-ended ride (frame the single end at zoom 14, or skip it?); a pin-less day with a ride when the previous day has pins.

### MINOR / NIT

| # | Finding | Evidence | Suggested change |
|---|---|---|---|
| N1 | R9 checks key **presence**, so a GET round-trip body (which always contains `fromLat: null`, `fromLng: null`, `fromPlaceId: null`) plus a new `from: {…}` returns 400. | `select()` on the list (`booking-service.ts:207-216`) | Treat it as a conflict only when a flat value is **non-null**. |
| N2 | POST resolves before `withIdempotencyAtomic` **and** before `requireTripAccess`. A replay, or a 403 on someone else's trip, still spends lookups and Google quota. This is inherited from hotels. | `hotels/route.ts:22-24`; `createTransport` checks access only inside the transaction (`booking-service.ts:224`) | Call `requireTripAccess(userId, tripId, 'write')` before `prepareTransportCreate` (cheap). Accept the replay cost, or document it. |
| N3 | PATCH validation (`type`) runs inside `updateTransport`, **after** the lookups. `getTransportForWrite` is not needed: nothing reads the stored row. | `booking-service.ts:245-258` | Pull type and coordinate validation into a pure `validateTransportPatch` and run it before resolving. For authz, `resolveTransport` + `requireTripAccess` is enough. |
| N4 | `readPlaceExtras` also parses `status`/`sourceUrl`, so `from: { status: 'x' }` 400s with `"status" must be one of: confirmed, tbd`. Errors from `readPlaceLink`/`parseNear` say `"googleMapsUrl"`/`"near"`, not `"from.googleMapsUrl"`. | `place-input.ts:101-109, 166-173` | Wrap each end in `withContext('from', …)`. Read only `query`/`near`, or use `readHotelLink`. |
| N5 | "`fitPoints`" and "`fallbackFrame` (function)" do not exist. The canvases frame `pins.length ? pins : fallbackFrame` inline, and Google's `ActiveFocus` uses `pinBounds`. The R3 unit test therefore has no pure target. | `real-map-canvas-maplibre.tsx:65-67`, `real-map-canvas-google.tsx:103`, `map-active-focus-*.tsx` | R3 holds structurally (rides are never passed to `ActiveFocus`). Drop the unit test, keep the e2e viewport assertion, and fix the R3 wording. |
| N6 | MapLibre draws layers in mount order. A `tp-rides` Source mounted after `tp-route` paints **above** the legs, which contradicts "ride lines under route legs". | `map-route-maplibre.tsx:47-74` | Give the ride layers `beforeId="tp-route-hit"`. Do not rely on JSX order: theme switches reload the style. |
| N7 | The e2e `createFixture(page, baseURL, days, hotels)` has no transport parameter, and the e2e run covers one renderer only. | `e2e/mobile-layout.spec.ts:396-413` | Add a `transport` parameter, sending ends as `lat/lng` (no key or quota needed). Say which renderer the e2e covers; the other one gets unit tests only. |
| N8 | Joining `DisplayRide`s "back to the rows for coords" is roundabout. | `day-augment.ts:217-235` | Extract a `rideOnDay(t, idx, iso)` predicate and build `MapRide` from the filtered rows. `ridesForDay` reuses the predicate. |
| N9 | `transport_without_day` misses rides whose `fromDate` matches no trip day (outside the range, or a trip without dates). They are just as invisible. | `ridesForDay` matches `t.fromDate === dayIso` | On import, the day dates are known, so check them there as well. On POST, accept the gap or make it a follow-up. |
| N10 | R7 side effect: changing `fromName`/`fromCode` (e.g. BKK → DMK) without a new `from` keeps the old airport's coords. | — | Document this in API.md. Optionally clear the coords when the code changes and no `from` is sent. |
| N11 | Web form "clear" falls back to the initial label (`fromName = from?.name ?? v.fromName`). With the plan, clearing wipes the coords but keeps the name, so the user cannot tell why the pin vanished. | `transport-form-client.tsx:193` | Pre-existing. Note it, or make clear also blank the label. With M3's always-emit approach the behaviour is at least consistent. |
| N12 | Overnight rides draw only on the departure day (`ridesForDay`), and the arrival day gets no frame. | `day-augment.ts:214-216` | Fine for v1; state it in REQUIREMENTS. |
| N13 | The IATA regex runs on untrimmed values (`parseTransportInput` does not trim codes), so `' KIX'` warns. | `booking-service.ts:191-205` | Trim before testing. |
| N14 | dryRun followed by commit resolves twice, the same as hotels and places. | `import-orchestrator.ts:226, 247` | Accept. Mention it in `docs/maps-cost-guardrails.md` alongside R8. |

---

## 4. Do the proposed tests exercise the real path?

| Test | Real path? |
|---|---|
| Task 3 "legacy body makes no lookup" | Yes, if the spies are injected through `PlaceLinkDeps` into the real `applyPlaceLink`. |
| Task 3 query hit | **Would fail RED under the plan as written** (B1). Good as a test, but the spec it is written against is wrong. |
| Task 4 "bad link keeps coords" | **No.** `example.com` never reaches the search fallback (M2). Add an `url_unresolved` case. |
| Task 4 `{ seats }` zero lookups | Yes. |
| Task 5 shared budget | Yes, if it uses a real `LinkBudget(userId, N)` across `resolveHotels` → `resolveLinks` → `resolveTransport`. |
| Task 5 integration | Yes. It needs `tp-test-pg` migrated to 0025. |
| Task 6 form reader | Tests the reader only. The wipe risk is in the **client** `setCode` path (M3), which a pure reader test cannot catch. |
| Task 7 R3 `fitPoints` | No target function exists (N5). |
| Task 8 e2e | Real, but it needs fixture support for transport (N7) and covers one renderer. |

---

## 5. One-line verdict

**Fix-then-ship.** Fix B1 (non-transit shell) and M1–M5 in the plan, ideally ship the data half and the map half as two PRs, and fold the nits in during execution.

---

## Re-review

Scoped re-review of the revised plan (267 lines) against the same `main` code. Read-only.

**Verdict: ship, after three small text fixes (R1–R3 below).** All five majors are resolved. B1 is resolved, but its link-failed guard has a new cost and a contradiction (R1).

### Status per original finding

| # | Status | Note |
|---|---|---|
| B1 | **Resolved**, with a new problem in the companion guard (R1) | The shell uses kind `'sight'`; tests run the real `applyPlaceLink`. |
| M1 | **Resolved** | `cache()` + layout `Promise.all` + required `transport` param (Task 7). |
| M2 | **Resolved in effect; new problem R1** | The `LINK_FAILED` guard keeps the pin, but the search still runs (and spends a lookup), and the guard also discards an explicit `query`. |
| M3 | **Resolved** | Picker initial carries coords; always-emit. Small gap R4. |
| M4 | **Resolved** | Pair-as-unit plus placeId reset (R10, Task 1 tests). |
| M5 | **Resolved** | `'ride'` variant, note key, empty-day summary branch. Placeholder nit R6. |
| N1 | **Partly** | Only null flat values are tolerated. A round-trip of a row that **has** coords plus a new `from` still 400s (R5). |
| N2 | **Resolved** | Access check before lookups; replay cost documented. |
| N3 | **Resolved** | `parseTransportPatch` before lookups; `getTransportForWrite` dropped. |
| N4 | **Resolved, with a code mismatch** | `withContext` is not exported (`import-input.ts:84`), so the plan's "locate it with `grep -rn "export function withContext"`" finds nothing. Export it (or move it to a shared helper) as an explicit step. |
| N5 | **Resolved** | No pure fit test; e2e only. Leftover: R3's "Cost if wrong" still says "Change `fitPoints` later; one function", and that function does not exist. |
| N6 | **Resolved, needs one addition** | `beforeId="tp-route-hit"` only works if the route layers already exist when the ride layers are added. MapLibre rejects `addLayer(…, beforeId)` for a missing layer. Render `<RideLinesMaplibre>` **after** `<RouteLinesMaplibre>` in JSX **and** keep `beforeId`. |
| N7 | **Resolved** | Simpler option: pass `transport` inside the existing import body (`sections.transport` with flat lat/lng) instead of a second POST. `createFixture` already imports (`mobile-layout.spec.ts:405`). |
| N8 | **Resolved** | `rideOnDay` predicate. |
| N9 | **Resolved, new problem R2** | The import-only date check produces false positives on skeleton-day imports. |
| N10 | **Resolved** | R16 + API.md. |
| N11 | **Resolved** | The clear also blanks the label, with a fallback note. |
| N12 | **Resolved** | R17. |
| N13 | **Resolved** | Trimmed IATA check. |
| N14 | **Resolved** | Documented in the cost guardrails doc. |

### New problems / contradictions in the revised text

**R1 (minor; the most important item).** The link-failed guard spends a lookup and contradicts Review Focus 3.
- With kind `'sight'` and a Google Maps link that does not resolve, `applyPlaceLink` has `linkSent = true`. It therefore **always** runs the fallback lookup on `[name, address]` (`place-link.ts:224-248`). This spends one `LinkBudget` unit, a daily quota unit and possibly a paid Text Search, and the guard then throws the result away.
- Review Focus 3 says "search never consulted". Task 3's test says "not called *or* result discarded". Those are two different contracts.
- The guard also discards a search that ran on an **explicit `query`** (`{ googleMapsUrl: bad, query: 'KIX' }`), because `q = link?.query ?? link?.name ?? query` (`place-link.ts:228`). That contradicts R7 ("Only … `query` resolve").
- **Simpler fix, no guard needed:** choose the shell kind per end: `kind = end.query !== null ? 'sight' : 'transit'`.
  - The link is read **before** the transit early-return (`place-link.ts:205-221`). So an exact or viewport link still gives coords (with `coords_approx`), and `url_unsupported` / `url_unresolved` are still emitted.
  - The transit early-return (`:224`) then stops the name fallback without spending a lookup.
  - With a `query`, `'sight'` lets the query search run.
  - This makes Review Focus 3's "search never consulted" literally true. Change the Task 3/4 tests to assert that the search spy is **not called**.

**R2 (minor).** `transport_without_day` false positives on skeleton-day imports.
- `collectTripWarnings` reads `plan.days`, which holds only the explicitly sent days (`import-warnings.ts:135`). `importPlan` seeds day rows from `startDate..endDate` when `days` is empty.
- A transport-only import (`trip: { startDate, endDate }`, no `days`, rides with an in-range `fromDate`) would build an **empty** `dayDates` Set. Because `dayDates && !dayDates.has(…)` treats an empty Set as truthy, it warns on every ride, even though `ridesForDay` shows them.
- **Fix:** build `dayDates` from the effective day list, i.e. the date-range skeleton when `days` is empty (`expectedDayCount` + `addDaysIso`, as the preview does at `import-orchestrator.ts:88-92`). Pass `undefined` (skip the check) when no dates are known at all. Add the test.

**R3 (nit).** Signatures are inconsistent inside the plan.
- `transportWarnings(t, path?)` appears in the File Structure table and the Task 2 code block, but Task 2's bullet says `(t, path?, dayDates?)`.
- Task 3 lists `readTransportEnds(body)` in both step 1 and step 2.
- R14 sits after R17 in the rulings table.

**R4 (minor).** An end with coords but no label is still wiped by a web edit.
- `readTransportEnds` accepts `from: { lat, lng }` with no `name`, and the agent may send no `fromName`/`fromCode` either.
- The picker builds its initial selection only when `initial?.name` is set (`transport-place-picker.tsx:42-53`). If Task 6's `initialFrom` follows the same rule, this end has no initial selection, the form emits `''`, and **any** web edit wipes the coords.
- **Fix:** build `initialFrom` whenever coords **or** a name exist (label falls back to the code or to "—"). Or emit the stored coords when there is no initial selection and no report. Add a reader/initial-selection test for the coords-only case.

**R5 (nit).** R9 still rejects a full round-trip of a located row.
- A GET row that has coords (`fromLat: 13.69`, …) plus a new `from: {…}` → 400. R9's stated goal ("a GET round-trip body must still accept a new `from`") holds only for rows without coords.
- Either let the object win and drop the flat `from*` keys silently, or narrow the claim in R9 and API.md to "send either `from` or the flat fields". Keeping the 400 is fine if documented.

**R6 (nit).** Path and placeholder mismatches.
- The message files are `app/src/messages/en.json` and `th.json`, not repo-root `messages/`.
- The sibling empty-day keys use `{n}` (`"No places on Day {n} yet · showing Day {prev}"`, en.json:381), but the proposed `map_empty_day_ride` strings use `{day}`. The plan does say "match the placeholder names the sibling keys use"; make the strings themselves match.

**R7 (nit).** The two-PR split needs a second worktree and branch.
- Global Constraints and Task 0 name only `feat/tp-0142-transport-endpoints`. PR B "branched from `origin/main` after PR A merges" needs its own worktree command and branch, e.g. `feat/tp-0142-ride-lines`.

### Re-review verdict

**Ship (proceed to execution) after R1 and R2 are written into the plan.** R1's per-end kind choice also simplifies Task 3/4 by removing the guard. R3–R7 can be fixed during execution.

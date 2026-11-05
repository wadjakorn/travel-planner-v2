# Scrutiny — TP-0146 `PUT /trips/:tripId/plan` design

Reviewed: `docs/superpowers/specs/2026-11-06-put-trip-plan-design.md` against `app/src` on this branch
(+ `lib/api/place-patch.ts` from the TP-0145 worktree). Read-only review; no source edited.

**Goal (restated):** one atomic, previewable, version-checked call that reconciles a stored trip to an
import-shaped body: update by id, create without id, order = array order, optional prune.

## 0. Simpler alternative (read first)

Most of the risk sits in **day** create/delete/reorder: day idx parking, date re-derive, the `dayIdx`
remap of three tables, pruned-day cascades, and the content-vs-date conflict (M1). The ticket's real pain is
places: cross-day moves, reorder, bulk field edits, creates and prune. Days can already be added and removed
through existing endpoints.

**Phase 1 suggestion:** `days[]` must list the existing day ids in their current order. Each item may edit
`title`/`defaultMode` and carry `places`. New days may be appended at the end only, with `addDay` semantics.
Day reorder or delete returns `400 day_order_unsupported`. This removes B2, M1, M2 and most of M4, and
`expense`/`transport`/`hotel.day_idx` stay correct with no remap. Day reorder can come in phase 2, once the
date-vs-content rule (M1) has been decided.

## Blockers

### B1. `ifUpdatedAt` and the in-tx re-check do not detect concurrent writes; the 409 guarantee is false
- **Finding:** every positional writer the PUT can race with commits its data **before** it bumps
  `trip.updatedAt`, and some never bump it. The re-check under the trip lock (§3.3, line 116) can pass on a
  stale snapshot.
- **Why it matters:** PUT applies a diff computed from the snapshot to rows that have since moved. The
  results are lost reorders, places "kept" but left parked or colliding, and prune missing a place added
  meanwhile.
- **Evidence:**
  - Post-commit touch (separate statement after the tx commits):
    - `reorderPlaces`: `lib/services/place-service.ts:387`
    - `removePlace`: `:333`
    - `patchPlace`: `:235`
    - `setPlaceArrive`: `lib/services/leg-service.ts:322` (also the web `saveLegAction` via `leg-save.ts`)
    - POST `/days/:dayId/places` with `arrive`: `app/api/v1/days/[dayId]/places/route.ts:64`
  - Non-tx write, then touch:
    - `addPlace`, default `db` path: `place-service.ts:120-138`
    - `updatePlaceNote`: `:254-260`
    - `setSegmentMode`, `setDayStartMode`, `setDayDefaultMode`: `segment-service.ts:50/112/148`
  - **`removeDay` is 5+ autocommit statements with no tx or lock** (`day-service.ts:150-185`). It parks
    survivors at negative idx, flips them back, re-derives dates, and touches the trip last. A snapshot can
    read the half-shifted state.
  - **No touch at all:** the manual "Update from Google" (`refreshPlaceFromGoogleAction` →
    `google-sync-service.ts:228-245`, "no touchTrip" at `:6`). The impact is low because the TP-0145 patch
    only writes the keys that were sent.
  - Interleaving:
    1. `reorderPlaces` holds `lockDay(X)`.
    2. PUT reads its snapshot, locks the trip, and the `updatedAt` re-check passes.
    3. PUT blocks on `lockDay(X)`.
    4. `reorderPlaces` commits. Its `touchTrip` then waits on PUT's trip lock.
    5. PUT proceeds on the stale order. The reorder is silently overwritten, and its later bump makes the
       result look newer than it is.
  - The leg writers deliberately avoid touching the trip inside the tx (`leg-service.ts:29-34`), so this
    cannot be fixed by "making every path call touchTrip".
- **Suggested change:** keep `ifUpdatedAt` as the client token only. Make the authoritative check structural,
  inside the tx:
  1. Lock the trip row.
  2. Lock **all** of the trip's days in idx order. FOR UPDATE also blocks the non-tx place and segment
     inserts, through the FK KEY SHARE.
  3. Re-read the positional fingerprint: day `id:idx`, place `id:dayId:idx`, hotel `id:updatedAt`, plus
     the leg rows of the touched days. Return `409` if it differs from the pre-read snapshot.
  4. Read the pre-tx snapshot itself inside one `REPEATABLE READ READ ONLY` dbNode tx, so it cannot be torn
     (by `removeDay`, for example).
  5. Rewrite §3.3's "Requirement" bullet, which claims what the code does not do.

### B2. Write order deletes moved places: pruned days are deleted (step 4) before places move out (step 5)
- **Finding:** §7 step 4 deletes the pruned days. FK `onDelete: cascade` removes their places and segments.
  Step 5 then tries to move places out of those days.
- **Why it matters:** "merge day 3 into day 2 and prune day 3" is a natural agent edit. The moved places are
  silently destroyed (the UPDATE hits 0 rows), or the op errors out. Their leg snapshot is gone too.
- **Evidence:** design lines 239-247. Cascade note at §5.1.
- **Suggested change:**
  1. Read every leg snapshot, including those of pruned source days.
  2. Write days without deleting.
  3. Write all places, including cross-day moves out of pruned days.
  4. Delete pruned places, then delete pruned days last.
  5. Run the `dayIdx` remap.
  6. Add an integration test: move a place out of a day pruned in the same call.

## Majors

### M1. Remapping transport/expense `dayIdx` to follow content contradicts "dates follow position"
- **Finding:** §3.2 keeps calendar dates with positions. §5.3 moves `transport.dayIdx` with content. A ride
  has an absolute `fromDate`.
- **Why it matters:** after "swap day 1 and 2", a Dec-1 flight gets `dayIdx=1` and is drawn on the Dec-2 day.
  `rideOnDay` trusts `dayIdx` before `fromDate` (`lib/day-augment.ts:218-222`). Expenses have `at`, which
  has the same issue in the per-day budget views.
- **Suggested change:** pick one rule per row.
  - When the trip has a `startDate` and the row has a date (`fromDate`/`at`), leave `dayIdx` positional, or
    re-derive it from the date.
  - Remap only undated rows, or rows on trips without a start date.
  - Emit a `day_ref_moved` warning so the agent sees the effect. Phase 1 per §0 avoids the question.

### M2. `hotel_booking.day_idx` exists and is not remapped (§5.2 claim is false)
- **Evidence:**
  - Column: `db/schema.ts:302`.
  - Accepted by `lib/api/hotel-input.ts:25` and the web form `lib/hotel-form-fields.ts:19`.
  - Read by `components/bookings-view.tsx:433` (itinerary link).
  - Import validates it: `import-input.ts:148`.
- **Why it matters:** after a day move or prune, hotel itinerary links point at the wrong day.
- **Suggested change:** include `hotel_booking` in the remap. Define that a `dayIdx` sent in the body is in
  **final** positions and is excluded from the remap. Remap soft-deleted rows too, for all three tables, so
  that `restore*` does not resurrect a stale idx.

### M3. Cross-day moves lose leg notes when a pair moves together
- **Finding:** §3.2 and §7 step 3 snapshot and realign **per day**. Suppose `a→b` are adjacent in day A and
  both move, still adjacent, to day B. B's snapshot never held the pair, so the note is dropped.
- **Evidence:** `readLegSnapshot`/`applyLegRealign` are per day (`leg-service.ts:150-201`). Keys are
  place-id pairs (`lib/legs.ts:18`), so they are globally unique.
- **Suggested change:** merge the snapshots of every touched day into one map, then realign each touched day
  against the merged map. The doc's claim "exactly as reorderPlaces" only holds within a single day.

### M4. Parking at "negative idx" as `-idx` leaves idx 0 at 0
- **Finding:** steps 4 and 5 say "park at negative numbers". `removePlace` uses `-idx` safely only because it
  never parks idx 0 (`place-service.ts:310-317`). Parking a whole day or trip with `-idx` keeps row 0 at 0.
  Inserting or moving an item to final idx 0 then violates `day_trip_idx_unique` / `place_day_idx_unique`
  (`schema.ts:203,262`).
- **Suggested change:** park at `-(idx+1)`, as `compactPlaces` does (`leg-service.ts:93-112`), and spell the
  formula out in §7.

### M5. `prune: true` without `ifUpdatedAt` deletes whatever was added since the agent's GET
- **Why it matters:** the version check is optional (line 43). An agent that omits it and sends `prune`
  hard-deletes places added by a human meanwhile. B1's in-tx check only covers the snapshot→tx window, not
  GET→PUT.
- **Suggested change:** require `ifUpdatedAt` when `prune: true` (`400 version_required`). Keep it optional
  otherwise.

### M6. Lock-ordering rationale targets the wrong writer; the real cycle is elsewhere
- **Finding:** the single-day writers (`reorderPlaces`, `removePlace`, `setPlaceArrive`, `patchPlace`) hold
  one day lock and never lock the trip in-tx. They cannot deadlock with PUT; they just serialize.
  - Real risk 1: `updateTrip` with an empty header patch. It updates `days` via `syncTripDays`, then
    `touchTrip` (`trip-service.ts:182-190`), which is days→trip against PUT's trip→days → `40P01` → 500.
  - Real risk 2: step 4's park UPDATE row-locks **all** days in physical order, not idx order, so "lock
    touched days in idx order" is incomplete.
- **Suggested change:**
  - Lock all trip days explicitly in idx order up front (this also serves B1).
  - Use `FOR NO KEY UPDATE` on the trip. Plain `FOR UPDATE` blocks every child INSERT (expense, hotel, note,
    day) through FK KEY SHARE for the whole PUT.
  - Map `40P01`/`40001` to 409.
  - Optionally fix `updateTrip` to touch the trip first.

## Nits

- **Idempotency on 409:** say that the claim is released, as for 4xx validation errors. Otherwise an agent
  that retries with the same key after re-GETting may hit a key or body mismatch. Also say that a replay
  returns the *current* trip, not the trip as it was at commit.
- **Day `date` when the trip has a `startDate`:** the behaviour is undefined (ignored? 400?). Pick `400`, or
  a `date_ignored` warning.
- **Shortening guard:** PUT bypasses `updateTrip`'s "would shorten the trip" guard (`trip-service.ts:144-150`)
  via prune. State that this is intended, and still validate `endDate >= startDate`.
- **`moved` definition:** "merely slides" needs an algorithm (e.g. not in the LIS of the old order).
  Otherwise the diff output is unstable and hard to test.
- **Snapshot loaders:** `readPlanSnapshot` must not reuse the `cache()`-wrapped loaders
  (`loadHotelsForTrip`, `trip-queries.ts:265`). Those use neon-http `db` and could hand stale rows to the
  post-commit read-back.
- **Deleted trip:** the in-tx trip lock should also filter `deletedAt IS NULL`, so a PUT racing
  `deleteTrip` gets 404 rather than writing into a soft-deleted trip.
- **Claims verified true:**
  - `removeDay` does not shift `expense`/`transport` `dayIdx` (`day-service.ts:139-194`). The latent bug is
    real, and hotels are affected too.
  - `expense` has no place FK (`schema.ts:423-440`).
  - `loadApiTrip` returns `updatedAt` through the `...trip` spread (`trip-queries.ts:249`).
  - TP-0145's `resolvePlacePatch` returns a partial patch, so a merge cannot clobber resync fields.

## Verdict

**Rework.** The concurrency model rests on `trip.updatedAt` being bumped atomically with every child write,
and it is not: the leg and place writers bump after commit, and `removeDay` is non-transactional. On top of
that, the §7 write order destroys places moved out of pruned days. Fix B1 and B2, and preferably shrink
phase 1 to fixed day order (§0), before implementation starts.

## Round 2 (design v2)

### Round-1 status

| # | Status | Evidence |
|---|---|---|
| B1 | **Resolved**, with residuals in N1 | §3.3 now locks the trip and all days, then compares a structural fingerprint. Single-day writers lock their day before they write (`place-service.ts:223/283/361`, `leg-service.ts:270/312`), and non-tx place and segment INSERTs block on day FOR UPDATE through FK KEY SHARE. Once the lock is held, nothing can move a place or day underneath PUT. |
| B2 | Resolved | Phase 1 never deletes days. §7 deletes places only after the moves (4.2 → 4.4). |
| M1, M2 | Resolved (deferred) | Existing day idx never changes, so `dayIdx` on expense, transport and hotel stays valid. |
| M3 | Resolved | One merged map. Start legs are keyed `__start__\|placeId` (`lib/legs.ts:14,30`), so keys stay globally unique. |
| M4 | Resolved | `-(idx+1)` (§7 4.1) maps every idx ≥ 0 to a distinct negative. It is collision-free, including legacy ≥ 1e6 rows. |
| M5 | Resolved | `400 version_required` (§3.1). |
| M6 | **Partial** | The all-days lock in idx order, the 40P01/40001 → 409 mapping and the `updateTrip` cycle are all addressed. But FOR NO KEY UPDATE lets day **INSERTs** through (N1). |
| Nits | 5 resolved, 1 partial | Resolved: idempotency release, `days[].date` → 400, shortening guard (moot), loaders, deleted trip. Partial: `moved` (LIS has no tie-break, N4). |

**Deadlock re-check.** I found no new cycle:
- Single-day writers hold one day lock and touch the trip only after commit.
- `setPlaceArrive` with `expect` locks one day only (`leg-service.ts:311-312`).
- Hotel writers are autocommit (`booking-service.ts:116-121`).
- `updateTrip` goes trip→days whenever its header patch is non-empty (`trip-service.ts:182-190`).

The one exception is `removeDay` (N3).

### New findings

**N1 (major). Appending days is not serialised. A race returns 500.**
- **Finding:** an appended day is inserted at `idx = existingCount + k` (design:184), under a trip lock of `FOR NO KEY UPDATE` (design:103).
- **Why it matters:**
  - NO KEY UPDATE does not conflict with FK KEY SHARE. So `addDay` (autocommit INSERT, `day-service.ts:118-129`) and `syncTripDays`→`seedTripDays` (`trip-service.ts:116-117`) can insert a day after the fingerprint passes. PUT's INSERT then fails `day_trip_idx_unique` with 23505, which is unmapped, so the agent gets a 500.
  - `existingCount` is also wrong when days have a gap. The claim that the RR snapshot "cannot catch half of a removeDay" (design:101) is false. `removeDay` commits its DELETE and its park/flip as separate autocommits (`day-service.ts:153-164`), and REPEATABLE READ cannot make another writer's statements atomic. A snapshot taken between them sees days `{0,1,3,4}`, and the fingerprint matches it. The append then targets idx 4, which collides.
- **Suggested change:** the simplest fix is to drop day append from phase 1, since `POST /trips/:id/days` already exists. That removes N1, N5 and §7 step 3's insert. If append stays:
  1. Lock the trip `FOR UPDATE`, but only when days are appended.
  2. Use `idx = max(idx) + 1 + k`, read under the lock.
  3. Make the fingerprint assert that day idx is exactly `0..n-1`. Otherwise return 409.
  4. Map 23505 to 409.

**N2 (major). `budget` "as import" wipes the trip headcount.**
- **Finding:** `PATCH /trips` keeps the stored `budget.travelers` unless the body names it (`app/api/v1/trips/[tripId]/route.ts:66-70` → `keepStoredTravelers`, `trip-service.ts:176-178`, `budget-config.ts:133-140`). PUT says "as import" (design:51), and import has nothing stored to keep.
- **Why it matters:** an agent that sends `budget: {amount}` or `budget: null` silently resets travelers. That changes every per-person figure.
- **Suggested change:** route `budget` through `parseBudgetConfigInput` plus the same `keepTravelers` rule as PATCH. Add one integration test.

**N3 (nit). PUT is a new deadlock partner for the non-transactional `removeDay`.**
- **Finding:** `removeDay`'s park UPDATE locks several days in physical order. PUT locks them in idx order, so a 40P01 is possible.
- **Why it matters:** if `removeDay` is the victim, its DELETE has already committed. The trip is left with a gap, which feeds N1.
- **Suggested change:** accept this, but file the follow-up ticket "wrap `removeDay` in a dbNode tx; lock its days ORDER BY idx" next to the `dayIdx` remap ticket.

**N4 (nit). `moved`: LIS ties and raw idx.**
- **Finding:** the LIS is not unique. For old `[p1,p3]` → new `[p3,p1]`, either place is valid, and the §4 example picks p3 without saying why.
- **Suggested change:**
  - Fix a tie-break, e.g. the LIS that keeps the earliest old positions. Unit-test the §4 example.
  - Report `from`/`to` as live positions, not raw `idx` (legacy rows can sit at ≥ 1e6).

**N5 (nit). Appended day dates.**
- **Finding:** without a `startDate`, `deriveDayDate` labels the day with **today's** date (`day-service.ts:63-64`). With a `startDate`, `trip.endDate` is not extended. Both match `addDay`.
- **Suggested change:** state the parity, or warn `date_unset`. This is moot if N1 drops append.

**N6 (nit). Fingerprint scope.**
- **Over-strict:** `place.updatedAt` makes any field edit during link resolution a 409, even though §7 4.5 already re-reads the row in-tx. It is also blind to Google resync, which writes without bumping `updatedAt` (`google-sync-service.ts:122-131`). Consider `id:dayId:idx` only.
- **Uncovered:** the trip row (`title`, `budgetConfig`, `startDate`) is not in the fingerprint. Read `startDate` from the locked row for appended days.
- **Unlocked hotels:** hotel rows are not locked. A `removeHotel` after the check lets PUT update a soft-deleted row. Lock the hotel rows `FOR UPDATE` in step 2, or require `deleted_at IS NULL` and return 409 on 0 rows.

**N7 (nit). Write details.**
- A cross-day move must be **one** UPDATE that sets both `day_id` and `idx`. Setting `day_id` first would collide with the target day's parked `-(k+1)` rows.
- `updatePlace` writes its own audit row and calls `touchTrip` (`place-service.ts:189-199`). PUT needs `deferTouch` and audit suppression to deliver "one audit row".

### Simplest phase 1?

Yes, the core is right: in-day reorder, cross-day move, bulk merge, create, and prune, all atomic and previewable. This is the pain no existing endpoint covers.

**Day append** and **hotels** both duplicate working endpoints (`POST …/days`, the hotel CRUD) and bring most of the new risk (N1, N5, N6-hotels). Cutting them leaves `trip` fields, `budget`, day `title`/`defaultMode` and `places`, which is the smallest version that still solves TP-0146.

### Verdict

**Fix-then-ship.** B1 and B2 are resolved, and the lock and fingerprint model is sound for places. Open: 0 blockers, 2 majors.
- **N1:** drop day append, or serialise it.
- **N2:** budget travelers.

## Round 2 resolution (design v3, author)

| # | Resolution |
|---|---|
| N1 | Day append was dropped from phase 1 (`day_order_unsupported`; use `POST /trips/:id/days`). The fingerprint now also requires day idx = `0..n-1`, and `23505` maps to 409. |
| N2 | `budget` and `trip` were dropped from phase 1 (`unsupported_section`; use `PATCH /trips/:id`, which keeps `keepTravelers`). |
| N3 | A follow-up ticket was filed: `removeDay` in a tx with ordered locks, plus the `dayIdx` remap. |
| N4 | The LIS tie-break keeps the earliest old positions. `from`/`to` are live positions. §4 has a worked example and it is unit-tested. |
| N5 | Moot, because append was dropped. |
| N6 | The fingerprint is now day `id:idx:title:defaultMode:start_*`, place `id:dayId:idx`, and segment `dayId:idx:mode:note:durationMin`. It has no `place.updatedAt`, since the merge re-reads the row in the tx. Hotels and the trip are out of scope. |
| N7 | One UPDATE sets both `day_id` and `idx`. `updatePlace` gains `audit: false` and is called with `deferTouch`, so the call writes one audit row. |

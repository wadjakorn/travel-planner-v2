# Maps Google resync — Stage C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-10-24 against `a4f768a`** (Stage A TP-0047 and Stage B TP-0048 merged). Material changes:
> - Ticket is **TP-0049**; the worktree already exists (`../travel-planner-v2-maps-stage-c`, branch `feat/maps-stage-c`).
> - The Stage A production gate is gone (`f5d878b`): Google mode turns on wherever `MAPS_PROVIDER=google` and all four Google vars are set (Preview is always `open`). "Stage B dependency" and "no-op in production" text removed.
> - `googleBreakerOpen`, `noteGoogleFailure` and `__resetGoogleState` are **already exported** from `search.ts`. Task 1 now only changes `noteGoogleFailure`'s return type `void` → `boolean`. Both take `now: number` (ms), so callers pass `now.getTime()`. A non-`GoogleHttpError` throw counts as status 0 and **trips** the breaker. That is the existing behaviour, and the test expectations were corrected to match.
> - `caps` is still `{ full, basic, autocomplete }`, so Task 1 still adds `refresh` and `refreshManual`.
> - The fixtures are now **live captures** with real ids (`ChIJaxq89xaZ4jARQtKhE1uqq9c` "Raan Jay Fai"). The hand-written `ChIJfakeJayFai0001` refresh fixture is replaced by a live capture with `GOOGLE_REFRESH_MASK` (Task 1). Tests read expected values from the fixture file. The live-fixture step moved from Task 5 into Task 1.
> - The fake gives refresh responses the requested `id`, so fake-mode refreshes cannot rewrite `placeIdExternal`. A new synthetic `ChIJfakeClosed…` id serves `CLOSED_TEMPORARILY`, because the live capture is expected to be `OPERATIONAL`. The badge and browser checks use it.
> - Test configs need all four Google vars (`GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID` too), like `gcfg` in `search.test.ts`. Fake dev mode needs them too.
> - The cron route is modelled on `purge-google-volatile/route.ts` + `route.test.ts`, which has a test. `prune-rate-limit` has no test and no `maxDuration`.
> - Stage A "Task N" references are replaced with real module and export names. `sortable-place-item.tsx` already passes the full `Place` row, so `googleStatus` arrives without changes. `API.md` and `SKILL.md` already list every `googleStatus` value.
> - Integration candidate tests filter to this suite's ids and assert that the scratch DB has no foreign candidates.

**Goal:** Keep Google-sourced places of upcoming and in-progress trips in step with Google, without ever overwriting what the user edited. That covers name, address, coords, phone, website, rating, reviews, opening hours and business status. Two paths do it: a daily cron and an "Update from Google" button on the place edit page. Everything can be checked in fake mode without a key.

**Architecture:**
- `lib/places/google.ts` gets one more call, `googleRefreshDetails`, with a fixed Enterprise mask and no session token. It sits beside `googleDetails` / `GOOGLE_MASKS`.
- `lib/places/google-sync.ts` gets the pure merge `mergeGoogleRefresh(row, google, now)` and the badge label helper. Stage A already put `GoogleStatus`, `GoogleSnapshot`, `SyncColumns`, `StoredSync` and `VOLATILE_GROUPS` there.
- `lib/services/google-sync-service.ts` gets candidate selection, the per-row refresh, the cron loop and the button entry point. Today it only holds `purgeExpiredVolatile`. The loop takes `select` / `write` / `consume` / `fetchImpl` as injected deps, so it is unit-tested without a DB.
- The cron `/api/internal/google-resync` and the button use **separate** budget buckets (`gplaces:refresh` 20/day, `gplaces:refresh:manual` 5/day), so the cron can never starve the button.
- They reuse the breaker *state* in `search.ts` (`trippedUntil`, read through the exported `googleBreakerOpen` / `noteGoogleFailure`). That state is in memory, **per instance**. In production the cron usually runs on its own instance, so it does not share the state with search or the button across routes or invocations. What protects the cron is that each run stops at its own first 403/429/timeout.

**Tech Stack:** Next.js 16.2.4 App Router, TypeScript, vitest 3 (`src/**/*.test.ts`, node env). `*.integration.test.ts` files are gated on `TEST_DATABASE_URL`: they skip in CI, so run them locally on a scratch DB migrated to `0017` before the PR.

**Spec:** [resync design](../specs/2026-10-23-google-place-resync-design.md) §4. **Depends on:** [Stage A](2026-10-23-maps-google-switch-stage-a.md) (TP-0047) and [Stage B](2026-10-24-maps-stage-b-google-renderer.md) (TP-0048). Both are merged, so the dependency is satisfied at `a4f768a`. Every Google path is gated only on `MAPS_CONFIG.googlePlaces` (`provider === 'google'`). Production enables it by setting `MAPS_PROVIDER=google` (go-live runbook, `docs/ops/google-maps-setup.md` §9.2).

## Global Constraints

- **No new migration.** All columns (`rating_synced_at`, `hours_synced_at`, `google_synced_at`, `google_snapshot` jsonb, `google_status` text) already exist (`drizzle/0016_google_sync_columns.sql`, `db/schema.ts` `places`).
- **Gate:** the cron and the button do nothing when `!MAPS_CONFIG.googlePlaces`. The cron returns `stopped:'disabled'` without querying, and the button is not rendered. The purge cron (`/api/internal/purge-google-volatile`) is untouched and keeps running in both modes.
- **Refresh call:** `GET https://places.googleapis.com/v1/places/{id}?languageCode=<lang>`, **no `sessionToken`**, `cache:'no-store'`, timeout **3000 ms**. The `X-Goog-FieldMask` header is exactly `GOOGLE_REFRESH_MASK` = `id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount`, which bills as **Place Details Enterprise** ($20/1k, 1,000/month free). No Atmosphere field (`reviews`, `editorialSummary`, …) may enter this mask. It equals `GOOGLE_MASKS.full` minus `types` plus `businessStatus`.
  - `lang = queryLang(row.googleSnapshot?.name ?? row.name)`, so a Thai-named place stays Thai.
  - The id goes through `isValidGoogleId` (`google.ts`, `/^[A-Za-z0-9_-]{1,256}$/`) before any consume or fetch.
- **Budget:** two buckets with fixed 86400 s windows. Each is consumed **exactly once** per Google call, after validation:
  - cron: `gplaces:refresh`, `GOOGLE_PLACES_REFRESH_DAILY_CAP` default **20**
  - button: `gplaces:refresh:manual`, `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP` default **5**, on top of the existing per-user `allowPlacesRequest` limit (`places:${userId}`, 120 per 600 s)
  - Both accept any positive integer and otherwise use the default (the existing `cap()` parser in `config.ts`). The existing rules apply: the limiter **fails open** if it throws (like the private `consumeDaily` in `search.ts`), and **fake mode skips it**. Console Place Details/day quota = **135** (30 + 80 + 20 + 5).
- **Breaker:** the `search.ts` breaker state is per instance and in memory (see Architecture). An open breaker means no consume and no fetch. `noteGoogleFailure` trips it for 10 min (`BREAKER_MS = 600_000`) on `GoogleHttpError` status `0`, `403` or `429`, and on any non-`GoogleHttpError` throw, which it treats as status 0. A trip **stops the cron run**, and the button reports "unavailable".
- **Failure classes:**
  - `404` → `google_status = 'NOT_FOUND'`. The data is kept and the row is never selected again.
  - **Deterministic:** a bare id failing `isValidGoogleId`, a Google `400`, or a 200 without `location` (`googleRefreshDetails` → `null`). Write `{ googleStatus:'INVALID', googleSyncedAt: now }`; the data is kept and the row is never selected again. A new pick that changes the id resets the status to null (`googleSyncOnUpdate`).
  - **Transient:** `0`/`403`/`429` and non-HTTP throws (breaker), plus `5xx` and any other non-2xx. These make **no write**, and the row is retried the next day.
- **Candidates:**
  - **Filters:** a Google id (bare, non-empty); place and trip not soft-deleted (`day` has no `deleted_at`); `google_status` null or not in (`NOT_FOUND`, `INVALID`); `trip.end_date >= today`; `google_synced_at` null or `< now − 25 days`.
  - `today = now.toISOString().slice(0, 10)` (UTC). `end_date` is ISO text.
  - Null `google_synced_at` includes rows just picked with a `basic` pick: `googleSyncOnAdd` writes their snapshot with `googleSyncedAt: null`, so the next run fetches the full data.
  - **Order:** **`trip.start_date ASC NULLS LAST, google_synced_at ASC NULLS FIRST, place.id ASC`**, so the soonest trips get the cap first. **Limit** = cron cap.
  - Undated trips (`end_date` null) are **not** refreshed (design §4.1 as written).
- **Merge** (design §4.3) is one pure function, `mergeGoogleRefresh`. The writer applies its patch as is. Cron writes never touch `updated_at` and never call `touchTrip`, because a background refresh is not a user edit.
- **Lost update guard:** `writeRefreshPatch` is conditional:
  - The query is `UPDATE place SET … WHERE id = $1 AND date_trunc('milliseconds', updated_at) = $2::timestamp`, with `$2 = rowUpdatedAt.toISOString()` (the candidate's `updatedAt` as read). `date_trunc` is needed because `defaultNow()` stores microseconds and a JS `Date` holds ms.
  - **The parameter must be the ISO string with an explicit `::timestamp` cast, never a raw `Date`.** Inside a `sql` template, Drizzle does not run the column's `mapToDriverValue`, and it disables postgres-js's date serializers. neon-http formats a `Date` in the process's local time zone with an offset. Compared with the `timestamp` (no tz) column, that misses by the offset (7 h on the Asia/Bangkok dev box), so every write would silently be `'skipped'`.
  - `updated_at` is `timestamp without time zone` holding UTC wall time. Casting the `…Z` string to `::timestamp` drops the `Z` and compares like for like.
  - User edits bump `updated_at` and cron writes don't, so a user save between select and write makes the write a no-op → outcome `'skipped'`. The budget is already spent, and the row is retried the next day because `google_synced_at` did not move.
  - The other direction (an edit form opened before the refresh and saved after it) is already handled by `formBase`. In `updatePlace`, `omitUnits(fields, untouchedUnits(fields, base))` leaves units the user did not change out of the `UPDATE … SET`, so they keep the refreshed values.
- **UI language:** `place-row.tsx` and `place-form.tsx` are hard-coded English (no dict reaches them), so new copy is English: "Closed permanently", "Temporarily closed", "Update from Google".
- **Fake mode:** `GOOGLE_PLACES_FAKE=1` is non-production only. It needs `MAPS_PROVIDER=google` plus `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID` set (any value; the server key and signing secret may be empty), and it is never active on Vercel Preview. It serves the refresh fixture, so the cron, the button and the badge can be checked in the browser without a key.

## Review Focus

1. **User edits survive a refresh.** An edited name, address, phone, website, a dragged pin, or a user-typed rating or hours is never overwritten. Unedited values follow Google. → Task 2 merge table.
2. **The cron stops on trouble and never exceeds its budget.**
   - The run stops at its **own** first 403/429/timeout: a 403 on row 3 stops it with 2 refreshed and no 4th fetch.
   - A denied consume stops it, and an open breaker (same instance) means zero consumes.
   - The plan does **not** claim the breaker is shared across routes or invocations in production.
   - The button has its own 5/day bucket, so the cron cannot starve it.
   - → Task 3 `runGoogleResync` tests.
3. **Candidate selection.** Excluded: ended, undated or deleted trips, deleted places, non-Google ids, `NOT_FOUND`, `INVALID`, and rows synced less than 25 days ago. The soonest `start_date` goes first, then never-synced rows. The cron cap is the limit. → Task 3 integration test.
3b. **No lost update, no clogged queue.**
   - A user save between select and write makes the cron write a no-op (`'skipped'`).
   - An unchanged row is still written when the process runs in a non-UTC zone (`::timestamp`-cast ISO bind, tested under `TZ=Asia/Bangkok`).
   - Deterministic failures (bad id, 400, no `location`) are marked `INVALID` once instead of being retried forever. Transient ones write nothing.
   - → Task 3 tests.
4. **Billing tier.** The refresh mask is Enterprise (not E+A) and carries no session token. Fake mode spends no budget. → Task 1 mask/URL tests.
5. **`NOT_FOUND` / `INVALID` and status.** A 404 writes only `google_status`. `INVALID` writes the status and `google_synced_at`. Both keep the data, hide the button and never refetch. `CLOSED_*` shows the badge in the itinerary. → Task 2 rows 15/15b, Task 3, Task 4.

---

## File map

| File | Change |
|---|---|
| `app/src/lib/maps/config.ts` (+`config.test.ts`) | Add `caps.refresh` from `GOOGLE_PLACES_REFRESH_DAILY_CAP` and `caps.refreshManual` from `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP` to `MapsConfig['google']['caps']` (L15) and the `caps` object (L39–43) |
| `app/src/lib/places/search.ts` (+`search.test.ts`) | `noteGoogleFailure` (L40–48) returns `boolean` (true iff it tripped). `googleBreakerOpen` and `__resetGoogleState` are already exported and unchanged |
| `app/src/lib/places/google.ts` (+`google.test.ts`), `google-fake.ts`, `__fixtures__/google-details-refresh.json` (**live capture**), `__fixtures__/google.md` | `GOOGLE_REFRESH_MASK`, `GoogleRefresh`, `googleRefreshDetails`; fake routing for the refresh mask plus the synthetic `ChIJfakeGone…` / `ChIJfakeBad…` / `ChIJfakeClosed…` ids |
| `app/src/lib/places/google-sync.ts` (+`google-sync.test.ts`) | `MergeRow`, `RefreshPatch`, `mergeGoogleRefresh`, `statusBadgeLabel` |
| `app/src/lib/services/google-sync-service.ts` (+**new** `google-sync-service.test.ts`, +existing `google-sync-service.integration.test.ts`) | Add `selectResyncCandidates`, `writeRefreshPatch`, `refreshOne`, `runGoogleResync`, `refreshPlaceFromGoogle` next to `purgeExpiredVolatile` |
| `app/src/app/api/internal/google-resync/route.ts` (+`route.test.ts`), `app/vercel.json` | **Create.** Daily cron, modelled on `purge-google-volatile/route.ts` + `route.test.ts` |
| `app/src/app/actions/places.ts`, `app/src/components/google-refresh-button.tsx` (new), `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx` | Button |
| `app/src/components/place-row.tsx`, `app/src/components/itinerary-list.module.css` | Status badge |
| `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md` (`API.md`, `agent-skill/travel-planner-api/SKILL.md` re-check only) | Docs |

## Task 0: Ticket and worktree

- [ ] Ticket **TP-0049** "Maps: Google resync stage C" exists. Use it in every commit.
- [ ] The worktree already exists: `/home/wadjakorn/development/travel-planner-v2-maps-stage-c`, branch `feat/maps-stage-c` off `origin/main` `a4f768a`. Sanity check: `rg -n "visibleVolatile|googleBreakerOpen" app/src/lib` hits. Then `cd app && pnpm install && pnpm test 2>&1 | tail -3` → all pass.

### Task 1: Refresh caps, breaker return value, refresh client and live fixture

**Files:**
- Modify `lib/maps/config.ts` (+`config.test.ts`), `lib/places/search.ts` (+`search.test.ts`), `lib/places/google.ts` (+`google.test.ts`), `lib/places/google-fake.ts`, `__fixtures__/google.md`.
- Create `__fixtures__/google-details-refresh.json`.

**Consumes:**
- `MapsConfig`, `readMapsConfig`, `cap()` (`lib/maps/config.ts`)
- `GoogleHttpError`, `isValidGoogleId`, `GOOGLE_MASKS`, the private `call()` helper (`google.ts`), `fakeGoogleFetch` (`google-fake.ts`)
- `trippedUntil`, `googleBreakerOpen`, `noteGoogleFailure`, `__resetGoogleState` (`search.ts`, already exported)
- `GoogleStatus` (`google-sync.ts`)

**Produces:**
```ts
// config.ts
MapsConfig['google']['caps']: { full: number; basic: number; autocomplete: number; refresh: number; refreshManual: number };
// search.ts — already exported; only the return type changes (void → boolean), behaviour unchanged
export function googleBreakerOpen(now: number): boolean;                 // now < trippedUntil (ms)
export function noteGoogleFailure(err: unknown, now: number): boolean;   // status 0/403/429 (non-GoogleHttpError counts as 0) → trippedUntil = now + 600_000, returns true; else false
// google.ts
export const GOOGLE_REFRESH_MASK: string;
export type GoogleRefresh = { id: string; name: string; address: string | null; lat: number; lng: number; phone: string | null;
  website: string | null; hours: string | null; rating: number | null; reviews: number | null;
  businessStatus: Exclude<GoogleStatus, 'NOT_FOUND' | 'INVALID'> | null };   // only Google's own values; NOT_FOUND / INVALID are ours
export function googleRefreshDetails(id: string, o: { key: string; lang: 'th'|'en'; fetchImpl: typeof fetch; timeoutMs?: number }): Promise<GoogleRefresh | null>;
```
`google.ts` imports `GoogleStatus` as a **type-only** import from `./google-sync`. `google-sync.ts` will import `GoogleRefresh` type-only in Task 2. The cycle is type-only, which is fine.

- [ ] **Step 1: Live fixture.**
  - With the server key from `app/.env`, capture the first live suggestion's refresh details (one Enterprise call, inside the free tier):
    ```bash
    curl -s "https://places.googleapis.com/v1/places/ChIJaxq89xaZ4jARQtKhE1uqq9c?languageCode=en" \
      -H "X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY" \
      -H "X-Goog-FieldMask: id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount" \
      > app/src/lib/places/__fixtures__/google-details-refresh.json
    ```
    There is no `sessionToken`. Keep `businessStatus` as captured; `OPERATIONAL` is expected.
  - Add a row to the `google.md` table: "`google-details-refresh.json` | GET first suggestion, `GOOGLE_REFRESH_MASK`, `languageCode en`, no session". Extend the "Recapture requires…" note with the refresh values asserted in `google.test.ts`.
  - **Fallback when no server key is available:** derive the file from `google-details-full.json` by dropping `types` and adding `"businessStatus":"OPERATIONAL"`. Say "derived, not captured" in `google.md`.
  - Either way, tests read expected values **from the fixture JSON**, never hard-coded, like `google-fake.ts` reads `secondId`. At the 2026-10-24 full capture the values were: name `Raan Jay Fai`, `location 13.7525912, 100.50481889999999`, `rating 3.6`, `userRatingCount 5117`, 7 `weekdayDescriptions`.
- [ ] **Step 2: Failing tests.**
  - **config (`config.test.ts`):**
    - `GOOGLE_PLACES_REFRESH_DAILY_CAP`: unset → `caps.refresh === 20`; `'5'` → `5`; `'0'`, `'abc'`, `'2.5'` → `20`.
    - `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP`: unset → `caps.refreshManual === 5`; `'3'` → `3`; `'0'` → `5`.
    - Both caps are present in `open` mode too (the `open()` branch shares `caps`). Existing cap tests are unchanged.
  - **breaker (`search.test.ts`; the existing `beforeEach(() => __resetGoogleState())`, `T0`, `gcfg`):**
    - `noteGoogleFailure(new GoogleHttpError(403), T0)` → `true`.
    - `GoogleHttpError(0)` and `(429)` → `true`. `new Error('x')` → `true` (non-HTTP errors count as status 0; existing behaviour).
    - `GoogleHttpError(404)` and `(500)` → `false`, and the breaker stays closed.
    - The open window is already covered by the existing "only 0/403/429 trip" test (`T0 + 599_999` open, `T0 + 600_000` closed). Extend that test rather than duplicating it.
    - After `noteGoogleFailure(new GoogleHttpError(403), T0)`, `searchPlaces` with `gcfg` and `now: () => T0 + 60_000` makes no Google call. This proves search and the export share state **within one instance**.
    - All existing search tests pass unchanged.
  - **`googleRefreshDetails` (`google.test.ts`):**
    - It GETs `https://places.googleapis.com/v1/places/ChIJabc?languageCode=th`, with **no** `sessionToken` param, `X-Goog-Api-Key: K`, `X-Goog-FieldMask === GOOGLE_REFRESH_MASK` and `cache:'no-store'`.
    - `GOOGLE_REFRESH_MASK === 'id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount'`.
    - The refresh fixture parses to `{ id: fx.id, name: fx.displayName.text, address: fx.formattedAddress, lat: fx.location.latitude, lng: fx.location.longitude, phone: fx.nationalPhoneNumber ?? null, website: fx.websiteUri ?? null, hours: fx.regularOpeningHours.weekdayDescriptions.join('; '), rating: fx.rating, reviews: fx.userRatingCount, businessStatus: fx.businessStatus }`, where `fx` is the imported JSON.
    - The returned `id` is the **response** `id` (falling back to the requested id when it is absent), so Google id changes reach the merge (Task 2 row 18).
    - `businessStatus:'SOMETHING_NEW'` or missing → `businessStatus:null`. Missing `displayName` → `name:''`. Missing `location` → `null`.
    - 400 rejects with `GoogleHttpError` status 400, and 404 with status 404. A network error or a real 1 ms timeout rejects with status 0, using the same technique as the existing `describe('errors')` block.
  - **fake (`google.test.ts` `describe('fakeGoogleFetch')`):**
    - A request whose `X-Goog-FieldMask` equals `GOOGLE_REFRESH_MASK` gets the refresh fixture with `id` set to the **requested** id.
    - Other details requests are unchanged: `google-details-second.json` for `secondId`, otherwise `google-details-full.json`, and the basic mask is still filtered.
    - Any `/v1/places/ChIJfakeGone…` id → 404 with body `{"error":{"code":404,"status":"NOT_FOUND"}}`.
    - Any `/v1/places/ChIJfakeBad…` id → 400 with body `{"error":{"code":400,"status":"INVALID_ARGUMENT"}}`.
    - Any `/v1/places/ChIJfakeClosed…` id with the refresh mask → the refresh fixture with that id and `businessStatus:'CLOSED_TEMPORARILY'`.
    - All three synthetic ids pass `isValidGoogleId`.
- [ ] **Step 3:** `pnpm vitest run src/lib/maps src/lib/places` → FAIL.
- [ ] **Step 4: Implement.**
  - In `search.ts`, make `noteGoogleFailure` `return true` after setting `trippedUntil`, and `false` otherwise. The callers in `tryGoogle` / `googlePlaceDetail` ignore the value. No other change: those callers already use the export.
  - In `config.ts`, add `refresh: cap(env.GOOGLE_PLACES_REFRESH_DAILY_CAP, 20)` and `refreshManual: cap(env.GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP, 5)`.
  - `googleRefreshDetails` reuses `call()` (error handling, `no-store`, timeout) and the `weekdayDescriptions.join('; ')` hours formatting from `googleDetails`. Extract a small private helper if it avoids duplication. Add `businessStatus?: string` to `RawDetails`.
  - In `google-fake.ts`, route the synthetic ids before the `DETAILS[id] ?? detailsFull` fallback (L29–33).
- [ ] **Step 5:** Run → PASS. `pnpm typecheck 2>&1 | tail -3` is clean.
- [ ] **Step 6:** Commit `feat(places): Google refresh details call, refresh caps, breaker result [TP-0049]`.

### Task 2: `mergeGoogleRefresh` (pure)

**Files:** Modify `lib/places/google-sync.ts`, `google-sync.test.ts`.

**Consumes:** `StoredSync`, `SyncColumns`, `GoogleSnapshot`, `GoogleStatus`, `VOLATILE_GROUPS` (`google-sync.ts`); `GoogleRefresh` (Task 1, type-only); `isValidGoogleId` (`google.ts`; pure, no server-only import).

**Produces:**
```ts
export type MergeRow = StoredSync & { name: string; address: string | null; lat: number | null; lng: number | null;
  phone: string | null; website: string | null };
export type RefreshPatch = Partial<Pick<MergeRow, 'name'|'address'|'lat'|'lng'|'phone'|'website'|'hours'|'rating'|'reviews'|'placeIdExternal'> & SyncColumns>;
export function mergeGoogleRefresh(row: MergeRow, google: GoogleRefresh | 'NOT_FOUND' | 'INVALID', now: Date): RefreshPatch;
export function statusBadgeLabel(s: GoogleStatus | null | undefined): 'Closed permanently' | 'Temporarily closed' | null;
```
A field key is in the patch **iff** the rules decide to write it. `googleSnapshot` and `googleSyncedAt` are always written on success.

- [ ] **Step 1: Failing tests** (`now = 2026-10-23T00:00Z`, `D` = 1 day). These use synthetic in-test values; no fixture is involved.
  - Base row **R**: `name:'Jay Fai'`, `address:'Old Rd'`, `lat:13.7524`, `lng:100.5045`, `phone:'02-1'`, `website:'https://a'`, `hours:'H1'`, `rating:4.4`, `reviews:1234`, `ratingSyncedAt: now−20D`, `hoursSyncedAt: now−20D`, `placeIdExternal:'ChIJa'`, `googleSnapshot:{ name:'Jay Fai', address:'Old Rd', lat:13.7524, lng:100.5045, phone:'02-1', website:'https://a' }`, `googleSyncedAt: now−26D`, `googleStatus:'OPERATIONAL'`.
  - Google **G**: `id:'ChIJa'`, `name:'Jay Fai 2'`, `address:'New Rd'`, `lat:13.7525`, `lng:100.5046`, `phone:'02-2'`, `website:'https://b'`, `hours:'H2'`, `rating:4.5`, `reviews:1300`, `businessStatus:'CLOSED_TEMPORARILY'`.

  | # | Row change from R (G unless noted) | Expected patch |
  |---|---|---|
  | 1 | none (unedited) | every field takes G's value; `ratingSyncedAt: now`, `hoursSyncedAt: now`, `googleStatus:'CLOSED_TEMPORARILY'`, `googleSyncedAt: now`, `googleSnapshot: { name:'Jay Fai 2', address:'New Rd', lat:13.7525, lng:100.5046, phone:'02-2', website:'https://b' }`; no `placeIdExternal` key |
  | 2 | `name:'My fave'` | no `name` key; `googleSnapshot.name === 'Jay Fai 2'`; other fields as row 1 |
  | 3 | `address:'My Rd'` | no `address` key; `name` updated |
  | 4 | `googleSnapshot:null`, `address:null`, `website:''` | `address:'New Rd'`, `website:'https://b'` (fill empties only); no `name`, `phone`, `lat`, `lng` keys; `googleSnapshot` = G's six values |
  | 5 | snapshot `{name,address,lat,lng}` only (basic pick), `phone:null`, `website:'mine'` | `phone:'02-2'`; no `website` key |
  | 6 | `lat: 13.7524 + 5e-8` | `lat:13.7525`, `lng:100.5046` (within 1e-7 → unedited) |
  | 7 | `lat: 13.7524 + 2e-7` (pin dragged) | neither `lat` nor `lng` key |
  | 8 | `lng: 100.5045 + 2e-7` only | neither `lat` nor `lng` key |
  | 9 | `googleSnapshot:null`, `lat:null`, `lng:null` | `lat:13.7525`, `lng:100.5046` |
  | 10 | `rating:3`, `reviews:null`, `ratingSyncedAt:null` (user's) | no `rating`, `reviews`, `ratingSyncedAt` keys; `hours:'H2'` still written |
  | 11 | `ratingSyncedAt: now−40D` (expired, not yet purged) | `rating:4.5`, `reviews:1300`, `ratingSyncedAt: now` |
  | 12 | `rating:null`, `reviews:null`, `ratingSyncedAt:null` | `rating:4.5`, `reviews:1300`, `ratingSyncedAt: now` |
  | 13 | none; G `rating:null, reviews:null` | `rating:null`, `reviews:null`, `ratingSyncedAt:null` |
  | 14 | `hours:'My hours'`, `hoursSyncedAt:null` | no `hours`, `hoursSyncedAt` keys; rating group still written |
  | 15 | google = `'NOT_FOUND'` | deep-equals `{ googleStatus:'NOT_FOUND' }` |
  | 15b | google = `'INVALID'` | deep-equals `{ googleStatus:'INVALID', googleSyncedAt: now }` |
  | 16 | none; G `name:''` | no `name` key; `googleSnapshot.name === 'Jay Fai'` (previous) |
  | 17 | none; G `businessStatus:null` | `googleStatus:null` |
  | 18 | none; G `id:'ChIJnew'` | `placeIdExternal:'ChIJnew'` |
  | 19 | none; G `id:'a/b'` | no `placeIdExternal` key |
  | 20 | none; G `address:null` | `address:null` (row matched the snapshot, so it follows Google) |

  Plus:
  - R is not mutated.
  - Idempotent: with `R1 = { ...R, ...merge(R, G, now) }`, `{ ...R1, ...merge(R1, G, now + 1D) }` equals `R1` except the three `*SyncedAt` timestamps.
  - `statusBadgeLabel`: `CLOSED_PERMANENTLY` → `'Closed permanently'`, `CLOSED_TEMPORARILY` → `'Temporarily closed'`, `OPERATIONAL` / `NOT_FOUND` / `INVALID` / `null` / `undefined` → `null`.
- [ ] **Step 2:** `pnpm vitest run src/lib/places/google-sync` → FAIL.
- [ ] **Step 3: Implement** per design §4.3:
  - "Empty" means `null` or `''`.
  - A snapshot key that is `undefined` (row 5) is treated like no snapshot for that field.
  - Lat/lng are one unit, matching `UNIT_FIELDS.location`.
  - Groups iterate `VOLATILE_GROUPS` with the same `rating → ratingSyncedAt`, `hours → hoursSyncedAt` mapping as the private `SYNC_COL`.
  - Keep the file pure: no db or server-only imports.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(places): merge rules for Google refresh that keep user edits [TP-0049]`.

### Task 3: Refresh service: candidates, per-row refresh, cron loop

**Files:** Modify `lib/services/google-sync-service.ts`. Create `google-sync-service.test.ts` (unit, deps injected). Extend the existing `google-sync-service.integration.test.ts` (gated on `TEST_DATABASE_URL`).

**Consumes:**
- Task 1–2 exports
- `Consume`, `allowPlacesRequest` (`lib/places/rate-limit.ts`)
- `consumeRateLimitKey` (`lib/api/rate-limit.ts`, default consume)
- `resolvePlaceWrite(userId, placeId, exec)` (`lib/services/access.ts`; throws `ServiceError('forbidden')`)
- `queryLang` (`lib/places/lang.ts`), `isGooglePlaceId` (`lib/places/place-id.ts`), `fakeGoogleFetch`, `MAPS_CONFIG` / `MapsConfig`
- `IdemExecutor` (`lib/api/idempotency.ts`; the existing `purgeExpiredVolatile` pattern is `exec: IdemExecutor = db` and `(exec as typeof db)`)

**Produces:**
```ts
export type ResyncCandidate = MergeRow & { id: string; updatedAt: Date };
export type RefreshOutcome = 'ok' | 'not_found' | 'invalid' | 'skipped' | 'unavailable' | 'limit' | 'error';
export type RefreshSource = 'cron' | 'manual';   // cron → gplaces:refresh / caps.refresh; manual → gplaces:refresh:manual / caps.refreshManual
export type RefreshDeps = { now?: () => Date; config?: MapsConfig; fetchImpl?: typeof fetch; consume?: Consume; source?: RefreshSource; // default 'cron'
  select?: (now: Date, limit: number) => Promise<ResyncCandidate[]>;
  write?: (id: string, patch: RefreshPatch, rowUpdatedAt: Date) => Promise<boolean>;            // false = row changed since read
  load?: (placeId: string) => Promise<ResyncCandidate | null> };
export async function selectResyncCandidates(now: Date, limit: number, exec?: IdemExecutor): Promise<ResyncCandidate[]>;
export async function writeRefreshPatch(id: string, patch: RefreshPatch, rowUpdatedAt: Date, exec?: IdemExecutor): Promise<boolean>; // WHERE id AND date_trunc('milliseconds', updated_at) = ${rowUpdatedAt.toISOString()}::timestamp
export async function refreshOne(row: ResyncCandidate, deps?: RefreshDeps): Promise<RefreshOutcome>;
export async function runGoogleResync(deps?: RefreshDeps): Promise<{ refreshed: number; notFound: number; invalid: number; skipped: number; failed: number; stopped: null | 'disabled' | 'breaker' | 'budget' }>;
export async function refreshPlaceFromGoogle(userId: string, placeId: string, deps?: RefreshDeps & { exec?: IdemExecutor; allow?: (userId: string) => Promise<boolean> }): Promise<RefreshOutcome>;
```

**`refreshOne` order.** `W(x)` = `write(id, mergeGoogleRefresh(row, x, now), row.updatedAt)`. A `false` return from `write` turns the outcome into `'skipped'`. `t = now.getTime()`, because the breaker API takes ms. The checks run in this order:
1. `!cfg.googlePlaces` → `'unavailable'`.
2. Prefixed or empty id (not `isGooglePlaceId`) → `'error'`, with no consume and no write.
3. Bare id failing `isValidGoogleId` → `W('INVALID')` → `'invalid'` (no consume).
4. `googleBreakerOpen(t)` → `'unavailable'` (no consume).
5. Consume, unless fake: source cron uses `('gplaces:refresh', caps.refresh, 86400)`, source manual uses `('gplaces:refresh:manual', caps.refreshManual, 86400)`. Wrap it in a try/catch like `search.ts`'s private `consumeDaily`: a throw → continue; `!ok` → `'limit'`.
6. Call `googleRefreshDetails` with `cfg.google.serverKey` and `cfg.google.fake ? fakeGoogleFetch() : fetchImpl ?? fetch`.
7. Result `null` (no `location`) → `W('INVALID')` → `'invalid'`.
8. 404 → `W('NOT_FOUND')` → `'not_found'`.
9. 400 → `W('INVALID')` → `'invalid'`.
10. `noteGoogleFailure(e, t) === true` (0/403/429 or any non-`GoogleHttpError` throw) → `'unavailable'` (no write).
11. Any other `GoogleHttpError` (5xx, other non-2xx) → `'error'` (no write).
12. Success → `W(g)` → `'ok'`.

`runGoogleResync` runs rows **sequentially**. It counts `ok`→`refreshed`, `not_found`→`notFound`, `invalid`→`invalid`, `skipped`→`skipped` and `error`→`failed`, and it stops on `'unavailable'` (`stopped:'breaker'`) or `'limit'` (`stopped:'budget'`). It calls `select(now, cfg.google.caps.refresh)`.

- [ ] **Step 1: Failing unit tests** (`google-sync-service.test.ts`).
  - Setup: `server-only` is already aliased to a stub in `vitest.config.ts`. `gcfg = readMapsConfig({ MAPS_PROVIDER:'google', GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X', GOOGLE_MAPS_BROWSER_KEY:'B', GOOGLE_MAPS_MAP_ID:'M', NODE_ENV:'test' })`, the same as `search.test.ts`. `fakeCfg` is the same with `GOOGLE_PLACES_FAKE:'1'` and no server key or secret. `select`, `write`, `consume`, `fetchImpl` and `now` are all injected. `beforeEach(__resetGoogleState)`, imported from `@/lib/places/search`.
  - **Disabled:** open config → deep-equals `{ refreshed:0, notFound:0, invalid:0, skipped:0, failed:0, stopped:'disabled' }`, and `select` is never called. This is the same object the Task 4 Step 7 browser check expects.
  - **Happy path:** 3 candidates, all 200 →
    - result `{ refreshed:3, notFound:0, invalid:0, skipped:0, failed:0, stopped:null }`;
    - `select` called with `(now, 20)`;
    - `consume` called 3× with `('gplaces:refresh', 20, 86400)`;
    - `write` called 3× with the `mergeGoogleRefresh` result and the row's `updatedAt`.
  - **Breaker stop:** row 2 answers 403 → `{ refreshed:1, stopped:'breaker' }` and **no** fetch for row 3. A following `searchPlaces` with `gcfg` and the same clock skips Google.
  - **Timeout:** row 1 times out (`GoogleHttpError(0)`) → `stopped:'breaker'`, `refreshed:0`.
  - **Budget stop:** row 2's consume returns `{ ok:false, retryAfter:3600, limit:20 }` → `{ refreshed:1, stopped:'budget' }`, and no fetch for rows 2–3.
  - **Breaker already open:** call `noteGoogleFailure(new GoogleHttpError(403), now.getTime())` first → `stopped:'breaker'`, and `consume` is never called.
  - **Mixed results:** row 1 → 404, row 2 → 500, row 3 → 200 →
    - result `{ refreshed:1, notFound:1, invalid:0, skipped:0, failed:1, stopped:null }`;
    - row 1's write is exactly `{ googleStatus:'NOT_FOUND' }`;
    - row 2 is not written.
  - **Deterministic failures:** row 1 → 400, row 2 → 200 without `location`, row 3 has the bare id `'a/b'` →
    - result `{ invalid:3, failed:0, stopped:null }`;
    - each write is exactly `{ googleStatus:'INVALID', googleSyncedAt: now }`;
    - `consume` called 2× (not for row 3), and `fetchImpl` called 2×.
  - **Transient failures write nothing:** rows answering 500, 503 and a network error (`GoogleHttpError(0)`, row 3) → `write` is never called for them, and row 3 ends the run with `stopped:'breaker'`.
  - **Lost update:** `write` returns `false` for row 1 → `{ refreshed:2, skipped:1 }`, and the run continues.
  - **Manual source:** `refreshOne(row, { source:'manual', … })` consumes `('gplaces:refresh:manual', 5, 86400)`. The default source consumes `gplaces:refresh`.
  - **Fail open:** `consume` throws → Google is still called.
  - **Fake config:**
    - `consume` is never called, and the fixture serves the fetch.
    - `write` gets `googleStatus` equal to the refresh fixture's `businessStatus` (read from the JSON).
    - `placeIdExternal` does not change: the fake echoes the requested id.
    - A row with id `'ChIJfakeClosed0001'` gets `googleStatus:'CLOSED_TEMPORARILY'`.
  - **Language:** a row whose snapshot name is `'ร้านเจ๊ไฝ'` requests `languageCode=th`; `'Jay Fai'` → `en`.
  - **`refreshPlaceFromGoogle`** (`load` and `allow` injected; `vi.mock('@/lib/services/access')` makes `resolvePlaceWrite` resolve `{ tripId:'t', dayId:'d', idx:0 }`):
    - `allow` false → `'limit'`, no fetch.
    - `load` returns `null` → `'error'`, no consume, no fetch.
    - Loaded row with `googleStatus:'NOT_FOUND'` → `'not_found'`, no fetch.
    - Loaded row with `googleStatus:'INVALID'` → `'invalid'`, no fetch.
    - Non-Google id → `'error'`.
    - Happy path → `'ok'`, one write, consume on `gplaces:refresh:manual`.
- [ ] **Step 2: Failing integration tests.**
  - **Setup:**
    - Append a new `suite('Google resync candidates', …)` block to `google-sync-service.integration.test.ts`. Use the same `TEST_DATABASE_URL` gate and the same postgres-js / drizzle setup, but give it its own trips, days, owner and `seed` helper; the existing suite has a single trip/day.
    - Run it with a **non-UTC** zone, `TZ=Asia/Bangkok`, so a raw-`Date` bind would fail.
    - Assertions filter results to this suite's place ids. The first `it` asserts that `selectResyncCandidates(now, 1000, exec)` returns no ids outside this suite, and fails loudly with "use a freshly migrated scratch DB" instead of flaking on leftovers that sort first.
  - **Seed** with `now = 2026-10-23T00:00Z`:
    - Trips: `T1` (`start_date '2026-10-20'`, `end_date '2026-10-23'`), `T2` (`end_date '2026-10-22'`), `T3` (`end_date` null), `T4` (`'2026-12-01'`, `deleted_at` set), `T5` (`start_date '2026-11-01'`, `end_date '2026-11-05'`).
    - On `T1`: `p-null` (synced null), `p-30` (`now−30d`), `p-26` (`now−26d`), `p-24` (`now−24d`), `p-nf` (`google_status 'NOT_FOUND'`, synced null), `p-inv` (`google_status 'INVALID'`, synced null), `p-geo` (`'geoapify:x'`), `p-del` (`deleted_at` set).
    - On `T5`: `p-later` (synced null).
    - One synced-null Google place each on `T2`, `T3` and `T4`.
    - Every Google place has a bare `place_id_external` such as `'ChIJ…'`.
  - **Assertions:**
    - `selectResyncCandidates(now, 10, exec)` → ids `[p-null, p-30, p-26, p-later]` in that order. The earlier trip comes first even though `p-later` was never synced, and `p-inv` is excluded.
    - `selectResyncCandidates(now, 2, exec)` → `[p-null, p-30]`.
    - Returned rows carry every `MergeRow` column plus `updatedAt`, with `googleSnapshot` parsed as an object (jsonb).
    - Seed `p-26` with `updated_at = '2026-10-20 10:00:00.123456'` (microseconds). Then `writeRefreshPatch('p-26', { name:'N', googleSyncedAt: now }, <its selected updatedAt>, exec)` → `true`. The name and `google_synced_at` are written and `updated_at` is unchanged. Under `TZ=Asia/Bangkok` this fails if the bind is a raw `Date`; it passes only with the `toISOString()::timestamp` form.
    - Then run `UPDATE place SET updated_at = now() WHERE id = 'p-30'` and `writeRefreshPatch('p-30', { name:'N' }, <the updatedAt selected before>, exec)` → `false`, and the name is unchanged.
- [ ] **Step 3:** `pnpm vitest run src/lib/services/google-sync-service` and `TZ=Asia/Bangkok TEST_DATABASE_URL=… pnpm vitest run src/lib/services/google-sync-service` → FAIL.
- [ ] **Step 4: Implement.**
  - **`selectResyncCandidates`** uses Drizzle:
    - Join `places ⋈ days (days.id = places.dayId) ⋈ trips (trips.id = days.tripId)`.
    - Filters from Global Constraints:
      - `strpos(place_id_external, ':') = 0 AND place_id_external <> ''`
      - `google_status IS NULL OR google_status NOT IN ('NOT_FOUND','INVALID')`
      - `isNull(places.deletedAt)`, `isNull(trips.deletedAt)`
      - `trips.endDate >= today`
      - `google_synced_at IS NULL OR google_synced_at < cutoff`
    - `.orderBy(sql\`${trips.startDate} asc nulls last\`, sql\`${places.googleSyncedAt} asc nulls first\`, asc(places.id))`, then `.limit(limit)`.
    - Bind the 25-day `cutoff` with the same `toISOString()::timestamp` form, or through a Drizzle comparison operator (`lt(places.googleSyncedAt, cutoff)` maps the value), never as a raw `Date` inside `sql`.
  - **`writeRefreshPatch`** = `.update(places).set(patch).where(and(eq(places.id, id), sql\`date_trunc('milliseconds', ${places.updatedAt}) = ${rowUpdatedAt.toISOString()}::timestamp\`)).returning({ id: places.id })` → `rows.length === 1`. Use the string plus cast, not a raw `Date` (Global Constraints, lost update guard).
  - **`refreshPlaceFromGoogle`** runs in exactly this order:
    1. `resolvePlaceWrite(userId, placeId, exec)` (throws `forbidden` for non-writers).
    2. `allow ?? allowPlacesRequest`. `false` → `'limit'`. This is the per-user limit, checked before the `gplaces:refresh:manual` bucket.
    3. `load(placeId)` (default: the same columns as `selectResyncCandidates`, by id, place not deleted). `null` → `'error'`.
    4. Status short-circuit: `googleStatus === 'NOT_FOUND'` → `'not_found'`, `'INVALID'` → `'invalid'`, returned without consume, fetch or write.
    5. `refreshOne(row, { ...deps, source:'manual' })`.
- [ ] **Step 5:** Run both (the integration run with `TZ=Asia/Bangkok`) → PASS. `pnpm typecheck 2>&1 | tail -3`.
- [ ] **Step 6:** Commit `feat(places): Google refresh service with budget, breaker and candidate selection [TP-0049]`.

### Task 4: Cron route, "Update from Google" button, status badge

**Files:**
- Create `app/src/app/api/internal/google-resync/route.ts` + `route.test.ts` and `app/src/components/google-refresh-button.tsx`.
- Modify `app/vercel.json`, `app/src/app/actions/places.ts`, `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx`, `app/src/components/place-row.tsx`, `app/src/components/itinerary-list.module.css`.

**Produces:**
```ts
// actions/places.ts
export async function refreshPlaceFromGoogleAction(prev: { outcome: RefreshOutcome | null }, formData: FormData): Promise<{ outcome: RefreshOutcome }>;
// google-refresh-button.tsx ('use client')
export function GoogleRefreshButton({ placeId, tripId }: { placeId: string; tripId: string }): JSX.Element;
```

- [ ] **Step 1: Failing route test.** Copy `purge-google-volatile/route.test.ts`: `vi.mock('@/lib/services/google-sync-service', () => ({ runGoogleResync: vi.fn(async () => ({ refreshed:1, notFound:0, invalid:0, skipped:0, failed:0, stopped:null })) }))`, `vi.stubEnv('CRON_SECRET', …)`. Cases:
  - `CRON_SECRET` unset → 401;
  - wrong bearer → 401, service not called;
  - right bearer → 200 with the mocked `runGoogleResync` result as JSON, called once.
- [ ] **Step 2:** Run → FAIL. Implement the route as a copy of `purge-google-volatile/route.ts`:
  - same guard, `dynamic = 'force-dynamic'`;
  - add `export const maxDuration = 300`, the Hobby maximum (neither existing cron route sets it);
  - call `runGoogleResync()`. Rows stay sequential: 20 × 3 s timeout in the worst case.

  Run → PASS.
- [ ] **Step 3: `vercel.json`.** Append `{ "path": "/api/internal/google-resync", "schedule": "0 19 * * *" }` to `crons`, after `prune-rate-limit` (`17 4 * * *`) and `purge-google-volatile` (`0 20 * * *`).
  - 19:00 UTC = 02:00 Asia/Bangkok, when few edit forms are open.
  - The plan is Hobby (100 crons per project), so a third cron is fine.
  - Hobby fires each cron anywhere within its hour, so this runs 02:00–02:59 and the purge runs 03:00–03:59 Bangkok. **No ordering is assumed:** refresh-then-purge and purge-then-refresh give the same result, because the merge treats expired-but-unpurged and purged groups the same way (Task 2 rows 11–12).
- [ ] **Step 4: Button.**
  - **Action** (`actions/places.ts`; `requireUserId` from `@/lib/with-trip-auth`, `revalidatePath` from `next/cache`, both already imported):
    - Read `placeId` and `tripId` from the form, then `outcome = await refreshPlaceFromGoogle(userId, placeId)`.
    - On `'ok'`, `'not_found'` or `'invalid'`, call `revalidatePath(`/trip/${tripId}`)`.
    - Return `{ outcome }`.
  - **Component:**
    - `useActionState`. The button reads "Update from Google" ("Updating…" while pending), with the helper text "Unsaved changes on this page will be lost."
    - Result line per outcome:
      - `ok`: "Updated from Google."
      - `not_found`: "Google no longer lists this place."
      - `invalid`: "Google can't look up this place. Pick it again from search."
      - `skipped`: "This place changed while updating. Try again."
      - `limit`: "Daily Google update limit reached. Try again tomorrow."
      - `unavailable` / `error`: "Couldn't reach Google. Try again later."
    - On `ok`, call `router.refresh()`.
  - **Edit page:** the page currently returns `<PlaceForm …/>` directly (L44–71).
    - Wrap it in a fragment and render `GoogleRefreshButton` above it only when `MAPS_CONFIG.googlePlaces && isGooglePlaceId(p.placeIdExternal) && p.googleStatus !== 'NOT_FOUND' && p.googleStatus !== 'INVALID'`.
    - Imports: `MAPS_CONFIG` from `@/lib/maps/config`, `isGooglePlaceId` from `@/lib/places/place-id`.
    - Give `PlaceForm` `key={String(p.googleSyncedAt?.getTime() ?? 0)}` so its uncontrolled inputs remount with refreshed values. The `formBase` hidden field is recomputed on the same render.
- [ ] **Step 5: Badge.**
  - In `place-row.tsx`, add `googleStatus?: GoogleStatus | null` to the `Props['place']` type (L9–30).
  - In `.placeMeta` (L98), after the kind chip and before the rating (L102), render `<span className={styles.statusBadge}>{label}</span>` when `statusBadgeLabel(place.googleStatus)` is non-null.
  - In `itinerary-list.module.css`, make `.statusBadge` a small pill using the existing `--danger` / `--warning` tokens (`globals.css` L41–44 light, L96–99 dark). Add no new colours.
  - No pass-through change is needed: `loadTrip` (`lib/trip-queries.ts`) selects full `places` rows via `visibleVolatile`, and `sortable-place-item.tsx` passes that `Place` (`typeof places.$inferSelect`) to `PlaceRow` unchanged.
- [ ] **Step 6:** `pnpm test 2>&1 | tail -3`, `pnpm typecheck 2>&1 | tail -3` and `pnpm lint 2>&1 | tail -3` → clean.
- [ ] **Step 7: Browser check, fake mode.**
  - **Setup:** run `MAPS_PROVIDER=google GOOGLE_PLACES_FAKE=1 pnpm dev` (port 3210). `app/.env` must set `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID` (required even in fake mode; with a dummy key the map degrades to MapLibre via the TP-0048 auth-failure fallback) and `CRON_SECRET`.
  - **Add and edit:** on a trip whose `end_date` ≥ today, add "Jay Fai" through the day picker. The fake serves the live "Raan Jay Fai" (`ChIJaxq89xaZ4jARQtKhE1uqq9c`) with a full pick. On the edit page, rename it "My Jay Fai" and save.
  - **Simulate a Google-side change:** `UPDATE place SET address = 'Old Rd', google_snapshot = jsonb_set(google_snapshot, '{address}', '"Old Rd"'), hours = 'Old hours', google_synced_at = now() - interval '26 days' WHERE id = '…'`. This simulates Google changing the address and hours since the pick.
  - **Cron:** `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3210/api/internal/google-resync` → `{"refreshed":1,"notFound":0,"invalid":0,"skipped":0,"failed":0,"stopped":null}`.
  - **Verify the cron:** the itinerary name is still "My Jay Fai", with the refresh fixture's rating. The edit page shows the fixture's `formattedAddress` and its `weekdayDescriptions` hours, and `place_id_external` is unchanged.
  - **Button:** the edit page button → "Updated from Google.", and the form shows the refreshed values.
  - **Badge:** `UPDATE place SET place_id_external = 'ChIJfakeClosed0001', google_synced_at = now() - interval '26 days' WHERE id = '…'` → cron curl → `"refreshed":1`. The itinerary shows the "Temporarily closed" badge.
  - **Not found:** `UPDATE place SET place_id_external = 'ChIJfakeGone0001' WHERE id = '…'` → button → "Google no longer lists this place." After a reload the button is hidden, and the cron no longer selects the place.
  - **Invalid:** `UPDATE place SET place_id_external = 'ChIJfakeBad0001', google_status = NULL, google_synced_at = NULL WHERE id = '…'` → cron curl → `"invalid":1`. The row has `google_status = 'INVALID'` and `google_synced_at` set, and a second curl does not select it.
  - **Open mode** (`MAPS_PROVIDER` unset): no button. The cron curl → `{"refreshed":0,"notFound":0,"invalid":0,"skipped":0,"failed":0,"stopped":"disabled"}`, and the purge cron still works.
- [ ] **Step 8:** Commit `feat(places): daily Google resync cron, Update from Google button, closed badge [TP-0049]`.

### Task 5: Docs and env

**Files:** `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`. Re-check only: `API.md`, `agent-skill/travel-planner-api/SKILL.md`.

- [ ] **`.env.example`:** after `GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP` (L109), add:
  - `GOOGLE_PLACES_REFRESH_DAILY_CAP="20"`, commented "Place Details Enterprise for the resync cron; 1k/month free shared with the button";
  - `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP="5"`, commented "Update from Google button".
- [ ] **`maps-cost-guardrails.md`:**
  - In the Services table Google Places row (L26), add the refresh caps (Details Enterprise, cron 20/day + button 5/day; the console quota stays 135).
  - Add the `gplaces:refresh` / `gplaces:refresh:manual` buckets and "a cron run stops on its own first 403/429/timeout (breaker state is per instance)" to "Guardrails in code".
  - Replace the "Refreshing from Google … arrives in Stage C." sentence (L110–111) with the live behaviour: `/api/internal/google-resync`, `0 19 * * *` UTC.
- [ ] **`google-maps-setup.md`:**
  - §7 already says 135 (30 + 80 + 20 + 5). Reword its "Stage C" phrases to describe the 20 + 5 as live, and drop "ก่อนมี Stage C cap ในแอปรวม 110 จะหยุดก่อน".
  - Add both refresh caps to the §7 per-minute note (L106) and to §9.3.
  - Add a §10.4 curl for `GOOGLE_REFRESH_MASK` with no `sessionToken` (the Task 1 Step 1 command with `$K`).
- [ ] **`API.md` (L235), `SKILL.md` (L205):** both already list `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`, `NOT_FOUND`, `INVALID` or `null`. Re-check the wording, and add "refreshed daily for upcoming trips in Google mode" if it fits.
- [ ] **`ARCHITECTURE.md` (L95–103 cron paragraph):** add a third cron, `/api/internal/google-resync` (`0 19 * * *` UTC, same bearer, only in Google mode).
- [ ] **`AGENTS-INDEX.md`:** add a route row after `purge-google-volatile` (L96). Extend the `google-sync.ts` (L302) row with `mergeGoogleRefresh` / `statusBadgeLabel`, and the `google-sync-service.ts` (L303) row with the refresh exports. Add `components/google-refresh-button.tsx`.
- [ ] `pnpm build 2>&1 | tail -3` → success.
- [ ] Commit `docs(maps): Google resync cron, refresh budget [TP-0049]`, then open a PR against `main`. The PR note: active in production wherever `MAPS_PROVIDER=google` is set; the cron returns `stopped:'disabled'` otherwise.

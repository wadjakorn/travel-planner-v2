# Maps Google resync — Stage C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Google-sourced places of upcoming and in-progress trips in step with Google — name, address, coords, phone, website, rating, reviews, opening hours and business status — through a daily cron and an "Update from Google" button on the place edit page, without ever overwriting what the user edited. Everything is checkable in fake mode without a key.

**Architecture:**
- `lib/places/google.ts` gets one more call, `googleRefreshDetails`, with a fixed Enterprise mask and no session token.
- `lib/places/google-sync.ts` (Stage A Task 5b) gets the pure merge, `mergeGoogleRefresh(row, google, now)`, and the badge label helper.
- `lib/services/google-sync-service.ts` (Stage A Task 5b) gets candidate selection, the per-row refresh, the cron loop and the button entry point. The loop takes `select` / `write` / `consume` / `fetchImpl` as injected deps, so it is unit-tested without a DB.
- The cron `/api/internal/google-resync` and the button use **separate** budget buckets (`gplaces:refresh` 20/day, `gplaces:refresh:manual` 5/day), so the cron can never starve the button.
- They reuse the Stage A breaker *state* in `search.ts`. That state is in memory, **per instance**: in production the cron usually runs on its own instance, so it is not shared with search or the button across routes/invocations. What protects the cron is that each run stops on its own first 403/429/timeout.

**Tech Stack:** as Stage A — Next.js 16.2.4 App Router, TypeScript, vitest 3 (`src/**/*.test.ts`, node env), `*.integration.test.ts` gated on `TEST_DATABASE_URL` (skipped in CI; run locally on a scratch DB before the PR).

**Spec:** [resync design](../specs/2026-10-23-google-place-resync-design.md) §4. **Depends on:** [Stage A](2026-10-23-maps-google-switch-stage-a.md) (incl. Task 5b) merged; Stage B (Google renderer, live fixtures, `MAPS_PROVIDER=google` in prod) merged before this is **useful**. Stage C may be built and merged before B goes live: every Google path is gated on `MAPS_CONFIG.googlePlaces`, which Stage A forces off in production until B removes the gate.

## Global Constraints

- **No new migration.** All columns (`rating_synced_at`, `hours_synced_at`, `google_synced_at`, `google_snapshot`, `google_status`) come from Stage A Task 5b.
- **Gate:** the cron and the button do nothing when `!MAPS_CONFIG.googlePlaces` (cron returns `stopped:'disabled'` without querying; the button is not rendered). The Stage A purge cron is untouched and keeps running in both modes.
- **Refresh call:** `GET https://places.googleapis.com/v1/places/{id}?languageCode=<lang>`, **no `sessionToken`**, `cache:'no-store'`, timeout **3000 ms**, header `X-Goog-FieldMask` exactly `GOOGLE_REFRESH_MASK` = `id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount` → **Place Details Enterprise** ($20/1k, 1,000/month free). No Atmosphere field (`reviews`, `editorialSummary`, …) may enter this mask.
  - `lang = queryLang(row.googleSnapshot?.name ?? row.name)` so a Thai-named place stays Thai.
  - The id goes through `isValidGoogleId` (Stage A) before any consume or fetch.
- **Budget:** two buckets, fixed 86400 s windows, each consumed **exactly once** per Google call after validation:
  - cron: `gplaces:refresh`, `GOOGLE_PLACES_REFRESH_DAILY_CAP` default **20**
  - button: `gplaces:refresh:manual`, `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP` default **5** (on top of the existing per-user `allowPlacesRequest` limit)
  - Both: any positive integer, otherwise the default. Same Stage A rules: the limiter **fails open** if it throws; **fake mode skips it**. Console Place Details/day quota = **135** (30 + 80 + 20 + 5).
- **Breaker:** the Stage A breaker state (per instance, in memory — see Architecture). An open breaker means no consume and no fetch. `GoogleHttpError` status `0`, `403` or `429` trips it (10 min) and **stops the cron run**; the button reports "unavailable".
- **Failure classes:**
  - `404` → `google_status = 'NOT_FOUND'`, data kept, row never selected again.
  - **Deterministic** — bare id failing `isValidGoogleId`, Google `400`, or a 200 without `location` (`googleRefreshDetails` → `null`) → write `{ googleStatus:'INVALID', googleSyncedAt: now }`, data kept, row never selected again (a new pick that changes the id resets the status to null, Stage A update rule).
  - **Transient** — `0`/`403`/`429` (breaker) and `5xx` / any other non-2xx or throw → **no write**; the row is retried the next day.
- **Candidates:** Google id (bare, non-empty), place and trip not soft-deleted, `google_status` null or not in (`NOT_FOUND`, `INVALID`), `trip.end_date >= today` (`today = now.toISOString().slice(0, 10)`, UTC; `end_date` is ISO text), `google_synced_at` null or `< now − 25 days` (null includes rows just picked with a `basic` pick — Stage A writes their snapshot with `googleSyncedAt: null` so the next run fetches the full data); order **`trip.start_date ASC NULLS LAST, google_synced_at ASC NULLS FIRST, place.id ASC`** (the soonest trips get the cap first); limit = cron cap. Undated trips (`end_date` null) are **not** refreshed (design §4.1 as written).
- **Merge** (design §4.3) is one pure function, `mergeGoogleRefresh`. The writer applies its patch as is. Cron writes never touch `updated_at` and never call `touchTrip` (a background refresh is not a user edit).
- **Lost update guard:** `writeRefreshPatch` is conditional — `UPDATE place SET … WHERE id = $1 AND date_trunc('milliseconds', updated_at) = $2::timestamp`, with `$2 = rowUpdatedAt.toISOString()` (the candidate's `updatedAt` as read). `date_trunc` because `defaultNow()` stores microseconds and a JS `Date` holds ms. **The parameter must be the ISO string with an explicit `::timestamp` cast, never a raw `Date`:** inside a `sql` template Drizzle does not run the column's `mapToDriverValue`, and it disables postgres-js's date serializers, while neon-http formats a `Date` in the process's local time zone with an offset; compared with the `timestamp` (no tz) column, that misses by the offset — 7 h on the Asia/Bangkok dev box — so every write would silently be `'skipped'`. `updated_at` is `timestamp without time zone` holding UTC wall time; casting the `…Z` string to `::timestamp` drops the `Z` and compares like for like. User edits bump `updated_at`, cron writes don't, so a user save between select and write makes it a no-op → outcome `'skipped'` (budget already spent; the row is retried next day because `google_synced_at` did not move). The other direction — an edit form opened before the refresh and saved after it — is handled in Stage A by `formBase` (units the user did not change are left out of the user's `UPDATE … SET`, so they keep the refreshed values).
- **UI language:** `place-row.tsx` and `place-form.tsx` are hard-coded English (no dict reaches them), so new copy is English: "Closed permanently", "Temporarily closed", "Update from Google".
- **Fake mode:** `GOOGLE_PLACES_FAKE=1` (non-production only, Stage A rule) serves a refresh fixture, so the cron, the button and the badge are browser-checkable without a key.

## Review Focus

1. **User edits survive a refresh.** Edited name, address, phone, website, a dragged pin, user-typed rating or hours are never overwritten; unedited ones follow Google. → Task 2 merge table.
2. **The cron stops on trouble and never exceeds its budget.** The run stops on its **own** first 403/429/timeout (a 403 on row 3 stops it with 2 refreshed and no 4th fetch); a denied consume stops it; an open breaker (same instance) means zero consumes. The breaker is **not** claimed to be shared across routes or invocations in production. The button has its own 5/day bucket, so the cron cannot starve it. → Task 3 `runGoogleResync` tests.
3. **Candidate selection.** Ended, undated or deleted trips, deleted places, non-Google ids, `NOT_FOUND`, `INVALID`, and rows synced < 25 days ago are excluded; soonest `start_date` first, then nulls first; the cron cap is the limit. → Task 3 integration test.
3b. **No lost update, no clogged queue.** A user save between select and write makes the cron write a no-op (`'skipped'`), and an unchanged row is still written when the process runs in a non-UTC zone (`::timestamp`-cast ISO bind, tested under `TZ=Asia/Bangkok`); deterministic failures (bad id, 400, no `location`) are marked `INVALID` once instead of being retried forever; transient ones write nothing. → Task 3 tests.
4. **Billing tier.** The refresh mask is Enterprise (not E+A) and carries no session token; fake mode spends no budget. → Task 1 mask/URL tests.
5. **`NOT_FOUND` / `INVALID` and status.** A 404 writes only `google_status`; `INVALID` writes the status and `google_synced_at`; both keep the data, hide the button and never refetch; `CLOSED_*` shows the badge in the itinerary. → Task 2 rows 15/15b, Task 3, Task 4.

---

## File map

| File | Change |
|---|---|
| `app/src/lib/maps/config.ts` (+test) | `caps.refresh` from `GOOGLE_PLACES_REFRESH_DAILY_CAP`, `caps.refreshManual` from `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP` |
| `app/src/lib/places/search.ts` (+test) | **Export** the breaker: `googleBreakerOpen`, `noteGoogleFailure` |
| `app/src/lib/places/google.ts` (+test), `google-fake.ts`, `__fixtures__/google-details-refresh.json`, `__fixtures__/google.md` | `GOOGLE_REFRESH_MASK`, `googleRefreshDetails`, fake routing |
| `app/src/lib/places/google-sync.ts` (+test) | `GoogleRefresh`, `MergeRow`, `RefreshPatch`, `mergeGoogleRefresh`, `statusBadgeLabel` |
| `app/src/lib/services/google-sync-service.ts` (+`.test.ts`, +integration test) | `selectResyncCandidates`, `writeRefreshPatch`, `refreshOne`, `runGoogleResync`, `refreshPlaceFromGoogle` |
| `app/src/app/api/internal/google-resync/route.ts` (+test), `app/vercel.json` | **Create.** Daily cron |
| `app/src/app/actions/places.ts`, `app/src/components/google-refresh-button.tsx`, `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx` | Button |
| `app/src/components/place-row.tsx`, `app/src/components/itinerary-list.module.css` | Status badge |
| `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `API.md`, `agent-skill/travel-planner-api/SKILL.md` | Docs |

## Task 0: Ticket and worktree

- [ ] Create a `pm` ticket "Maps: Google resync stage C" and note `TP-XXXX`.
- [ ] `git fetch origin && git worktree add ../travel-planner-v2-maps-resync -b feat/maps-google-resync origin/main` (Stage A merged; check `rg -n "visibleVolatile" app/src` hits). `cd ../travel-planner-v2-maps-resync/app && pnpm install && pnpm test 2>&1 | tail -3` → all pass.

### Task 1: Refresh caps, breaker export, refresh client and fixture

**Files:** Modify `lib/maps/config.ts` (+test), `lib/places/search.ts` (+`search.test.ts`), `lib/places/google.ts` (+`google.test.ts`), `lib/places/google-fake.ts`, `__fixtures__/google.md`. Create `__fixtures__/google-details-refresh.json`.

**Consumes:** `MapsConfig`, `readMapsConfig` (Stage A Task 1); `GoogleHttpError`, `isValidGoogleId`, `fakeGoogleFetch` (Task 2); `trippedUntil` logic and `__resetGoogleState` in `search.ts` (Task 3); `GoogleStatus` (Task 5b).

**Produces:**
```ts
// config.ts
MapsConfig['google']['caps']: { full: number; basic: number; autocomplete: number; refresh: number; refreshManual: number };
// search.ts — Stage A keeps trippedUntil private; this task exports the breaker (behaviour unchanged)
export function googleBreakerOpen(now: number): boolean;                 // now < trippedUntil
export function noteGoogleFailure(err: unknown, now: number): boolean;   // GoogleHttpError 0/403/429 → trippedUntil = now + 600_000, returns true
// google.ts
export const GOOGLE_REFRESH_MASK: string;
export type GoogleRefresh = { id: string; name: string; address: string | null; lat: number; lng: number; phone: string | null;
  website: string | null; hours: string | null; rating: number | null; reviews: number | null;
  businessStatus: Exclude<GoogleStatus, 'NOT_FOUND' | 'INVALID'> | null };   // only Google's own values; NOT_FOUND / INVALID are ours
export function googleRefreshDetails(id: string, o: { key: string; lang: 'th'|'en'; fetchImpl: typeof fetch; timeoutMs?: number }): Promise<GoogleRefresh | null>;
```

- [ ] **Step 1: Fixture.** `google-details-refresh.json`: `id:"ChIJfakeJayFai0001"`, `displayName.text:"Jay Fai (Raan Jay Fai)"`, `formattedAddress:"327 Maha Chai Rd, Bangkok 10200"`, `location:{latitude:13.7525, longitude:100.5046}`, `businessStatus:"CLOSED_TEMPORARILY"`, a new `nationalPhoneNumber`, the same `websiteUri`, 7 new `weekdayDescriptions`, `rating:4.5`, `userRatingCount:1300`. `google.md`: add it ("hand-written; replace with a live capture using the §10 curl with `GOOGLE_REFRESH_MASK` once Stage B keys exist").
- [ ] **Step 2: Failing tests.**
  - **config:** unset → `caps.refresh === 20`; `'5'` → `5`; `'0'`, `'abc'`, `'2.5'` → `20`. `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP` unset → `caps.refreshManual === 5`; `'3'` → `3`; `'0'` → `5`. Existing cap tests unchanged.
  - **breaker (`search.test.ts`, `beforeEach(__resetGoogleState)`):** `noteGoogleFailure(new GoogleHttpError(403), t)` → `true`, `googleBreakerOpen(t + 599_999)` → `true`, `googleBreakerOpen(t + 600_000)` → `false`; `GoogleHttpError(0)` and `(429)` → `true`; `GoogleHttpError(404)`, `(500)`, `new Error('x')` → `false` and the breaker stays closed. After `noteGoogleFailure(403)`, `searchPlaces` with `gcfg` at `t + 1 min` does not call Google (proves search and the export share state **within one instance**). All Stage A search tests pass unchanged.
  - **`googleRefreshDetails`:**
    - It GETs `https://places.googleapis.com/v1/places/ChIJabc?languageCode=th` — **no** `sessionToken` param — with `X-Goog-Api-Key: K`, `X-Goog-FieldMask === GOOGLE_REFRESH_MASK`, `cache:'no-store'`.
    - `GOOGLE_REFRESH_MASK === 'id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount'`.
    - The refresh fixture parses to `{ id:'ChIJfakeJayFai0001', name:'Jay Fai (Raan Jay Fai)', lat:13.7525, lng:100.5046, businessStatus:'CLOSED_TEMPORARILY', rating:4.5, reviews:1300, hours: <weekdayDescriptions.join('; ')>, … }`.
    - `businessStatus:'SOMETHING_NEW'` or missing → `businessStatus:null`. Missing `displayName` → `name:''`. Missing `location` → `null`.
    - 400 rejects `GoogleHttpError` status 400; 404 rejects `GoogleHttpError` status 404; a network error or real 1 ms timeout rejects status 0 (same technique as Stage A Task 2).
  - **fake:** a request whose `X-Goog-FieldMask` equals `GOOGLE_REFRESH_MASK` gets the refresh fixture; other details requests still get `google-details-full.json`; any `/v1/places/ChIJfakeGone…` id → 404 with body `{"error":{"code":404,"status":"NOT_FOUND"}}`; any `/v1/places/ChIJfakeBad…` id → 400 with body `{"error":{"code":400,"status":"INVALID_ARGUMENT"}}`.
- [ ] **Step 3:** `pnpm vitest run src/lib/maps src/lib/places` → FAIL.
- [ ] **Step 4:** Implement. In `search.ts`, replace the inline trip logic in `tryGoogle` and `getPlaceDetail` with the two exports (no behaviour change). `googleRefreshDetails` reuses `googleDetails`' error handling and hours formatting; extract a shared private helper if it avoids duplication.
- [ ] **Step 5:** Run → PASS; `pnpm typecheck 2>&1 | tail -3` clean.
- [ ] **Step 6:** Commit `feat(places): Google refresh details call, refresh caps, breaker export [TP-XXXX]`.

### Task 2: `mergeGoogleRefresh` (pure)

**Files:** Modify `lib/places/google-sync.ts`, `google-sync.test.ts`.

**Consumes:** `StoredSync`, `SyncColumns`, `GoogleSnapshot`, `GoogleStatus` (Task 5b); `GoogleRefresh`, `isValidGoogleId` (Task 1 / Stage A).

**Produces:**
```ts
export type MergeRow = StoredSync & { name: string; address: string | null; lat: number | null; lng: number | null;
  phone: string | null; website: string | null };
export type RefreshPatch = Partial<Pick<MergeRow, 'name'|'address'|'lat'|'lng'|'phone'|'website'|'hours'|'rating'|'reviews'|'placeIdExternal'> & SyncColumns>;
export function mergeGoogleRefresh(row: MergeRow, google: GoogleRefresh | 'NOT_FOUND' | 'INVALID', now: Date): RefreshPatch;
export function statusBadgeLabel(s: GoogleStatus | null | undefined): 'Closed permanently' | 'Temporarily closed' | null;
```
A field key is in the patch **iff** the rules decide to write it. `googleSnapshot` and `googleSyncedAt` are always written on success.

- [ ] **Step 1: Failing tests** (`now = 2026-10-23T00:00Z`, `D` = 1 day). Base row **R**: `name:'Jay Fai'`, `address:'Old Rd'`, `lat:13.7524`, `lng:100.5045`, `phone:'02-1'`, `website:'https://a'`, `hours:'H1'`, `rating:4.4`, `reviews:1234`, `ratingSyncedAt: now−20D`, `hoursSyncedAt: now−20D`, `placeIdExternal:'ChIJa'`, `googleSnapshot:{ name:'Jay Fai', address:'Old Rd', lat:13.7524, lng:100.5045, phone:'02-1', website:'https://a' }`, `googleSyncedAt: now−26D`, `googleStatus:'OPERATIONAL'`. Google **G**: `id:'ChIJa'`, `name:'Jay Fai 2'`, `address:'New Rd'`, `lat:13.7525`, `lng:100.5046`, `phone:'02-2'`, `website:'https://b'`, `hours:'H2'`, `rating:4.5`, `reviews:1300`, `businessStatus:'CLOSED_TEMPORARILY'`.

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

  Plus: R is not mutated; idempotent — with `R1 = { ...R, ...merge(R, G, now) }`, `{ ...R1, ...merge(R1, G, now + 1D) }` equals `R1` except the three `*SyncedAt` timestamps. `statusBadgeLabel`: `CLOSED_PERMANENTLY` → `'Closed permanently'`, `CLOSED_TEMPORARILY` → `'Temporarily closed'`, `OPERATIONAL` / `NOT_FOUND` / `INVALID` / `null` / `undefined` → `null`.
- [ ] **Step 2:** `pnpm vitest run src/lib/places/google-sync` → FAIL.
- [ ] **Step 3:** Implement per design §4.3. "Empty" = `null` or `''`. A snapshot key that is `undefined` (row 5) is treated like no snapshot for that field. Lat/lng are one unit. Groups iterate `VOLATILE_GROUPS`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(places): merge rules for Google refresh that keep user edits [TP-XXXX]`.

### Task 3: Refresh service — candidates, per-row refresh, cron loop

**Files:** Modify `lib/services/google-sync-service.ts`. Create `google-sync-service.test.ts` (unit, deps injected); extend `google-sync-service.integration.test.ts` (gated).

**Consumes:** Task 1–2 exports; `Consume` (`lib/places/rate-limit.ts`, exported in Stage A); `allowPlacesRequest`; `resolvePlaceWrite` (`services/access.ts`); `queryLang`; `MAPS_CONFIG`; `IdemExecutor`.

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

**`refreshOne` order** (`W(x)` = `write(id, mergeGoogleRefresh(row, x, now), row.updatedAt)`; a `false` return turns the outcome into `'skipped'`):
`!cfg.googlePlaces` → `'unavailable'` · prefixed/empty id (not `isGooglePlaceId`) → `'error'`, no consume, no write · bare id failing `isValidGoogleId` → `W('INVALID')` → `'invalid'` (no consume) · `googleBreakerOpen(now)` → `'unavailable'` (no consume) · consume (`source` cron: `('gplaces:refresh', caps.refresh, 86400)`; manual: `('gplaces:refresh:manual', caps.refreshManual, 86400)`) unless fake (throw → continue; `!ok` → `'limit'`) · `googleRefreshDetails` with `cfg.google.fake ? fakeGoogleFetch() : fetchImpl` · `null` (no `location`) → `W('INVALID')` → `'invalid'` · 404 → `W('NOT_FOUND')` → `'not_found'` · 400 → `W('INVALID')` → `'invalid'` · `noteGoogleFailure(e) === true` → `'unavailable'` (no write) · other error (5xx, other non-2xx, throw) → `'error'` (no write) · success → `W(g)` → `'ok'`.
`runGoogleResync` runs rows **sequentially**, counts `ok`→`refreshed`, `not_found`→`notFound`, `invalid`→`invalid`, `skipped`→`skipped`, `error`→`failed`, and stops on `'unavailable'` (`stopped:'breaker'`) or `'limit'` (`stopped:'budget'`).

- [ ] **Step 1: Failing unit tests** (`google-sync-service.test.ts`; `gcfg` as in Stage A with `NODE_ENV:'test'`; `select`, `write`, `consume`, `fetchImpl`, `now` all injected; `beforeEach(__resetGoogleState)`):
  - open config → deep-equals `{ refreshed:0, notFound:0, invalid:0, skipped:0, failed:0, stopped:'disabled' }` (the same object the Task 4 Step 7 browser check expects), `select` never called.
  - 3 candidates, all 200 → `{ refreshed:3, notFound:0, invalid:0, skipped:0, failed:0, stopped:null }`; `select` called with `(now, 20)`; `consume` called 3× with `('gplaces:refresh', 20, 86400)`; `write` called 3× with the `mergeGoogleRefresh` result and the row's `updatedAt`.
  - row 2 answers 403 → `{ refreshed:1, stopped:'breaker' }`, **no** fetch for row 3, and a following `searchPlaces` with `gcfg` skips Google.
  - row 1 times out (`GoogleHttpError(0)`) → `stopped:'breaker'`, `refreshed:0`.
  - row 2's consume returns `{ ok:false }` → `{ refreshed:1, stopped:'budget' }`, no fetch for rows 2–3.
  - breaker already open (`noteGoogleFailure(403, now)` first) → `stopped:'breaker'`, `consume` never called.
  - row 1 → 404, row 2 → 500, row 3 → 200 → `{ refreshed:1, notFound:1, invalid:0, skipped:0, failed:1, stopped:null }`; row 1's write is exactly `{ googleStatus:'NOT_FOUND' }`; row 2 not written.
  - **deterministic failures:** row 1 → 400, row 2 → 200 without `location`, row 3 has bare id `'a/b'` → `{ invalid:3, failed:0, stopped:null }`; each write is exactly `{ googleStatus:'INVALID', googleSyncedAt: now }`; `consume` called 2× (not for row 3); `fetchImpl` called 2×.
  - **transient failures write nothing:** rows answering 500, 503 and a network error (`GoogleHttpError(0)`, row 3) → `write` never called for them.
  - **lost update:** `write` returns `false` for row 1 → `{ refreshed:2, skipped:1 }`, the run continues.
  - **manual source:** `refreshOne(row, { source:'manual', … })` consumes `('gplaces:refresh:manual', 5, 86400)`; the default source consumes `gplaces:refresh`.
  - `consume` throws → Google still called (fail open).
  - fake config (`fake:true`) → `consume` never called; fetch served by the fixture; `write` gets `googleStatus:'CLOSED_TEMPORARILY'`.
  - language: a row whose snapshot name is `'ร้านเจ๊ไฝ'` requests `languageCode=th`; `'Jay Fai'` → `en`.
  - **`refreshPlaceFromGoogle`** (`load`, `allow` injected; `resolvePlaceWrite` mocked): `allow` false → `'limit'`, no fetch; `load` returns `null` → `'error'`, no consume, no fetch; loaded row `googleStatus:'NOT_FOUND'` → `'not_found'`, no fetch; loaded row `googleStatus:'INVALID'` → `'invalid'`, no fetch; non-Google id → `'error'`; happy path → `'ok'`, one write, consume on `gplaces:refresh:manual`.
- [ ] **Step 2: Failing integration tests** (append to the Task 5b file; same gate; run with a **non-UTC** zone, `TZ=Asia/Bangkok`, so a raw-`Date` bind would fail). Seed with `now = 2026-10-23T00:00Z`: trips `T1` (`end_date '2026-10-23'`), `T2` (`'2026-10-22'`), `T3` (`end_date` null), `T4` (`'2026-12-01'`, `deleted_at` set). On `T1`: `p-null` (synced null), `p-30` (`now−30d`), `p-26` (`now−26d`), `p-24` (`now−24d`), `p-nf` (`google_status 'NOT_FOUND'`, synced null), `p-geo` (`'geoapify:x'`), `p-del` (`deleted_at` set). One synced-null Google place each on `T2`, `T3`, `T4`.
  - `T1` has `start_date '2026-10-20'`. Add `T5` (`start_date '2026-11-01'`, `end_date '2026-11-05'`) with `p-later` (synced null), and on `T1` `p-inv` (`google_status 'INVALID'`, synced null).
  - `selectResyncCandidates(now, 10, exec)` → ids `[p-null, p-30, p-26, p-later]` in that order (the earlier trip first, even though `p-later` is never synced; `p-inv` excluded).
  - `selectResyncCandidates(now, 2, exec)` → `[p-null, p-30]`.
  - Returned rows carry every `MergeRow` column plus `updatedAt` (`googleSnapshot` parsed as an object).
  - `p-26` seeded with `updated_at = '2026-10-20 10:00:00.123456'` (microseconds). `writeRefreshPatch('p-26', { name:'N', googleSyncedAt: now }, <its selected updatedAt>, exec)` → `true`; name and `google_synced_at` written; `updated_at` unchanged. (Under `TZ=Asia/Bangkok` this fails if the bind is a raw `Date`; it passes only with the `toISOString()::timestamp` form.)
  - Then `UPDATE place SET updated_at = now() WHERE id = 'p-30'` and `writeRefreshPatch('p-30', { name:'N' }, <the updatedAt selected before>, exec)` → `false`; name unchanged.
- [ ] **Step 3:** `pnpm vitest run src/lib/services/google-sync-service` (and `TZ=Asia/Bangkok TEST_DATABASE_URL=… pnpm vitest run src/lib/services/google-sync-service`) → FAIL.
- [ ] **Step 4:** Implement. `selectResyncCandidates` uses Drizzle: `place ⋈ day ⋈ trip`, the filters in Global Constraints (`strpos(place_id_external, ':') = 0 AND place_id_external <> ''`, `google_status IS NULL OR google_status NOT IN ('NOT_FOUND','INVALID')`), `.orderBy(sql\`${trips.startDate} asc nulls last\`, sql\`${places.googleSyncedAt} asc nulls first\`, asc(places.id))`, `.limit(limit)`. `writeRefreshPatch` = `.update(places).set(patch).where(and(eq(places.id, id), sql\`date_trunc('milliseconds', ${places.updatedAt}) = ${rowUpdatedAt.toISOString()}::timestamp\`)).returning({ id })` → `rows.length === 1` (string + cast, not a raw `Date` — Global Constraints, lost update guard). `refreshPlaceFromGoogle` runs in exactly this order: (1) `resolvePlaceWrite(userId, placeId, exec)` (throws `forbidden` for non-writers); (2) `allow ?? allowPlacesRequest` — `false` → `'limit'` (the per-user limit, before the `gplaces:refresh:manual` bucket); (3) `load(placeId)` — `null` → `'error'`; (4) status short-circuit — `googleStatus === 'NOT_FOUND'` → `'not_found'`, `'INVALID'` → `'invalid'`, returned without consume, fetch or write; (5) `refreshOne(row, { ...deps, source:'manual' })`.
- [ ] **Step 5:** Run both (the integration run with `TZ=Asia/Bangkok`) → PASS; `pnpm typecheck 2>&1 | tail -3`.
- [ ] **Step 6:** Commit `feat(places): Google refresh service with budget, breaker and candidate selection [TP-XXXX]`.

### Task 4: Cron route, "Update from Google" button, status badge

**Files:** Create `app/src/app/api/internal/google-resync/route.ts` + `route.test.ts`, `app/src/components/google-refresh-button.tsx`. Modify `app/vercel.json`, `app/src/app/actions/places.ts`, `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx`, `app/src/components/place-row.tsx`, `app/src/components/itinerary-list.module.css`.

**Produces:**
```ts
// actions/places.ts
export async function refreshPlaceFromGoogleAction(prev: { outcome: RefreshOutcome | null }, formData: FormData): Promise<{ outcome: RefreshOutcome }>;
// google-refresh-button.tsx ('use client')
export function GoogleRefreshButton({ placeId, tripId }: { placeId: string; tripId: string }): JSX.Element;
```

- [ ] **Step 1: Failing route test** (`vi.mock('@/lib/services/google-sync-service')`): no `CRON_SECRET` → 401; wrong bearer → 401, service not called; right bearer → 200 with the mocked `runGoogleResync` result as JSON.
- [ ] **Step 2:** Run → FAIL. Implement the route as a copy of `prune-rate-limit/route.ts` (same guard, `dynamic = 'force-dynamic'`, `maxDuration = 300` — the Hobby maximum) calling `runGoogleResync()`; rows stay sequential (20 × 3 s timeout worst case). Run → PASS.
- [ ] **Step 3: `vercel.json`:** add `{ "path": "/api/internal/google-resync", "schedule": "0 19 * * *" }` — 19:00 UTC = 02:00 Asia/Bangkok, when few edit forms are open. The plan is Hobby (100 crons per project, so a third cron is fine); Hobby fires each cron anywhere within its hour, so this runs 02:00–02:59 and the Stage A purge (`0 20 * * *`) 03:00–03:59 Bangkok, but **no ordering is assumed**: refresh-then-purge and purge-then-refresh give the same result (the merge treats expired-but-unpurged and purged groups the same way, Task 2 rows 11–12).
- [ ] **Step 4: Button.**
  - Action: `requireUserId()`, `placeId` and `tripId` from the form, `outcome = await refreshPlaceFromGoogle(userId, placeId)`; on `'ok'`, `'not_found'` or `'invalid'` `revalidatePath('/trip/' + tripId)`; return `{ outcome }`.
  - Component: `useActionState`; button "Update from Google" (pending "Updating…"); helper text "Unsaved changes on this page will be lost."; result line — `ok` "Updated from Google.", `not_found` "Google no longer lists this place.", `invalid` "Google can't look up this place. Pick it again from search.", `skipped` "This place changed while updating. Try again.", `limit` "Daily Google update limit reached. Try again tomorrow.", `unavailable` / `error` "Couldn't reach Google. Try again later."; on `ok` call `router.refresh()`.
  - Edit page: render it above `PlaceForm` only when `MAPS_CONFIG.googlePlaces && isGooglePlaceId(place.placeIdExternal) && place.googleStatus !== 'NOT_FOUND' && place.googleStatus !== 'INVALID'`. Give `PlaceForm` `key={String(place.googleSyncedAt?.getTime() ?? 0)}` so its uncontrolled inputs remount with refreshed values.
- [ ] **Step 5: Badge.** `place-row.tsx`: add `googleStatus?: GoogleStatus | null` to the `place` prop type; in `.placeMeta`, before the rating, render `<span className={styles.statusBadge}>{label}</span>` when `statusBadgeLabel(place.googleStatus)` is non-null. `.statusBadge` in `itinerary-list.module.css`: small pill using the existing danger/warning tokens (check the module's variables; no new colours). Confirm `sortable-place-item.tsx` / `sortable-place-list.tsx` pass the `loadTrip` row through unchanged so `googleStatus` arrives.
- [ ] **Step 6:** `pnpm test 2>&1 | tail -3`, `pnpm typecheck 2>&1 | tail -3`, `pnpm lint 2>&1 | tail -3` → clean.
- [ ] **Step 7: Browser check, fake mode** (`MAPS_PROVIDER=google GOOGLE_PLACES_FAKE=1 pnpm dev`, `CRON_SECRET` set in `app/.env`):
  - On a trip whose `end_date` ≥ today, add "Jay Fai" through the day picker. On the edit page rename it "My Jay Fai" and save.
  - `UPDATE place SET google_synced_at = now() - interval '26 days' WHERE id = '…'`; `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3210/api/internal/google-resync` → `{"refreshed":1,"notFound":0,"invalid":0,"skipped":0,"failed":0,"stopped":null}`.
  - Itinerary: name still "My Jay Fai"; rating 4.5; "Temporarily closed" badge. Edit page: address "327 Maha Chai Rd, Bangkok 10200", new hours.
  - Edit page button → "Updated from Google." and the form shows the refreshed values.
  - `UPDATE place SET place_id_external = 'ChIJfakeGone0001' WHERE id = '…'` → button → "Google no longer lists this place."; reload → button hidden; the cron no longer selects it.
  - `UPDATE place SET place_id_external = 'ChIJfakeBad0001', google_status = NULL, google_synced_at = NULL WHERE id = '…'` → cron curl → `"invalid":1`; `google_status = 'INVALID'`, `google_synced_at` set; a second curl does not select it.
  - Open mode (`MAPS_PROVIDER` unset): no button; the cron curl → `{"refreshed":0,"notFound":0,"invalid":0,"skipped":0,"failed":0,"stopped":"disabled"}`; the purge cron still works.
- [ ] **Step 8:** Commit `feat(places): daily Google resync cron, Update from Google button, closed badge [TP-XXXX]`.

### Task 5: Docs, env, live fixture

**Files:** `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `docs/ops/google-maps-setup.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `app/src/lib/places/__fixtures__/`

- [ ] **`.env.example`:** `GOOGLE_PLACES_REFRESH_DAILY_CAP="20"` ("Place Details Enterprise for the resync cron; 1k/month free shared with the button") and `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP="5"` ("Update from Google button") in the Maps provider block.
- [ ] **`maps-cost-guardrails.md`:** refresh rows in the Services table (Details Enterprise, cron 20/day + button 5/day); the `gplaces:refresh` / `gplaces:refresh:manual` buckets and "a cron run stops on its own first 403/429/timeout (breaker state is per instance)" in "Guardrails in code"; replace the Stage A "refresh arrives in Stage C" sentence.
- [ ] **`google-maps-setup.md`:** confirm §7 says 135 (30 + 80 + 20 + 5) and now describe the 20 + 5 as live; add both refresh caps to §9 and to the §7 per-minute note; add a §10 curl for the refresh mask (no `sessionToken`).
- [ ] **`API.md`, `agent-skill/travel-planner-api/SKILL.md`:** `googleStatus` may now also be `CLOSED_*` / `NOT_FOUND` / `INVALID` from the refresh (already documented in Stage A Task 6; re-check).
- [ ] **`ARCHITECTURE.md`, `AGENTS-INDEX.md`:** the resync cron (`0 19 * * *`), `google-refresh-button.tsx`, the new service exports.
- [ ] **Live fixture (only if Stage B keys exist):** capture `google-details-refresh.json` with the new curl, keep `businessStatus` as captured, adjust Task 1 / Task 4 expectations that depended on the hand-written values, and update `google.md`. Otherwise leave it hand-written.
- [ ] `pnpm build 2>&1 | tail -3` → success.
- [ ] Commit `docs(maps): Google resync cron, refresh budget [TP-XXXX]`, then open a PR against `main` (note: no-op in production until Stage B removes the Stage A gate).

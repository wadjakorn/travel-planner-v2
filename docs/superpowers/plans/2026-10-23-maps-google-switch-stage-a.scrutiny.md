# Scrutiny log — Maps Google switch Stage A

Plan: [2026-10-23-maps-google-switch-stage-a.md](2026-10-23-maps-google-switch-stage-a.md). Each round was done by a fresh outsider subagent. **Applied** means the plan was changed; **Kept** means the plan was left as it was, with the reason given.

## Round 1 — verdict: fix-then-ship

| # | Finding | Decision |
|---|---|---|
| Alt | The provider registry and reorderable chain are over-built; one Google-first step in front of the unchanged search body is enough | **Applied.** `providers.ts` is removed; `tryGoogle()` is added in `search.ts`; the positional signatures are kept |
| Alt | Cut the Google OG map | **Kept.** The user asked for Google OG if it costs nothing extra (10k/month free, cached 24 h per trip) |
| B1 | Once the details cap runs out, Google suggestions can no longer be resolved and every pick fails | **Applied.** Autocomplete is gated on `peekRateLimitKey(gplaces:details) < cap` |
| M1 | `available()` plus each method both consume, so the cap is charged twice | **Applied.** Each bucket is consumed exactly once per call; there is a test for it |
| M2 | Caps of 60 and 1500 exceed the spec and the free tiers | **Applied.** 30 / 300; the console doc is aligned |
| M3 | `trip-create-form` pays Enterprise for name and address | **Applied.** `place-autocomplete` gets a `fields` prop, default `basic`; only `place-form` sends `full` |
| M4 | Server-side autocomplete loses IP bias | **Applied (partial).** Same fixed bias as Photon; trip-aware bias is a Stage B follow-up |
| M5 | Transport loses its UTC offset for Google picks | **Applied.** `ensureCoords` keeps the detail's `timeZone`; there is a `pick.test.ts` case |
| M6 | The type check misses `String(null)`, `.tsx` tests can't run, and the manual check runs only in open mode | **Applied.** Pure `pick.ts` helpers with tests, a grep step, and a `GOOGLE_PLACES_FAKE` browser check |
| M7 | Attribution hard-codes Geoapify | **Applied.** `SearchAttribution({results})` |
| M8 | `crypto.randomUUID` throws over plain HTTP via Tailscale | **Applied.** `newSessionToken()` uses `getRandomValues` |
| n1 | The error copy and the `pickSeq` guard don't exist in every picker | **Applied.** New copy; the guard is added to all 5 |
| n2 | Timeouts don't trip the breaker, and 4 s is too slow | **Applied.** Status 0 trips it; 1500 / 3000 ms |
| n3 | Fail-open budgets need documenting | **Applied.** In `maps-cost-guardrails.md` |
| n4 | Google static map would be cached for 7 days | **Applied.** `no-store` on the Google branch |
| n5 | The claim "byte-for-byte unchanged" is inaccurate | **Applied.** Reworded: "results unchanged; only an extra `session=` param" |
| n6 | Marker colour case | **Applied.** Uppercase `0xE4572E` |

## Round 2 — verdict: fix-then-ship

| # | Finding | Decision |
|---|---|---|
| Alt | No smaller alternative is worth taking | — |
| M1 | "`config` defaults to an open config from `deps.key`" means the routes, which pass no deps, would always run open, so Google never turns on in prod while every test still passes | **Applied.** `config ?? (key !== undefined ? open(key) : MAPS_CONFIG)`, plus a "routes get MAPS_CONFIG" test |
| M2 | `peekRateLimitKey` is underspecified (`count(*)` vs the `count` column) and untested | **Applied.** Reads the `count` column with a live-window filter; 3 cases in the integration suite, run against a throwaway DB |
| M3 | A stale or null pick never ends the session, so a token that has already been ended gets reused | **Applied.** `takeSession()` runs synchronously before any await |
| M4 | `place-form` pays for `full` and then throws the fields away; one details bucket mixes Pro and Enterprise | **Applied.** `place-autocomplete` is always `basic`; buckets are split `details:full` 30 / `details:basic` 150; autocomplete carries `fields` and peeks the matching bucket |
| m1 | Race between peek and consume | **Applied.** Headroom of `cap - 2` |
| m2 | Fake mode spends the shared DB budget | **Applied.** Fake mode skips the limiter |
| m3 | Junk ids burn budget; does details check the breaker? | **Applied.** Validate first; an open breaker means `null` with no consume |
| m4 | Async picks let the parent form submit early | **Applied.** `onBusyChange` disables submit in the parents |
| n1 | The `client.test.ts:21` assertion changes; `fetchSuggestions` inserted a positional argument | **Applied.** New params are trailing; the one assertion change is documented |
| n2 | Moving the types breaks 2 importers | **Applied.** The pickers re-export them |
| n3 | Preview modals fall back to a fuzzy search for Google suggestions | **Applied.** They pass `placeIdExternal` |
| n4 | Uninjected limiter and breaker state leak between tests | **Applied.** Inject every time; reset in `beforeEach` |
| n5 | `parseNumber("null")` is safe | Noted; no change needed |

## Round 3 — verdict: fix-then-ship (final)

| # | Finding | Decision |
|---|---|---|
| Alt | Peek plus `cap-2` headroom costs a DB round-trip on every keystroke, needs an integration test and adds race logic. Instead, let a denied details consume stop Google until the window resets | **Applied.** `budgetExhaustedUntil = now + retryAfter`. Accepted cost: one failed pick per warm instance per day. Peek, the headroom rule, the integration test and `fields` on autocomplete are all removed. This replaces R1-B1's mechanism and R2-M2 / R2-m1 |
| M1 | `no-store` on the Google static map makes the OG route dynamic (Next 16), so the 24 h ISR is lost | **Applied.** The Google branch uses `next.revalidate: 86400`; R1-n4 is reversed |
| M2 | `vi.doMock` after a static import does nothing | **Applied.** Separate `search.routes.test.ts` with a top-level `vi.mock` plus `importOriginal` |
| M3 | `AbortSignal.timeout` throws `TimeoutError`, not `AbortError`, so a real timeout never trips the breaker | **Applied.** Any rejection becomes status 0; a test uses a real 1 ms timeout |
| M4 | "Input disabled" contradicts "typing during a pick sends a new session" | **Applied.** Input stays disabled; the browser check is dropped and the unit test covers it |
| n1 | Files missing from the File map (geoapify `rating`/`reviews`, the form clients, preview modals, `places/rate-limit.ts`) | **Applied** |
| n2 | `resolvePlace` 1-arg calls in `client.test.ts` break typecheck | **Applied.** `o` is optional |
| n3 | The transport form has 2 pickers | **Applied.** `fromBusy || toBusy` |
| n4 | `pendingId` / `isPending` stay busy on a `null` result | **Applied.** Every exit path clears busy |
| n5 | Do details errors trip the breaker? Does fake mode skip the limiter on details too? | **Applied.** Both are now stated, with a test |
| n6 | Fixtures and `fakeGoogleFetch` would reach the client bundle through the `Fields` import | **Applied.** `Fields` moves to `types.ts`; fake code goes in `google-fake.ts` (`server-only`) |
| n7 | Stale `GOOGLE_PLACES_DAILY_CAP` and P1–P4 wording in the console doc and the spec | **Applied.** Task 6 fixes them |
| n8 | Edge cases at cap 1–2 and breaker boundary | **Applied.** `cap-2` is gone; the breaker comparison is strict `now < trippedUntil` |

## Post-review — billing check (2026-10-23, prompted by the user)

- **Maps #4 (pm ticket, SKIPPED 2026-07-14)** kept Places in the browser on the premise "the session token makes Place Details **free** ($0)".
- **Google's session-pricing docs** (web service and JS pages say the same thing) contradict that premise:
  - A session makes the **autocomplete requests** free. The terminating details call is **billed**.
  - With any Pro or Enterprise field in the mask, that call is billed at **Enterprise + Atmosphere**.
- The REST API supports `sessionToken` on both calls, so a server-side session loses nothing compared with `toPlace()`.
- **Applied:** `basic` mask reduced to Essentials (`id,formattedAddress,location,types`). The old app's hotel mask included `displayName`, so every hotel pick was billed at Enterprise + Atmosphere.
- **Full verification** in [research/2026-10-23-google-places-billing-verification.md](../../research/2026-10-23-google-places-billing-verification.md):
  - The old session mechanics were correct. The "$0 details" belief was wrong.
  - Every old pick was billed at E+A.
- **Applied:**
  - `details:basic` cap 150 → **80**, because Essentials-terminated sessions bill up to 12 autocomplete requests each.
  - Restored the hotel `includedPrimaryTypes:['lodging']` filter, which the pre-#57 code had, via `kind=lodging`.

# Set 2 (after the billing verification)

## Round 4 — verdict: fix-then-ship. Billing math re-verified independently from raw Google docs and found correct.

| # | Finding | Decision |
|---|---|---|
| S1-M1 | ToS 14.2: Places content may not be shown on a non-Google map (Stage A runs before the Google map exists; flip-back; MapLibre fallback) | **Applied:** Google mode stays off in prod until Stage B; prod Google mode needs the signing secret. **Accepted risk → user decision:** flip-back and fallback |
| S1-M2 | ToS: saving Places content in the DB; `no-store` overclaims compliance | **Applied:** constraint reworded. **Accepted risk → user decision** (pre-#57 did the same) |
| S1-M3 | `includedPrimaryTypes:['lodging']` matches only the primary type, so it drops hotels | **Applied:** filter removed; ranking is kept |
| S1-n1 | The stated reason for the 80 cap is wrong | **Applied:** the autocomplete cap is the binding limit; 80 is a backstop |
| S1-n2 | `kind` wiring untested | Moot (filter removed) |
| S1-n3 | Attribution text | **Applied:** "Google Maps" with `translate="no"` |
| S1-n4 | A bare `ChIJ` from the links plan | **Applied:** note added to the links-plan edit |
| S1-n5 | "Identical line for line" overstated | **Applied:** "the body is identical" |

## Round 5 — verdict: fix-then-ship

| # | Finding | Decision |
|---|---|---|
| Program | Is the A/B split still right? | **Kept.** Merge Stage A behind a code gate, so the open-mode refactor ships and gets checked on its own. The Task 5 Step 8 open-mode check is the ship gate. Exception: if keys arrive within days, stack Stage B on the unmerged branch instead |
| S2-M1 | The "no prod before Stage B" rule lived only in the docs, and the console doc said to set google in prod | **Applied:** `readMapsConfig` forces `open` when `NODE_ENV==='production'` in Stage A, with a test; the console doc §9.2 now says to set it only after Stage B |
| S2-M2 | A null pick in `place-autocomplete` keeps the previous pick's hidden coords and id | **Applied:** clear address, lat, lng and `placeIdExternal` on null |
| S2-m1 | Trip-create pays for details it never uses | **Applied:** `resolve={false}` |
| S2-m2 | Autocomplete language source unspecified | **Applied:** `queryLang(q)`, with a test |
| S2-m3 | Stale lines in the console doc (10.2 Pro mask, quota reasons, P3) | **Applied directly to the doc now**; Task 6 only re-checks it |
| S2-n1 | Read `NODE_ENV` from the env argument; tests must set it | **Applied:** `gcfg` sets `NODE_ENV:'test'`; `.env.example` says fake works under `pnpm dev` only |
| S2-n2 | `googleDetails` had no `timeoutMs` | **Applied** |
| S2-n3 | Leftovers in the report (lodging ✅, the 150 reasoning) | **Applied** |

## Round 6 (final) — verdict: fix-then-ship. Both blockers are task wiring, not design

| # | Finding | Decision |
|---|---|---|
| Alt | The only dead weight is the signing-secret rule; budgets and breaker stay in Stage A so Stage B never touches `search.ts` | **Applied** (S3-B1) |
| S3-B1 | The secret rule contradicts the fake-mode test, the routes test and the Step 8 browser check | **Applied:** moved to a Stage B to-do; Stage A tests restored (google + key, no secret, dev → `googlePlaces:true`, static map falls back) |
| S3-B2 | Tasks 2–3 use types that are only created in Task 5 | **Applied:** new **Task 1b: Place types** (types, Geoapify rating/reviews null, `withTz` guard, minimal compile guards); Task 5 imports from it |
| S3-M1 | `vercel env rm` takes one environment | **Applied:** one line per environment in the console doc |
| S3-n1 | Browser key blocks dev over Tailscale | **Applied:** referrers `wadjakorn-bmax:3210` and `100.78.126.1:3210` |
| S3-n2 | Wrong `trip-create-form` citation | **Applied:** explicit edit of line 56 |
| S3-n3 | `client.test.ts` line is 20, not 21 | **Applied** |
| S3-n4 | "Only wire change" overstated | **Applied:** also mentions `fields=` |
| Gate | Removing the gate is "a rule, its test and the doc note", not one line | **Applied** (wording in the Stage B to-do) |

## Set 2 → design adopted (2026-10-23)

The storage decision (S1-M2) was worked out in [the resync design](../specs/2026-10-23-google-place-resync-design.md), now marked adopted. User decisions:

| Item | Decision |
|---|---|
| Design §6 Q1: opening hours expire like rating | **Yes.** `hours` gets a 30-day TTL through its own `hours_synced_at`, separate from `rating_synced_at` (one shared column would turn a Google rating into a permanent user value whenever the user edits only the hours). `google_snapshot` holds no rating, reviews or hours. Phone and website stay permanent |
| Design §6 Q2: include `hotel` | **No** |
| Stage A scope | **Task 5b added:** 5 columns + backfill migration, write rules on pick and on user edit, `visibleVolatile` on the 4 read paths, daily purge cron in both modes. The "No DB migration" constraint is replaced. Task 6 sets the console Place Details quota to **130** (30 + 80 + 20) |
| Found while planning | The place edit page never passes `lat`/`lng`/`placeIdExternal` to the form, so every save clears them. Fixed in Task 5b Step 7 because the update rule depends on `placeIdExternal` |
| Refresh | **Stage C plan created:** [2026-10-23-maps-google-resync-stage-c.md](2026-10-23-maps-google-resync-stage-c.md) (cron + "Update from Google" button, Enterprise mask, `gplaces:refresh` 20/day, shared breaker, merge rules, closed badge). Runs after Stage B |

Task 5b and the Stage C plan had their first outsider review in Round 7 below.

## Round 7 (Stage A Task 5b + Stage C, set 3 r1)

| Finding | Decision |
|---|---|
| Alt: refresh only volatile fields + fill empties, drop the snapshot | **Kept** the snapshot design. The user explicitly wants name, address and coords to follow Google changes, which needs the snapshot to tell edited from unedited |
| C1-M1: re-pick on the edit page keeps the old visible address, so the snapshot marks address as user-edited forever | **Applied (adapted):** `PlaceForm` is a server component, so it cannot pass `onSelect`. `PlaceAutocomplete` gets a string prop `fillAddressInput`; `place-form.tsx` passes `"address"`, and a pick overwrites the visible address input. Phone, website and hours untouched (a `basic` pick has none). Browser check: re-pick → saved address equals the snapshot address (Task 5b Step 7, Step 13) |
| C1-M2a: cron write races a user save (lost update) | **Applied:** `writeRefreshPatch(id, patch, rowUpdatedAt)` is conditional on `date_trunc('milliseconds', updated_at) = rowUpdatedAt` (`defaultNow()` stores µs); zero rows → `'skipped'`, counted. Unit + integration tests (incl. a µs `updated_at`) |
| C1-M2b: edit form opened before the cron, saved after it, writes old Google values and claims them as user edits | **Applied:** hidden `formBase` (the values the edit form rendered). `rebaseOnFormBase` keeps the DB's current value for every unit the user did not change in this form (name, address, phone, website, location = lat+lng+id, rating group, hours group); `googleSyncOnUpdate` compares against `base` instead of the stored row. Chosen over a conflict/reload check because `PlaceForm` has no client error path and this loses no edits. API PATCH has no base and keeps the old rule. Tests in Step 1 and the integration file |
| C1-M2c: cron time | **Applied:** resync `0 19 * * *` (02:00 Asia/Bangkok), purge moved to `0 20 * * *` (03:00 Bangkok) |
| C1-M3: the cron starves the manual button; candidate ordering | **Applied:** button bucket `gplaces:refresh:manual`, `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP=5`; cron keeps `gplaces:refresh` 20/day. Console Place Details/day **135** (30 + 80 + 20 + 5) in the design, Stage A Task 6, Stage C and `google-maps-setup.md` §7. Ordering `trip.start_date ASC NULLS LAST, google_synced_at ASC NULLS FIRST, place.id` |
| C1-M4: deterministic failures clog the queue | **Applied:** bad bare id, Google 400, or a 200 without `location` → `google_status='INVALID'` + `google_synced_at=now()`, excluded from candidates like `NOT_FOUND`, button hidden. Transient (0/403/429/5xx) write nothing. Tests |
| C1-n1: Hobby crons | **Applied:** dropped the "fold into the purge route" fallback; Hobby fires within the hour, so no purge/resync ordering is claimed (the merge is order-independent) |
| C1-n2: route duration | **Applied:** `maxDuration = 300` (Hobby max), rows stay sequential |
| C1-n3: breaker described as shared across routes | **Applied:** Stage C Architecture, constraints, Review Focus and design §4.2 now say per-instance only; the cron run stops on its own first 403/429/timeout |
| C1-n4: API exposes internals | **Applied:** `apiPlaceView` exposes `googleStatus`, strips `googleSnapshot` and the three `*SyncedAt`, in `loadApiTrip`, PATCH and POST place routes (there was no serializer; routes returned raw rows). Unit test + POST route integration assertion. Task 6 documents `googleStatus` in `API.md` and the agent skill. **Accepted:** export → re-import through the API turns visible Google ratings/hours into permanent user values |
| C1-n5: `visibleVolatile` on every place in the DB | **Applied:** `loadTrip`'s places/segments selects had no trip filter at all; added `inArray(…dayId, dayIds)` and apply `visibleVolatile` only to the trip's places. Note instead of a test: `loadTrip` uses the global neon `db` and can't be pointed at the scratch DB; output is unchanged |
| C1-n6: legacy rows | **Applied:** design §4.3 states that rows with no snapshot at first refresh stop following Google for fields that differ from Google — conservative by design |
| C1-n7: PATCH semantics | **Applied:** integration test — `updatePlace` with `parsePlaceFields({ name:'X' })` clears id, snapshot, synced-at and status |

## Round 8 (set 3 r2)

| Finding | Decision |
|---|---|
| Alt: drop the "Update from Google" button | **Kept.** The user asked for a re-sync/update capability, and on-demand refresh is the user-visible part of it; its cost is bounded by its own 5/day `gplaces:refresh:manual` bucket |
| C2-B1: the lost-update guard binds a raw `Date` inside a `sql` template; Drizzle skips `mapToDriverValue` there and disables postgres-js date serializers, and neon-http formats a `Date` in local time with an offset, so against the `timestamp` (no tz) column every cron write misses by the offset (7 h on the Asia/Bangkok dev box) and is `'skipped'` | **Applied:** bind `${rowUpdatedAt.toISOString()}::timestamp` in `date_trunc('milliseconds', updated_at) = …` (Stage C Global Constraints, Produces comment, Task 3 Step 4). The integration test runs with `TZ=Asia/Bangkok` and a microsecond `updated_at` (Steps 2, 3, 5; Review Focus 3b). Design §4.2 wording aligned |
| C2-M2: `rebaseOnFormBase` reads the current row and copies its values back, which adds a read and still races a cron write between the read and the update | **Applied (before M1, since it reshapes the function):** replaced by `untouchedUnits(submitted, base): Set<Unit>` + `omitUnits(f, units)`; `updatePlace` leaves untouched units out of `SET`, reading only the `StoredSync` columns the sync rule needs. With `base` the id rule uses `base.placeIdExternal`; the API path (no base) writes everything as before. Tests rewritten. Rules now state: change-and-change-back in one form reads as untouched (harmless); a cron A → B while the form shows A keeps B (the user never saw B). Design §3 aligned |
| C2-M1: re-picking a different place on the edit page carries the old place's Google rating, hours, phone and website over under the new snapshot | **Applied:** in `googleSyncOnUpdate`, when `placeIdExternal` changes with a pick, each volatile group with non-null `*SyncedAt` that is untouched in the form is set to null (values + `*SyncedAt`); `phone`/`website` are cleared when untouched **and** equal to the old snapshot's value. Same-id re-pick merges `{ ...stored.googleSnapshot, ...pick.snapshot }` so `phone`/`website` keys survive a `basic` pick. Return type widened to `UpdatePatch`. Three `base` tests (different place / user data kept / same place) + the no-base re-pick expectation updated + one integration test + a Step 13 browser check. Design §3 aligned |
| C2-n1: the POST place route strips outside the idempotent callback, so a replay returns the stored raw row | **Applied:** `apiPlaceView` goes inside the `withIdempotencyAtomic` callback (`days/[dayId]/places/route.ts` lines 18–26, verified); integration test asserts a same-key replay is stripped too. Task 6 lists the MCP plan; a one-line note under its Task 3 (place tools) code block says `add_place` must return `apiPlaceView` inside `runIdempotent` |
| C2-n2: a 4000-char `formBase` cap can reject real rows (long Thai hours) and fails silently | **Applied:** `FORM_BASE_MAX = 16_000`; over the cap → `null` and one injected `warn` (called once per request). Tests: a 10 000-char `hours` round-trips; cap + 1 → `null` with exactly one warn. `googlePick` keeps its 4000 cap |
| C2-n3: `fillAddressInput` has no handle on the form (the component only has `wrapRef`) | **Applied:** `inputRef` on the visible name input; lookup via `inputRef.current?.form?.elements.namedItem(fillAddressInput)` (set only when it is an `HTMLInputElement`). **Adapted:** the "add page" note — `PlaceForm` is rendered only by the edit page (the add page uses `PlaceManualForm`, which has no autocomplete), so Step 7 states the intended change as "a pick overwrites any address typed before the pick" on the edit page |
| C2-n4: `GoogleRefresh.businessStatus` admitted `'INVALID'`; `API.md` / the agent skill were edited by steps but missing from Files lines | **Applied:** `Exclude<GoogleStatus, 'NOT_FOUND' \| 'INVALID'>`; both docs added to Stage A Task 6 **Files**, the Stage C File map and Stage C Task 5 **Files** |

## Round 9 (set 3 r3, final)

| Finding | Decision |
|---|---|
| C3-M1: Step 9 integration tests pass partial objects (`F` from the unit file, `{ ...base, … }`, `parsePlaceFields({ name:'X' })`) where a full `PlaceFields` is required, and `parsePlaceFields` throws without `kind` | **Applied:** the integration file defines its own full `F: PlaceFields` (all 18 keys incl. `kind`, `category`, `tags:[]`), `fullPick`, and `base: FormBase` = `F`'s form keys; spreads become `{ ...F, ...base, … }`; the stale-form and re-pick tests call `addPlace(user, day, F, exec, { googlePick: fullPick, now })`; the PATCH pin uses `parsePlaceFields({ kind:'food', name:'X' })` (`place-input.ts:38-44`) |
| C3-M2: a `basic` pick (add or edit-page re-pick) stamps `googleSyncedAt = now`, so the cron waits 25 days before fetching the rating/hours that pick never had | **Applied:** a `basic` pick writes `google_snapshot` with `googleSyncedAt: null`; the Stage C cron (`google_synced_at ASC NULLS FIRST`) refreshes it the next night, one Enterprise call within the 20/day cap. `full` picks keep `now`. Rules (Add, different-id, same-id), Step 1 tests (basic add, both different-place re-picks, both same-place re-picks; new same-id `full` test keeps `now`), the Step 9 re-pick integration test, Step 13 browser checks, design §3 (diagram + bullets) and §4.1 / Stage C candidate wording updated. Stage C ordering already put nulls first — no test change needed there |
| C3-n1: `formBase` is the raw DB row, but the form submits `trimOrNull`'d values with CR/LF stripped by text-input sanitization, so e.g. multi-line `hours` reads as edited on every save | **Applied:** `formBaseJson` normalizes: `name`/`address`/`phone`/`website`/`hours` (all `type="text"`) → remove every `\r` and `\n`, then trim, `''` → `null`; `placeIdExternal` (hidden) → `trimOrNull`; numbers unchanged. Test: padded name, `''` website and `\r\n` hours normalize, and the browser-submitted hours value counts as untouched. Design §3 aligned |
| C3-n2: `refreshPlaceFromGoogle` order is implicit; a `null` load and the status short-circuit are unspecified | **Applied:** Stage C Task 3 Step 4 states `resolvePlaceWrite` → `allow` → `load` (`null` → `'error'`) → `NOT_FOUND`/`INVALID` short-circuit (no consume, fetch or write) → `refreshOne(…, source:'manual')`; unit test added for `load` → `null` |
| C3-n3: unlisted accepted ownership leaks | **Applied:** design §3 and Stage A Rules list both: editing only `rating` makes Google `reviews` permanent too (one `ratingSyncedAt` per group); an API agent PATCHing a rating read before a cron refresh makes the stale value permanent (same class as export/re-import) |
| C3-n4: the disabled cron result is `{ stopped:'disabled' }` in the unit test but the full object in the browser check | **Applied:** unit test deep-equals `{ refreshed:0, notFound:0, invalid:0, skipped:0, failed:0, stopped:'disabled' }`, matching the `runGoogleResync` return type (`failed`, not `errors`) and Task 4 Step 7 |

Review complete: 9 rounds; remaining open items: none

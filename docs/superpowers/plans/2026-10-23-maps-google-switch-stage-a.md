# Maps Google switch — Stage A (no keys needed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one `MAPS_PROVIDER=google|open` switch. When it is `google`, place search and details try Google Places (New) first on the server, and the trip OG image uses signed Google Static Maps. Everything must be buildable, unit-testable and browser-checkable (through a fixture-backed fake) without a real Google key. Results in `open` mode stay unchanged.

**Architecture:**
- `lib/maps/config.ts` reads env once and resolves each part separately.
- `lib/places/search.ts` gets **one Google-first step** in front of its existing Geoapify → Photon body, which is left as is. The step is gated by key, breaker and daily budget.
- `lib/places/google.ts` holds the pure REST client and parsers.
- In the browser, search and details go through the session token. Each picker's pick logic moves into pure helpers so it can be unit-tested.
- The Google *map renderer* is Stage B, because it can only be verified with a browser key.
- Google-sourced rating, reviews and opening hours expire after 30 days (hidden on read, purged daily); refresh from Google is [Stage C](2026-10-23-maps-google-resync-stage-c.md). → Task 5b.

**Tech Stack:** Next.js 16.2.4 App Router, TypeScript, vitest 3 (`src/**/*.test.ts`, node env, `server-only` aliased to a stub), `consumeRateLimitKey` (`lib/api/rate-limit.ts:69`), and `node:crypto`.

**Spec:** [2026-10-22-maps-multi-provider.md](2026-10-22-maps-multi-provider.md) (§1 decisions, §6 design). Console: [docs/ops/google-maps-setup.md](../../ops/google-maps-setup.md). Review log: [2026-10-23-maps-google-switch-stage-a.scrutiny.md](2026-10-23-maps-google-switch-stage-a.scrutiny.md).

## Global Constraints

- **Default is `open`.** If `MAPS_PROVIDER` is unset, empty or unknown, search results, details, OG image and pickers behave as on `origin/main`. The only wire changes are an extra `session=` param on autocomplete and details, and `fields=full|basic` on details.
  - Existing tests keep their assertions.
  - `searchPlaces(q, deps)` / `getPlaceDetail(id, lang, deps)` keep their positional shape. New options go into `deps`.
- **Server-only Google secrets:** `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`. Never `NEXT_PUBLIC_`, never read by client code. `GOOGLE_MAPS_BROWSER_KEY` / `GOOGLE_MAPS_MAP_ID` are Stage B.
- **Google Places is never cached** (ToS): every Places fetch uses `cache: 'no-store'`.
  - The Google Static Maps fetch uses `next: { revalidate: 86400 }`, matching the OG route. A `no-store` fetch would make the route dynamic in Next 16 and drop its 24 h ISR.
  - The rendered OG PNG is cached by ISR and by crawlers anyway. Geoapify keeps its caches.
- **Field masks are fixed server-side.** The client sends `fields=basic|full` on **details only**; the default is `basic`.
  - `basic` = `id,formattedAddress,location,types` (**Essentials only**). The name comes from the suggestion (`client.ts` already merges `place.name || s.name`); the timezone comes from `tz-lookup`.
  - `full` = `id,displayName,formattedAddress,location,types,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount`
  - **Why basic must stay Essentials-only:** under session pricing, a terminating details call with *any* Pro or Enterprise field (`displayName` counts) is billed at **Place Details Enterprise + Atmosphere**, whatever the fields are ([session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)).
    - An Essentials termination bills the details call at Essentials, plus the session's first 12 autocomplete requests at Autocomplete Requests (13 and later are free).
    - A Pro/Enterprise termination makes every autocomplete request free, and bills the details call at Enterprise + Atmosphere.
  - Only `place-search-picker` (the day "add place" flow) asks for `full`. `place-autocomplete` writes back only name, address, coords and id, so it always uses `basic`. (`PlaceForm` is a server component, so it cannot pass `onSelect`; Task 5b adds a `fillAddressInput` prop so a pick also overwrites the visible address input. Phone, website and hours are never in a `basic` pick and stay untouched.)
- **Session token:** one v4 UUID per search session. It is sent on autocomplete calls and on the one details call that ends the session.
  - A pick takes the token and clears it **synchronously, before** any await (`takeSession()`), so typing during an in-flight details call starts a new session.
  - Generate it with `crypto.getRandomValues`, **not** `crypto.randomUUID`, because the dev app is opened over plain HTTP via Tailscale, which is not a secure context.
- **Google failures never surface to the user.** A throw, an empty result, a non-2xx, a timeout, an open breaker or an exhausted budget all mean the existing Geoapify → Photon path runs. The route response shapes stay as they are.
- **Daily budgets** are global, use fixed 1-day windows (86400 s), and **fail open** if the limiter throws (the console quota is the hard stop):
  - `GOOGLE_PLACES_DETAILS_FULL_DAILY_CAP` default **30** (Enterprise, 1k/month free), key `gplaces:details:full`
  - `GOOGLE_PLACES_DETAILS_BASIC_DAILY_CAP` default **80** (Essentials, 10k/month free). This cap is a backstop: the binding limit on billed autocomplete is the 300/day autocomplete cap (≈ 9.3k/month < the 10k free tier), because Essentials-terminated sessions bill up to 12 autocomplete requests each. See [billing verification](../../research/2026-10-23-google-places-billing-verification.md) §5., key `gplaces:details:basic`
  - `GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP` default **300**, key `gplaces:autocomplete`
  - Each Google call consumes from its own bucket **exactly once**, and only after the id passes validation.
  - **When the details budget runs out, Google autocomplete stops too.** A denied details consume sets `budgetExhaustedUntil = now + retryAfter·1000` (from `RateLimitResult.retryAfter`). Until then, autocomplete skips Google and the details call returns `null`.
    - Accepted cost: **one failed pick per warm instance per day** ("Couldn't load that place. Try another result."), after which search falls back to Geoapify/Photon.
    - This replaces a DB peek on every keystroke (round 3).
  - **Fake mode skips the limiter entirely**, for both search and details.
- **Breaker:** HTTP 403, 429, or **any non-HTTP rejection** (network error, `AbortSignal.timeout` → `TimeoutError`) from **either** autocomplete or details skips Google for **10 minutes**. While `now < trippedUntil` the breaker is open. The state is per instance, in memory. Timeouts: autocomplete **1500 ms**, details **3000 ms**.
- **No `includedPrimaryTypes` filter.** It matches only a place's *primary* type, and hotels are usually `hotel` or `resort_hotel` rather than `lodging`, so the filter would drop real hotels. Hotel pickers keep today's lodging-first ranking (`hotel-search-picker.tsx:29`, `hotel-place-picker.tsx:37`) on top of `kindFromGoogleTypes`, which reads the full `types`.
- **Location bias:** Google autocomplete sends the same fixed bias Photon already uses (`13.75, 100.5`, `photon.ts:41`) as `locationBias.circle` with radius **50000 m**. A trip-aware bias is a follow-up.
- **Static map:** Google is used only with **both** a server key and a signing secret. Otherwise use Geoapify, and if that has no key either, return `null`.
- **Attribution:** below the results, show the text `Google Maps` (wrapped in `translate="no"`; Google's current rule for new implementations) when any result comes from Google; otherwise show the existing Geoapify / OSM line.
- **Fake mode for keyless checks:** `GOOGLE_PLACES_FAKE=1` turns Google on with a fetch that serves the fixtures. It is **ignored when `NODE_ENV === 'production'`**.
- **Google ToS: Places content on a non-Google map** (Service Specific Terms 14.2: "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map").
  - Stage A **must not** be enabled in production (`MAPS_PROVIDER=google`) until Stage B ships the Google map renderer. Before then, Google results would appear on the MapLibre trip map.
  - **Code-enforced in Stage A:** `readMapsConfig` forces `provider:'open'` when `env.NODE_ENV === 'production'` (read from the `env` argument only) and warns once: "Google mode requires the Stage B renderer". Stage B deletes this one rule.
    - Vercel Preview also runs with `NODE_ENV=production`, so it stays open as well, which is what we want.
    - Under `pnpm dev`, and with `NODE_ENV:'test'` in tests, Google and fake mode work.
  - **Stage B to-do (not in Stage A):** when the gate is deleted, also make Google mode require the signing secret, so the OG image is always Google whenever Places is Google, and add a test for it. Stage A doesn't need this: the gate already blocks Google in production, and fake mode and the routes test run without a secret. Deleting the gate means removing the rule, its test and the console doc §9.2 note.
  - The flip back to `open`, and the Stage B MapLibre fallback on `gm_authFailure`, still show previously saved Google-sourced places on MapLibre. This is an **accepted risk, decided by the user 2026-10-23.**
- **Google ToS: storing Places content.** Saving name, address, coords, phone, hours and rating into our DB long-term is "storing Places API content" (only `place_id` is exempt; lat/lng may be cached for 30 days, Terms 14.3). The pre-#57 app did the same. **User decision 2026-10-23:** name, address, coords, phone and website are stored permanently (accepted risk); rating, reviews and opening hours get a 30-day TTL (Task 5b) plus re-sync from Google (Stage C). Hotels are out of scope. See [the resync design](../specs/2026-10-23-google-place-resync-design.md) (adopted). The `no-store` rule above covers only HTTP caching and does **not** make storage compliant.
- **One DB migration, in Task 5b only:** 5 nullable columns on `place` (`rating_synced_at`, `hours_synced_at`, `google_synced_at`, `google_snapshot`, `google_status`) plus a data backfill in a separate custom migration. Generate with `pnpm db:generate`; never `db:push`. Migrations run in the production Vercel build (`vercel-build`), so the backfill takes effect on the first prod deploy **in both modes**. Google ids are still stored bare (`ChIJ…`), matching the legacy scheme in `place-id.ts`.
- **Expiring Google data (Task 5b):** two independent groups — `rating`+`reviews` (`rating_synced_at`) and `hours` (`hours_synced_at`). A non-null `*_synced_at` means "from Google at that time"; null means user-owned or empty. Expired = older than 30 days. Every read path that returns place rows goes through `visibleVolatile`; a daily `CRON_SECRET` cron purges. Neither depends on `MAPS_PROVIDER`. `google_snapshot` never holds rating, reviews or hours (it is permanent). `/api/v1` responses go through `apiPlaceView`: `googleStatus` is exposed, `googleSnapshot` and the three `*SyncedAt` columns are stripped. The web edit form sends a hidden `formBase` (the values it rendered) so only fields the user actually changed in that form are written and become user-owned.

## Review Focus

0. **Google ToS.** `MAPS_PROVIDER=google` with key **and** secret under `NODE_ENV:'production'` → config stays `open` (Stage A gate). → Task 1.
1. **The details budget runs out mid-day.** After the first denied details call, Google suggestions stop on that instance. → Task 3 `details denial stops google autocomplete`.
   - **The routes must actually get the Google config.** A Google path that never turns on in production would pass every unit test that injects `gcfg`. → Task 3 `routes get MAPS_CONFIG`.
2. **Google answers 403 `BILLING_DISABLED`, which is the original incident.** Search returns Geoapify/Photon results, and only the first request per warm instance in 10 minutes pays the Google round-trip. → Task 3 breaker tests.
3. **A Google suggestion has `lat: null`.** No picker may save `"null"`, and transport must keep its UTC offset. → Task 5 helper tests.
4. **Details id injection.** `id=../../v1/places:searchText` never reaches the URL path. → Task 2.
5. **Misconfigured env.**
   - `' Google '` means google.
   - `gogle` means open, plus one warning.
   - `google` without a key means open search with a warning.
   - A fake flag in production is ignored.
   → Task 1.
6. **Expired Google data leaks.** A 31-day-old Google rating must not appear in the itinerary, the edit page, or any `/api/v1` response, and editing only `hours` must not turn a Google rating into a permanent user value. → Task 5b `visibleVolatile` / `googleSyncOnUpdate` tests and the Step 8 read-path list.
   - **Edit form vs. stored data.** Re-picking on the edit page saves the picked address (not the old visible one); a form opened before a background change only writes and claims the fields the user changed in it (`formBase`); re-picking a different place clears the old place's Google rating/hours/phone/website; `/api/v1` never returns `googleSnapshot` or `*SyncedAt`, not even on an idempotent replay. → Task 5b `untouchedUnits` / `googleSyncOnUpdate` / `apiPlaceView` tests, Step 13.

---

## File map

| File | Change |
|---|---|
| `app/src/lib/maps/config.ts` (+test) | **Create.** `readMapsConfig(env, warn)`, `MAPS_CONFIG` |
| `app/src/lib/places/google.ts` (+test, `__fixtures__/google-*.json` + `.md` provenance) | **Create.** REST client, parsers, masks, breaker |
| `app/src/lib/places/kind.ts` (+test) | `kindFromGoogleTypes` |
| `app/src/lib/places/rate-limit.ts` | Export the `Consume` type |
| `app/src/lib/places/google-fake.ts` | **Create.** `fakeGoogleFetch` and the fixture imports (`server-only`) |
| `app/src/lib/places/search.ts` (+test) | Google-first step; `session`, `fields` in deps |
| `app/src/lib/places/types.ts` | Nullable suggestion coords; `rating`, `reviews` on details |
| `app/src/lib/places/client.ts` (+test), `app/src/lib/places/pick.ts` (+test) | `resolvePlace`, `ensureCoords`, pure pick helpers |
| `app/src/lib/places/session.ts` (+test) | `newSessionToken()` |
| `app/src/components/use-place-search.ts`, the 5 pickers, `search-attribution.tsx`, `hotel-form-client.tsx`, `transport-form-client.tsx`, `place-preview-modal.tsx`, `hotel-preview-modal.tsx` | Wiring |
| `app/src/lib/places/geoapify.ts` | `rating: null, reviews: null` in details (type) |
| `app/src/app/api/places/{autocomplete,details}/route.ts` | `session` (both), `fields` (details) |
| `app/src/lib/static-map.ts` (+test), `opengraph-image.tsx` | Provider switch |
| `app/src/db/schema.ts`, `app/drizzle/0016_google_sync_columns.sql`, `app/drizzle/0017_google_volatile_backfill.sql` (+ meta) | 5 sync columns on `place`; backfill (Task 5b) |
| `app/src/lib/places/google-sync.ts` (+test) | **Create.** `visibleVolatile`, `parseGooglePick`, `googleSyncOnAdd`, `googleSyncOnUpdate`, `formBaseJson`, `parseFormBase`, `untouchedUnits`, `omitUnits`, `apiPlaceView` (pure) |
| `app/src/lib/places/pick.ts`, `components/place-autocomplete.tsx`, `components/place-form.tsx` | `googlePickJson`; hidden `googlePick` field; `fillAddressInput` prop + `inputRef` (a pick overwrites the visible address) |
| `app/src/lib/services/place-service.ts`, `app/src/app/actions/places.ts` | Write sync columns on add/update |
| `app/src/lib/services/google-sync-service.ts` (+integration test), `app/src/app/api/internal/purge-google-volatile/route.ts` (+test), `app/vercel.json` | **Create.** Daily purge cron |
| `app/src/lib/trip-queries.ts`, `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx`, `app/src/app/api/v1/places/[placeId]/route.ts`, `app/src/app/api/v1/days/[dayId]/places/route.ts` | `visibleVolatile` on read, `apiPlaceView` on `/api/v1` (incl. `loadApiTrip`; inside the idempotent callback in the POST route); `loadTrip` filters places/segments by the trip's day ids in SQL; edit page passes `lat`/`lng`/`placeIdExternal` (bug fix) and a hidden `formBase` |
| `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `.gitignore`, `docs/superpowers/plans/2026-10-20-google-maps-links.md`, `docs/superpowers/plans/2026-09-17-mcp-server-byo-agent.md` | Docs |

## Task 0: Ticket and worktree

- [ ] Create a `pm` ticket "Maps: Google switch stage A" and note its id `TP-XXXX`.
- [ ] Set up the worktree:
  - `git fetch origin && git worktree add ../travel-planner-v2-maps-switch -b feat/maps-google-switch origin/main`
  - `cd ../travel-planner-v2-maps-switch/app && pnpm install`
  - `pnpm test 2>&1 | tail -3` → all pass (baseline).

### Task 1: Maps config

**Files:** Create `app/src/lib/maps/config.ts`, `config.test.ts`

**Produces:**
```ts
export type MapsConfig = {
  provider: 'google' | 'open';
  googlePlaces: boolean;                  // provider==='google' && (serverKey || fake)
  staticMap: 'google' | 'geoapify' | null;
  geoapifyKey: string;
  google: { serverKey: string; signingSecret: string; caps: { full: number; basic: number; autocomplete: number }; fake: boolean };
};
export function readMapsConfig(env?: Record<string, string | undefined>, warn?: (m: string) => void): MapsConfig;
export const MAPS_CONFIG: MapsConfig;   // 'server-only'; readMapsConfig(process.env)
```

- [ ] **Step 1: Failing tests:**
  - `{}` → `{ provider:'open', googlePlaces:false, staticMap:null }`
  - `{ GEOAPIFY_API_KEY:'G' }` → `staticMap:'geoapify'`, `geoapifyKey:'G'`
  - `{ MAPS_PROVIDER:' Google ', GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X' }` → `provider:'google'`, `googlePlaces:true`, `staticMap:'google'`
  - google without a key → `googlePlaces:false`, and `warn` is called once matching `/GOOGLE_MAPS_API_KEY/`
  - **Stage A gate:** google with key and secret, `NODE_ENV:'production'` → `provider:'open'`, `googlePlaces:false`, `staticMap` not `'google'`; `warn` matches `/Stage B/`
  - google with a key but no secret, `NODE_ENV:'development'` → `googlePlaces:true`; `staticMap` is `'geoapify'` if G is set, else `null`; `warn` matches `/SIGNING_SECRET/`
  - all other google-mode cases in this list use `NODE_ENV:'development'`
  - `MAPS_PROVIDER:'gogle'` → `provider:'open'`, and `warn` matches `/MAPS_PROVIDER/`
  - open ignores Google keys: `{ GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X' }` → `googlePlaces:false`, `staticMap:null`
  - caps (any positive integer, including 1): unset → `{ full:30, basic:80, autocomplete:300 }`; `'25'` → `25`; `'0'`, `'-3'`, `'abc'` and `'2.5'` → the default
  - fake: `{ MAPS_PROVIDER:'google', GOOGLE_PLACES_FAKE:'1', NODE_ENV:'development' }` → `googlePlaces:true`, `fake:true`; the same with `NODE_ENV:'production'` → `googlePlaces:false`, `fake:false`
- [ ] **Step 2:** `pnpm vitest run src/lib/maps` → FAIL.
- [ ] **Step 3:** Implement. Trim and lowercase the provider value. `warn` defaults to `console.warn`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(maps): MAPS_PROVIDER config with per-part fallback [TP-XXXX]`.

### Task 1b: Place types

**Files:** Modify `app/src/lib/places/types.ts`, `app/src/lib/places/geoapify.ts` (details parser), `app/src/lib/places/search.ts` (`withTz` only), plus whatever `pnpm typecheck` flags.

**Produces** (Tasks 2–5 import these):
```ts
export type Fields = 'basic' | 'full';
PlaceSuggestion.lat: number | null; PlaceSuggestion.lng: number | null;
type PlaceDetail = Omit<PlaceSuggestion,'lat'|'lng'> & { lat: number; lng: number; phone; website; hours; rating: number | null; reviews: number | null };
type Located = PlaceSuggestion & { lat: number; lng: number };
```

- [ ] **Step 1:** Make the type changes above. The Geoapify details parser sets `rating: null, reviews: null`. `withTz` returns the suggestion unchanged when `lat == null` (`timeZoneAt` takes `number`, `tz-lookup.ts:4`). Add a `search.test.ts` case: a suggestion with `lat:null` gets `timeZone:null` and no throw.
- [ ] **Step 2:** Run `pnpm typecheck 2>&1 | grep error`. Fix each error with the smallest guard that keeps today's behaviour; Geoapify and Photon suggestions always have coords, so a `!= null` guard or a non-null assertion with a `// Task 5` comment is fine. Task 5 replaces these with real handling. Update `client.test.ts:20`'s `toEqual` to include `rating:null, reviews:null`.
- [ ] **Step 3:** Run `pnpm test 2>&1 | tail -3` and `pnpm typecheck 2>&1 | tail -3` → clean.
- [ ] **Step 4:** Commit `refactor(places): nullable suggestion coords, Fields, rating/reviews on details [TP-XXXX]`.

### Task 2: Google Places (New) REST client

**Files:** Create `app/src/lib/places/google.ts`, `google-fake.ts`, `google.test.ts`, `__fixtures__/google-autocomplete.json`, `__fixtures__/google-details-full.json`, `__fixtures__/google.md`; modify `kind.ts`, `kind.test.ts`

**Produces:**
```ts
// Fields lives in types.ts: export type Fields = 'basic' | 'full';
export const GOOGLE_MASKS: Record<Fields, string>;
export const GOOGLE_BIAS: { lat: number; lng: number; radius: number }; // 13.75, 100.5, 50000
export class GoogleHttpError extends Error { status: number }        // status 0 = timeout/network
export function googleAutocomplete(q: string, o: { key: string; lang: 'th'|'en'; session: string | null; fetchImpl: typeof fetch; timeoutMs?: number }): Promise<PlaceSuggestion[]>;
export function googleDetails(id: string, o: { key: string; lang: 'th'|'en'; session: string | null; fields: Fields; fetchImpl: typeof fetch; timeoutMs?: number }): Promise<PlaceDetail | null>;
export function isValidGoogleId(id: string): boolean;  // /^[A-Za-z0-9_-]{1,256}$/
// google-fake.ts ('server-only'): export function fakeGoogleFetch(): typeof fetch; serves the two fixtures by URL
// kind.ts
export function kindFromGoogleTypes(types: readonly string[] | undefined): Kind;
```

- [ ] **Step 1: Fixtures**, hand-written from the documented shapes. `google.md` lists the doc URLs and says "hand-written; replace with live capture in Stage B".
  - **Autocomplete:** two suggestions.
    - A `placePrediction`: `placeId: "ChIJfakeJayFai0001"`, `text.text`, `structuredFormat.mainText.text: "Jay Fai"`, `structuredFormat.secondaryText.text: "Maha Chai Rd, Bangkok"`, `types: ["restaurant","food","point_of_interest"]`.
    - A `queryPrediction`.
  - **Details full:** `id`, `displayName: {text:"Jay Fai"}`, `formattedAddress`, `location: {latitude:13.7524, longitude:100.5045}`, `types`, `utcOffsetMinutes:420`, `nationalPhoneNumber`, `websiteUri`, `regularOpeningHours.weekdayDescriptions` (7 strings), `rating:4.4`, `userRatingCount:1234`.
- [ ] **Step 2: Failing tests:**
  - **autocomplete:**
    - It POSTs `https://places.googleapis.com/v1/places:autocomplete` with header `X-Goog-Api-Key: K` and `cache:'no-store'`.
    - The JSON body is `{ input:'jay fai', languageCode:'th', sessionToken:'S', locationBias:{ circle:{ center:{ latitude:13.75, longitude:100.5 }, radius:50000 } } }`. With `session:null` the body has no `sessionToken` key.
    - It returns 1 item (the `queryPrediction` is dropped): `{ id:'ChIJfakeJayFai0001', name:'Jay Fai', secondary:'Maha Chai Rd, Bangkok', address:null, lat:null, lng:null, kind:'food', timeZone:null }`.
  - **details basic:**
    - It GETs `…/v1/places/ChIJabc?languageCode=en&sessionToken=S`, with `X-Goog-FieldMask === GOOGLE_MASKS.basic`.
    - The result has `lat:13.7524`, `lng:100.5045`, and `phone`, `website`, `hours`, `rating`, `reviews` all `null`, even if the response carries them.
  - **details full:** `hours === weekdayDescriptions.join('; ')` (the format the pre-#57 code wrote), `rating:4.4`, `reviews:1234`.
  - **masks:** `GOOGLE_MASKS.basic === 'id,formattedAddress,location,types'` exactly (no `displayName`, no `utcOffsetMinutes`). A basic response without `displayName` parses to `name: ''`.
  - **ids:** `'../x'`, `'a/b'`, `'a?b'`, `''` and a 257-char id resolve to `null` without calling fetch (`/^[A-Za-z0-9_-]{1,256}$/`).
  - **errors:**
    - A 403 rejects with `GoogleHttpError` and `status 403`.
    - A network error rejects with `status 0`. So does a **real** timeout: use a `fetchImpl` that never resolves until its `signal` aborts, with the timeout set to 1 ms through an optional `timeoutMs` in the options. That rejection is a `TimeoutError`, not an `AbortError`.
    - Details without `location` → `null`.
  - **fake:** `fakeGoogleFetch()` answers both URLs with the fixtures, and answers anything else with 404.
  - **`kindFromGoogleTypes`:** `['lodging']`→hotel, `['cafe']`→food, `['train_station']`→transit, `undefined`→sight. Port the list from `git show f093d91^:app/src/lib/places-adapter.ts`.
- [ ] **Step 3:** Run `pnpm vitest run src/lib/places/google src/lib/places/kind` → FAIL.
- [ ] **Step 4:** Implement. Use `AbortSignal.timeout(o.timeoutMs ?? 1500)` for autocomplete and `o.timeoutMs ?? 3000` for details. **Any** rejection from `fetchImpl` becomes `GoogleHttpError(0)`; a non-2xx becomes `GoogleHttpError(res.status)`. There is no `withTz` here. `Fields` is imported as a type from `types.ts`.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(places): Google Places (New) REST client and parsers [TP-XXXX]`.

### Task 3: Google-first step in search (budget, breaker)

**Files:** Modify `app/src/lib/places/search.ts`, `search.test.ts`, `app/src/lib/places/rate-limit.ts` (export `Consume`). Create `app/src/lib/places/search.routes.test.ts`.

**Produces:**
```ts
// search.ts — existing positional shape kept
type Deps = { key?: string; fetchImpl?: typeof fetch; config?: MapsConfig; session?: string | null; fields?: Fields;
              consume?: Consume; now?: () => number };
export function searchPlaces(q: string, deps?: Deps): Promise<PlaceSuggestion[]>;
export function getPlaceDetail(id: string, lang: 'th'|'en', deps?: Deps): Promise<PlaceDetail | null>;
export function __resetGoogleState(): void; // test-only: clears trippedUntil and budgetExhaustedUntil
```

- [ ] **Step 1: Failing search tests.** Leave the existing ones as they are.
  - Config resolution: `cfg = deps.config ?? (deps.key !== undefined ? readMapsConfig({ GEOAPIFY_API_KEY: deps.key }) : MAPS_CONFIG)`. So legacy tests that pass `key` stay open, while the **routes (no deps) get `MAPS_CONFIG`**.
  - Use `gcfg = readMapsConfig({ MAPS_PROVIDER:'google', GOOGLE_MAPS_API_KEY:'S', GOOGLE_MAPS_URL_SIGNING_SECRET:'X', GEOAPIFY_API_KEY:'K', NODE_ENV:'test' })` and a router that also handles `googleapis`.
  - In every Google case, inject `consume` and `now`, and call `__resetGoogleState()` in `beforeEach`.
  - **Routes get MAPS_CONFIG**, in its own file `search.routes.test.ts`.
    - It has a top-level `vi.mock('@/lib/maps/config', async (orig) => { const m = await orig<typeof import('@/lib/maps/config')>(); return { ...m, MAPS_CONFIG: m.readMapsConfig({ MAPS_PROVIDER:'google', GOOGLE_MAPS_API_KEY:'S' }) }; })`.
    - It then calls `searchPlaces('x', { fetchImpl, consume })` with no `config` → Google is called.
  - **open never calls Google:** with the default config, no `googleapis` URL is called, even when the router would answer it.
  - **google first:** with `gcfg`, Google's results are returned and Geoapify is not called.
  - **google empty → Geoapify:** Google returns `{suggestions:[]}` → Geoapify's results come back.
  - **Original incident:** Google answers 403.
    - The first call returns Geoapify's results.
    - A second call within 10 minutes (`now` + 9 min) does not call Google.
    - At `now` + 10 min it calls Google again.
  - **A timeout trips the breaker:** Google rejects with `GoogleHttpError(0)` → Geoapify; the next call skips Google.
  - **`details denial stops google autocomplete`:**
    - `consume('gplaces:details:full', 30, 86400)` returns `{ ok:false, retryAfter: 3600, limit: 30 }` → `getPlaceDetail` returns `null`.
    - The next `searchPlaces` (at `now` + 1 min) does not call Google or `consume('gplaces:autocomplete', …)`.
    - At `now` + 3600 s it calls Google again.
  - **Autocomplete budget:** `consume('gplaces:autocomplete', 300, 86400)` is called **exactly once** per Google autocomplete. If it returns `{ok:false}`, Google is not fetched.
  - **Fake mode:** `gcfg` with `fake:true` → `consume` is never called, by search or by details, and the results come from the fixtures.
  - **The limiter fails open:** when `consume` throws, Google is still called.
  - **Details errors trip the breaker:** a Google details 403 or timeout → `null`, and the next `searchPlaces` skips Google.
  - **details:**
    - A bare id under `gcfg` → `consume('gplaces:details:<fields>', cap, 86400)` once, then Google details with `deps.fields ?? 'basic'`, and the result gets `withTz` applied (`timeZone:'Asia/Bangkok'`).
    - An invalid id (`'a/b'`) → `null`, with **no** consume and no fetch.
    - An open breaker → `null`, with no consume.
    - A bare id under the open config → `null`, with no fetch.
    - `geoapify:` and `osm:` ids keep today's behaviour.
    - If the details budget is denied → `null`.
  - **`withTz`** leaves `lat:null` suggestions untouched (`timeZone:null`).
- [ ] **Step 2:** Run `pnpm vitest run src/lib/places` → FAIL.
- [ ] **Step 3:** Implement in `search.ts`.
  - Add `async function tryGoogle(...)` before the existing body. It returns `[]` if `!cfg.googlePlaces`, if `now() < trippedUntil`, if `now() < budgetExhaustedUntil`, or if `consume(autocomplete)` is not ok. Fake mode skips the consume.
  - Export `isValidGoogleId` from `google.ts` and call it in `getPlaceDetail` before consuming.
  - Use `cfg.google.fake ? fakeGoogleFetch() : fetchImpl`.
  - Set `lang = queryLang(q)`, as the Geoapify path does (`search.ts:19`). Test: `'ร้านเจ๊ไฝ'` sends `languageCode:'th'`, and `'jay fai'` sends `'en'`.
  - In `tryGoogle` **and** in the Google branch of `getPlaceDetail`, a `GoogleHttpError` with status `0`, `403` or `429` trips the breaker (`trippedUntil = now() + 600_000`). Any error returns `[]`.
  - The existing Geoapify → Photon code runs only when `tryGoogle` returns `[]`. Its lines stay as they are, apart from reading the key from `deps.key ?? cfg.geoapifyKey`.
- [ ] **Step 4:** Run → PASS, then `pnpm typecheck 2>&1 | tail -3`.
- [ ] **Step 5:** Commit `feat(places): Google-first search with breaker and daily budgets [TP-XXXX]`.

### Task 4: Static map provider switch

**Files:** Modify `app/src/lib/static-map.ts`, `static-map.test.ts`, `app/src/app/trip/[id]/opengraph-image.tsx` (comment only)

**Produces:** `buildStaticMapUrl(points, opts?, cfg: MapsConfig = MAPS_CONFIG)` and `fetchStaticMapDataUri(points, opts?, cfg?)`, with today's names and return types. `markerColor` stays `#RRGGBB`.

- [ ] **Step 1: Failing tests.** The existing Geoapify tests pass a config with `staticMap:'geoapify'`, and their assertions stay unchanged. New tests:
  - `staticMap:null` → `null`
  - **Google URL:**
    - It starts with `https://maps.googleapis.com/maps/api/staticmap?` and has `size=600x315` and `scale=2`.
    - The decoded `markers` starts with `size:mid|color:0xE4572E|` (the `#` becomes `0x` and is **uppercased**).
    - It has no `center` and no `zoom`.
  - Google samples down to 12 markers, keeping the first and last, and drops `(0,0)`.
  - Google signature: port `git show f093d91^:app/src/lib/static-map.test.ts` lines 74-88. It recomputes the HMAC-SHA1 over `pathname + search`.
  - `fetchStaticMapDataUri` with a Google config calls fetch with `next.revalidate === 86400`, and the Geoapify config keeps its 7-day `next.revalidate`. Use a stubbed `global.fetch` and inspect the init.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Rename the current builder to `buildGeoapifyUrl`, restore `buildGoogleUrl` and `sign` from `git show f093d91^:app/src/lib/static-map.ts`, and dispatch on `cfg.staticMap`, reading keys from `cfg`.
- [ ] **Step 4:** Run `pnpm vitest run src/lib/static-map` → PASS.
- [ ] **Step 5:** In `opengraph-image.tsx`, change the comment "bounds Geoapify Static Maps calls" to "bounds static-map provider calls".
- [ ] **Step 6:** Commit `feat(og): signed Google Static Maps behind MAPS_PROVIDER [TP-XXXX]`.

### Task 5: Session, nullable coords, pick helpers, pickers, attribution

**Files:**
- Modify `lib/places/client.ts` (+test), `components/use-place-search.ts`, both `/api/places/*` routes, `components/search-attribution.tsx`, and the 5 pickers.
- Create `lib/places/session.ts` (+test) and `lib/places/pick.ts` (+test).

**Produces:**
```ts
// types.ts: Fields, nullable coords, PlaceDetail rating/reviews, Located all come from Task 1b
// session.ts
export function newSessionToken(rand?: (b: Uint8Array) => Uint8Array): string;   // v4 via getRandomValues
// client.ts
export function fetchSuggestions(q: string, signal?: AbortSignal, session?: string | null): Promise<PlaceSuggestion[]>; // new param trailing
export function resolvePlace(s: PlaceSuggestion, o?: { session?: string | null; fields?: Fields }): Promise<PlaceDetail | null>; // o optional: existing 1-arg calls in client.test.ts:16,20,25 compile
export function ensureCoords(s: PlaceSuggestion, session: string | null): Promise<Located | null>; // keeps detail's timeZone
// pick.ts (pure; deps injected)
export function hotelSelectionFrom(s: PlaceSuggestion, ensure: (s: PlaceSuggestion) => Promise<Located | null>): Promise<HotelSelection | null>;
export function transportSelectionFrom(s: PlaceSuggestion, ensure: ...): Promise<PlaceSelection | null>;
export function hotelFormFrom(s: Located): Record<string, string>;            // name,address,lat,lng,placeIdExternal
export function placeFormFrom(p: PlaceDetail): Record<string, string>;        // + phone,website,hours,rating?,reviews?
// use-place-search.ts adds to its return value
takeSession(): string | null;   // returns the current token and clears it synchronously
// search-attribution.tsx
export function SearchAttribution({ results }: { results: PlaceSuggestion[] }): JSX.Element;
```
Move `HotelSelection` and `PlaceSelection` (`hotel-place-picker.tsx:22`, `transport-place-picker.tsx:23`) into `pick.ts`. The pickers **re-export** them (`export type { HotelSelection } from '@/lib/places/pick'`) so `hotel-form-client.tsx:12` and `transport-form-client.tsx:10` keep compiling.

- [ ] **Step 1: Failing tests.**
  - **`session.test.ts`:**
    - The output matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.
    - Two calls differ.
    - It does not reference `randomUUID`; assert this by stubbing `globalThis.crypto` with only `getRandomValues`.
  - **`client.test.ts`** (stubbed `global.fetch`):
    - `fetchSuggestions('x', undefined, 'S')` requests `/api/places/autocomplete?q=x&session=S`. With no session there is no `session` param.
    - (The `client.test.ts:20` `toEqual` update was done in Task 1b.)
    - `resolvePlace` for a geoapify suggestion → `/api/places/details?id=geoapify%3Aabc&lang=en&session=S&fields=full`. If that fails, it returns base details carrying the suggestion's coords and `rating:null`, `reviews:null`.
    - `resolvePlace` for a Google suggestion (`lat:null`) → details coords. If details fails → `null`.
    - `resolvePlace` for `osm:` → no fetch, returns base.
    - `ensureCoords`:
      - With coords present → the same object, no fetch.
      - With `lat:null` → `fields=basic`, and it returns `{...s, lat, lng, address, timeZone}` taken from the detail.
      - If that fails → `null`.
  - **`pick.test.ts`:**
    - `hotelSelectionFrom` with a Google suggestion uses the coords from `ensure`, and `null` from `ensure` → `null`.
    - `transportSelectionFrom` with a Google suggestion has its `utcOffsetMinutes` computed from the ensured `timeZone` (`Asia/Bangkok` → 420); copy how `transport-place-picker.tsx:79` computes it today.
    - `hotelFormFrom` never emits the string `"null"`.
    - `placeFormFrom` adds `rating` and `reviews` only when they are non-null.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `session.ts`, `client.ts` and `pick.ts`, and replace Task 1b's `// Task 5` guards. Then grep **every** consumer and check each one by hand, because the type check will not catch `String(null)` or fields that are already nullable: `rg -n "PlaceSuggestion|\.lat\b|\.lng\b" src/components src/lib/places`.
- [ ] **Step 4: Routes.**
  - Both routes read `session`: keep it only if it matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`, else `null`.
  - The details route reads `fields`: `'full'` stays `'full'`, anything else becomes `'basic'`.
  - Pass both through `deps`. The rate limiting and response shape stay unchanged.
- [ ] **Step 5: Hook.**
  - The token lives in a ref and is created lazily with `newSessionToken()` before the first fetch.
  - `takeSession()` returns it and sets the ref to `null` in one synchronous step; `reset()` also clears it.
  - The token goes on every autocomplete call.
- [ ] **Step 6: Pickers.** Each picker gets a `pickSeq` stale guard around its await, using the same pattern as `place-autocomplete.tsx:61,76-78`.
  - **Every pick starts with `const tok = takeSession();` before its first await**, so no branch (stale, null or error) can leave a token that has already been ended.
  - While a pick is awaiting, the picker disables its input and calls `onBusyChange?(busy)`.
    - `place-search-picker` and `hotel-search-picker` already have this prop; add it to `hotel-place-picker` and `transport-place-picker`.
    - `hotel-form-client` disables its `SubmitButton` while busy. `transport-form-client` has **two** pickers (`:319`, `:344`), so it disables on `fromBusy || toBusy`.
    - Every exit path (success, `null`, stale, throw) must clear busy:
      - `place-search-picker`: a `null` resolve also clears `pendingId`, since `busy = pendingId !== null`.
      - `hotel-search-picker`: `busy` covers the pending `ensureCoords`, not only `isPending` (`:100`).
  - **`place-search-picker`:**
    - `resolvePlace(s, { session: tok, fields:'full' })`.
    - On `null`, show the new copy **"Couldn't load that place. Try another result."** in the picker's existing error slot.
    - `submitPlace` uses `placeFormFrom`.
  - **`place-autocomplete`:**
    - Always `basic`. New prop `resolve?: boolean`, default `true`. `trip-create-form.tsx` passes `false` and **changes line 56** from `s.address || s.name` to `s.address || s.secondary || s.name` (a Google suggestion has `address:null`) and `createTripAction` reads no coords, so a destination pick never calls details and never shows the error path.
    - On `null`: keep the input text, **clear** the hidden `address`, `lat`, `lng` and `placeIdExternal` (otherwise the previous pick's coords and id get saved with the new name through `actions/places.ts:62-64`), do not call `onSelect`, and show the same copy.
  - **`hotel-search-picker`:**
    - `const c = await ensureCoords(s, tok);`
    - On `null`, show the same copy. Otherwise use `hotelFormFrom(c)` in `submitHotel`, and call `setDatesFor(c)`.
  - **`hotel-place-picker`** and **`transport-place-picker`:** `hotelSelectionFrom` / `transportSelectionFrom` with `tok`. On `null`, show the same copy.
  - **Preview modals:** `place-preview-modal.tsx:74` and `hotel-preview-modal.tsx:74` pass `placeIdExternal: prediction.id` to `gmapsSearchUrl`, so a Google suggestion with no coords opens the exact place.
  - **All 5:** `<SearchAttribution results={results} />`. It shows Google's text when `results.some(r => placeProvider(r.id) === 'google')`.
- [ ] **Step 7:** Run `pnpm test 2>&1 | tail -3`, `pnpm typecheck 2>&1 | tail -3` and `pnpm lint 2>&1 | tail -3` → clean.
- [ ] **Step 8: Browser check, two modes.** Run `pnpm dev`, which serves on 3210 and uses `AUTH_BYPASS=true`. In each mode, add a place, a hotel and a transport stop through search.
  - **open** (`MAPS_PROVIDER` unset):
    - Every pick saves with coords.
    - There are no requests to `googleapis`.
    - The attribution is Geoapify.
  - **fake** (`MAPS_PROVIDER=google GOOGLE_PLACES_FAKE=1`):
    - Typing anything returns "Jay Fai", and the attribution reads "Google Maps".
    - The place pick saves with coords, a phone number and rating 4.4.
    - The hotel and transport picks save with coords, and transport has a UTC offset.
    - The network tab shows the same `session=` on the autocomplete calls and on the one details call, with `fields=full` coming only from the place picker.
    - After a pick, the next search sends a **new** `session=`. The single-token-per-pick race is covered by the `takeSession` unit test, not by this browser check; typing is disabled while a pick is in flight.
- [ ] **Step 9:** Commit `feat(places): session tokens, Google-safe picks, rating, attribution [TP-XXXX]`.

### Task 5b: Expiring Google data — columns, write rules, read filter, purge cron

Implements [the resync design](../specs/2026-10-23-google-place-resync-design.md) §2–§3 and §5 (Stage A scope). No Google call. Runs in both modes.

**Files:**
- Modify `app/src/db/schema.ts` (`places`: 5 columns). Create `app/drizzle/0016_*.sql` (generated DDL), `app/drizzle/0017_google_volatile_backfill.sql` (custom), `app/drizzle/meta/*`.
- Create `app/src/lib/places/google-sync.ts` + `google-sync.test.ts` (pure; no `db` / `server-only` imports, type-only imports allowed).
- Modify `app/src/lib/places/pick.ts` + `pick.test.ts` (`googlePickJson`; `placeFormFrom` emits it), `app/src/components/place-autocomplete.tsx` (hidden `googlePick` input; `fillAddressInput` prop; `inputRef` on the name input), `app/src/components/place-form.tsx` (passes `fillAddressInput="address"`).
- Modify `app/src/lib/services/place-service.ts` (`addPlace` / `updatePlace` opts; `updatePlace` gains `exec`), `app/src/app/actions/places.ts` (read `googlePick`, `formBase`).
- Modify `app/src/lib/trip-queries.ts` (SQL day-id filter, `loadApiTrip` → `apiPlaceView`); extend `app/src/app/api/v1/days/[dayId]/places/route.integration.test.ts`.
- Create `app/src/lib/services/google-sync-service.ts` (`server-only`) + `google-sync-service.integration.test.ts`.
- Create `app/src/app/api/internal/purge-google-volatile/route.ts` + `route.test.ts`; modify `app/vercel.json`.
- **Read paths** (every place that sends place rows out; found by `rg -n "from\(places\)"` and checking which selects return `rating`/`reviews`/`hours`):
  - `app/src/lib/trip-queries.ts` `loadTrip` (`allPlaces`, ~line 193). Covers the itinerary page, the trip layout map, every page under `/trip/[id]`, and through `loadApiTrip` also `GET /api/v1/trips/:tripId` and the `POST /api/v1/trips/import` response. `loadApiTrip` additionally maps every place through `apiPlaceView`.
  - `app/src/app/trip/[id]/place/[placeId]/edit/page.tsx`
  - `app/src/app/api/v1/places/[placeId]/route.ts` (PATCH response; raw row today → `apiPlaceView`)
  - `app/src/app/api/v1/days/[dayId]/places/route.ts` (POST response; raw row today → `apiPlaceView`, applied **inside** the `withIdempotencyAtomic` callback at lines 18–26, so the stored idempotency body — which a replay returns verbatim — is already stripped)
  - There is no shared API place serializer today (the routes return raw rows via `apiJson`); `apiPlaceView` becomes it for these three paths.
  - **Not affected** (no rating/reviews/hours selected): `ics-queries.ts`, `opengraph-image.tsx`, `segment-service.ts`, `access.ts`, the `idx` select in `place-service.ts`.

**Consumes:** `Fields`, `PlaceDetail` (Task 1b); `placeFormFrom` (Task 5); `isGooglePlaceId` (`place-id.ts`); `PlaceFields` (`place-service.ts`); `IdemExecutor` (`lib/api/idempotency.ts`).

**Produces:**
```ts
// schema.ts — places, all nullable, timestamp({ mode:'date' }) like the other columns
ratingSyncedAt: timestamp('rating_synced_at'), hoursSyncedAt: timestamp('hours_synced_at'),
googleSyncedAt: timestamp('google_synced_at'), googleSnapshot: jsonb('google_snapshot').$type<GoogleSnapshot>(),
googleStatus: text('google_status').$type<GoogleStatus>(),

// google-sync.ts
export const VOLATILE_TTL_MS = 30 * 86_400_000;
export const VOLATILE_GROUPS = { rating: ['rating', 'reviews'], hours: ['hours'] } as const; // synced col: ratingSyncedAt / hoursSyncedAt
export type GoogleStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'NOT_FOUND' | 'INVALID'; // INVALID is written by Stage C only
export type GoogleSnapshot = { name: string; address: string | null; lat: number; lng: number; phone?: string | null; website?: string | null }; // never rating/reviews/hours
export type GooglePick = { fields: Fields; snapshot: GoogleSnapshot };
export type SyncColumns = { ratingSyncedAt: Date | null; hoursSyncedAt: Date | null; googleSyncedAt: Date | null; googleSnapshot: GoogleSnapshot | null; googleStatus: GoogleStatus | null };
export type VolatileRow = { rating: number | null; reviews: number | null; hours: string | null; ratingSyncedAt: Date | null; hoursSyncedAt: Date | null };
export type StoredSync = VolatileRow & Pick<SyncColumns, 'googleSnapshot' | 'googleSyncedAt' | 'googleStatus'> & { placeIdExternal: string | null };
export function visibleVolatile<T extends VolatileRow>(row: T, now: Date): T;          // new object; expired group values → null
export function parseGooglePick(raw: unknown): GooglePick | null;                       // JSON string from the form; junk → null
export function googleSyncOnAdd(f: Pick<PlaceFields, 'rating'|'reviews'|'hours'|'placeIdExternal'>, pick: GooglePick | null, now: Date): SyncColumns;
export type UpdatePatch = Partial<SyncColumns & Pick<PlaceFields, 'rating'|'reviews'|'hours'|'phone'|'website'>>; // value keys only when a re-pick clears the old place's data
export function googleSyncOnUpdate(stored: StoredSync, f: Pick<PlaceFields, 'rating'|'reviews'|'hours'|'placeIdExternal'|'phone'|'website'>, pick: GooglePick | null, now: Date, base?: FormBase | null): UpdatePatch;
// formBase: the Google-tracked values the edit form rendered (from the visibleVolatile row)
export type FormBase = Pick<PlaceFields, 'name'|'address'|'phone'|'website'|'lat'|'lng'|'placeIdExternal'|'rating'|'reviews'|'hours'>;
export function formBaseJson(row: FormBase): string;   // normalizes first, like readPlaceFields reads the rendered inputs (see Rules)
export const FORM_BASE_MAX = 16_000;
export function parseFormBase(raw: unknown, warn: (msg: string) => void = console.warn): FormBase | null; // junk → null; > FORM_BASE_MAX chars → null + one warn
export type Unit = 'name' | 'address' | 'phone' | 'website' | 'location' | 'rating' | 'hours';
export const UNIT_FIELDS = { name: ['name'], address: ['address'], phone: ['phone'], website: ['website'],
  location: ['lat', 'lng', 'placeIdExternal'], rating: ['rating', 'reviews'], hours: ['hours'] } as const;
// A unit is untouched iff every one of its f values === base's. base null → empty set (API path: everything is written).
export function untouchedUnits(submitted: FormBase, base: FormBase | null): Set<Unit>;
export function omitUnits<F extends FormBase>(f: F, units: Set<Unit>): Partial<F>;   // new object without those units' keys; non-unit keys (kind, notes, …) kept
const API_HIDDEN = ['googleSnapshot', 'ratingSyncedAt', 'hoursSyncedAt', 'googleSyncedAt'] as const;
export function apiPlaceView<T extends VolatileRow>(row: T, now: Date): Omit<T, (typeof API_HIDDEN)[number]>; // visibleVolatile, then drop API_HIDDEN

// pick.ts
export function googlePickJson(p: PlaceDetail, fields: Fields): string | null;   // null unless isGooglePlaceId(p.id)

// place-autocomplete.tsx — new optional prop (string, so a server component can pass it) + `inputRef` on the visible name input (today only `wrapRef` exists)
fillAddressInput?: string;   // on a successful pick: const el = inputRef.current?.form?.elements.namedItem(fillAddressInput); if (el instanceof HTMLInputElement) el.value = place.address ?? ''

// place-service.ts (new params trailing; existing call sites compile)
addPlace(userId, dayId, fields, exec = db, opts?: { googlePick?: GooglePick | null; now?: Date })
updatePlace(userId, placeId, fields, opts?: { googlePick?: GooglePick | null; formBase?: FormBase | null; now?: Date }, exec: IdemExecutor = db)

// google-sync-service.ts ('server-only')
export async function purgeExpiredVolatile(now: Date, exec?: IdemExecutor): Promise<{ rating: number; hours: number }>;
```

**Rules** (design §3; the tests below pin them):
- **Expired** means `syncedAt < now − VOLATILE_TTL_MS` (strict). Groups are independent.
- **Add:** no pick, or `!isGooglePlaceId(f.placeIdExternal)` → all five null. Otherwise `googleSnapshot = pick.snapshot`, and, **only when `pick.fields === 'full'`**, `googleSyncedAt = now` and each group whose values are not all null gets `syncedAt = now`. A `basic` pick never marks rating/hours as Google's (the form user typed them) and sets `googleSyncedAt = null`, so the Stage C cron (`google_synced_at` nulls first) fetches the full data the next night — one Enterprise call, inside its 20/day cap.
- **Update:** per group, compare the submitted values with a reference — `base` when the web form sent a valid `formBase`, else `visibleVolatile(stored, now)` (what the user saw; API PATCH). Different → `syncedAt: null` (now the user's, permanent). Equal → omit, except, **without `base` only**, when the submitted group is all null → `syncedAt: null`. Then the id rule, with `refId = base ? base.placeIdExternal : stored.placeIdExternal`:
  - `f.placeIdExternal !== refId` → `googleSnapshot = pick?.snapshot ?? null`, `googleSyncedAt = pick?.fields === 'full' ? now : null` (a `basic` pick queues the row for the next resync, as on add), `googleStatus = null`. **If this change came with a `pick`** (a different place was picked), the old place's Google data must not ride along under the new snapshot: each volatile group whose stored `*SyncedAt` is non-null **and** that is untouched in the form (equal to the reference above) gets its values and `*SyncedAt` set to `null`; `phone` / `website` are set to `null` when untouched (equal to `base`'s, or with no `base` just the next check) **and** equal to the old `stored.googleSnapshot` value (a key the snapshot lacks never matches). A user-typed phone, a user-owned rating, or anything the user edited in this form is kept.
  - Same id and `pick` (re-picked the same place) → `googleSnapshot = { ...stored.googleSnapshot, ...pick.snapshot }` (a `basic` pick has no `phone`/`website` keys, so the stored ones survive), `googleSyncedAt = pick.fields === 'full' ? now : null`.
- **Stale form (`formBase`):** the edit page renders `formBase = formBaseJson(<the same visibleVolatile row as initial>)` as a hidden field. `updatePlace` leaves every unit the user did not change in this form **out of the UPDATE's `SET`** (`omitUnits(fields, untouchedUnits(fields, base))`), so whatever is in the DB at write time — e.g. a Stage C cron refresh or a purge that happened while the form was open — stays, with no extra read and no read-then-write race. `googleSyncOnUpdate` gets the **submitted** `fields` plus `base`, so an untouched unit never changes ownership. Without `formBase` (API PATCH, junk) everything is written as before. This also covers a form left open across a rating's 30-day boundary or a purge: the rating matches `base`, so it is not written and keeps the DB's current value and `syncedAt` (expired → purged as normal) instead of becoming a permanent user value.
  - **Known and accepted:** a value changed and changed back within one form is indistinguishable from untouched — harmless, the DB keeps its current value. A unit that went A → B in the DB (cron) while the form showed A keeps B: the user never saw B, so saving the unchanged A must not undo it.
- **`formBase` normalization:** `formBaseJson` normalizes each value exactly as the save path will read it back from the rendered form, so an untouched field compares equal. String fields rendered in a text `<input>` (`name`, `address`, `phone`, `website`, `hours` — all `type="text"` in `place-form.tsx`): remove every `\r` and `\n` character (the browser's value sanitization for text inputs strips CR/LF from `defaultValue` — removed, not replaced by a space), then `trimOrNull` (trim, `''` → `null`). `placeIdExternal` (hidden input, no sanitization): `trimOrNull` only. Numbers are passed through. Without this, a stored `hours` containing a newline (e.g. from the API) would read as "edited" on every save and become a permanent user value.
- **`formBase` size:** `parseFormBase` rejects anything longer than `FORM_BASE_MAX` (16 000 chars; long Thai `hours` text fits) and calls `warn` once — it is called once per request, so one log line per oversized save. A rejected base means the save behaves like the API path (everything written).
- **Trust:** `googlePick` is client-supplied. A forged pick can only put a TTL on the forger's own rating/hours, or a wrong snapshot that Stage C reads as "user edited" — accepted.
- **API v1** never reads `googlePick` or `formBase`: places created through the API are user-owned (all null). PATCH goes through the same update rule without `base`. PATCH is full-replace: omitting `placeIdExternal` clears the id, the snapshot and the status (current behaviour, pinned by a test). Responses expose `googleStatus` and strip `googleSnapshot` / `*SyncedAt` (`apiPlaceView`). **Accepted:** exporting a trip and re-importing it through the API turns its visible Google ratings/hours into permanent user values (the API cannot tell them apart); likewise an API agent that PATCHes a place with a rating it read before a cron refresh makes that stale rating permanent (it differs from the refreshed value).
- **Accepted (groups move together):** editing only `rating` makes the Google `reviews` beside it permanent too, and vice versa — the group has one `ratingSyncedAt`.

- [ ] **Step 1: Failing tests — `google-sync.test.ts`** (`now = new Date('2026-10-23T00:00:00Z')`, `D = 86_400_000`):
  - **`visibleVolatile`:**
    - `ratingSyncedAt = now − 29·D` → rating and reviews kept.
    - `ratingSyncedAt = now − 30·D − 1` → `rating:null, reviews:null`; `hours` (with `hoursSyncedAt = now − 1·D`) kept.
    - `ratingSyncedAt = now − 30·D` exactly → kept.
    - `hoursSyncedAt = now − 31·D` → `hours:null`; rating untouched.
    - `ratingSyncedAt: null`, `rating: 4` at `now + 3650·D` → kept (user-owned never expires).
    - Extra props (`id`, `googleSnapshot`) pass through; the input object is not mutated.
  - **`parseGooglePick`:** a valid `JSON.stringify({ fields:'full', snapshot:{ name:'Jay Fai', address:'X', lat:13.7524, lng:100.5045, phone:'02', website:'https://a' } })` round-trips. Each of these → `null`: `null`, `''`, `'{'`, a string longer than 4000 chars, `fields:'x'`, missing `snapshot`, `lat:'13'`, `lng: Infinity` (as `1e999`), `name: 5`. Unknown keys in `snapshot` (e.g. `rating`) are dropped.
  - **`googleSyncOnAdd`** (`full` = a `full` pick, `F = { rating:4.4, reviews:1234, hours:'Mon: 9–5', placeIdExternal:'ChIJa' }`):
    - `(F, null)` → all five `null`.
    - `({ ...F, placeIdExternal:'geoapify:x' }, full)` → all five `null`.
    - `(F, full)` → `ratingSyncedAt: now, hoursSyncedAt: now, googleSyncedAt: now, googleSnapshot: full.snapshot, googleStatus: null`.
    - `({ ...F, rating:null, reviews:null, hours:null }, full)` → `ratingSyncedAt:null, hoursSyncedAt:null`, snapshot set.
    - `({ ...F, hours:null }, full)` → `ratingSyncedAt: now, hoursSyncedAt: null`.
    - `(F, basicPick)` → `ratingSyncedAt:null, hoursSyncedAt:null`, `googleSnapshot: basicPick.snapshot`, `googleSyncedAt: null` (queued for the next resync).
  - **`googleSyncOnUpdate`** (`SNAP` = `{ name:'Jay Fai', address:'Old Rd', lat:13.75, lng:100.5, phone:'02' }` (no `website` key); `S` = stored `{ rating:4.4, reviews:1234, hours:'H', ratingSyncedAt: now−1·D, hoursSyncedAt: now−1·D, placeIdExternal:'ChIJa', googleSnapshot: SNAP, googleSyncedAt: now−1·D, googleStatus:'OPERATIONAL' }`; submitted `f` = S's rating/reviews/hours/id with `phone:null, website:null` unless noted):
    - Same values, no pick → `{}`.
    - `rating: 4.0` → `{ ratingSyncedAt: null }`.
    - `reviews: 1235` only → `{ ratingSyncedAt: null }`.
    - `hours: 'H2'` only → `{ hoursSyncedAt: null }` (rating stays Google's and still expires — the reason for two columns).
    - `S` with `ratingSyncedAt: now − 31·D`, submitted `rating:null, reviews:null` (the form showed blank) → `{ ratingSyncedAt: null }`.
    - Same expired `S`, submitted `rating: 4` → `{ ratingSyncedAt: null }`.
    - `placeIdExternal: 'ChIJb'` with `basicPick` (rating/hours as stored) → `{ rating:null, reviews:null, ratingSyncedAt:null, hours:null, hoursSyncedAt:null, googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null }` (the old place's Google groups are cleared; no `phone` key — `f.phone` null ≠ `'02'`; `basic` → queued for resync).
    - `placeIdExternal: 'geoapify:x'`, no pick → `{ googleSnapshot: null, googleSyncedAt: null, googleStatus: null }` (no pick → no clearing).
    - `placeIdExternal: null`, no pick → same as above.
    - Same id, `basicPick` (re-picked) → `{ googleSnapshot: { ...SNAP, ...basicPick.snapshot }, googleSyncedAt: null }` — `phone:'02'` survives in the snapshot; no `googleStatus` key, no value keys.
    - Same id, `full` pick → `{ googleSnapshot: { ...SNAP, ...full.snapshot }, googleSyncedAt: now }` (a full pick keeps `now`).
    - **With `base`** (`B` = `{ name:'Jay Fai', address:'Old Rd', phone:'02', website:null, lat:13.75, lng:100.5, placeIdExternal:'ChIJa', rating:4.4, reviews:1234, hours:'H' }`):
      - Stale form: stored `S` now has `rating:4.5, reviews:1300, placeIdExternal:'ChIJnew'` (cron refreshed after load); submitted = `B` exactly, no pick → `{}` (no ownership change, no snapshot reset).
      - Submitted `B` with `rating:4.0` → `{ ratingSyncedAt: null }`.
      - Expired `S` (`ratingSyncedAt: now−31·D`), `base.rating:null, reviews:null`, submitted the same nulls → `{}` (untouched; the purge clears it), unlike the no-base case above.
      - **Re-pick a different place, everything else untouched:** submitted `{ ...B, name:'Other', address:'New Rd', lat:13.8, lng:100.6, placeIdExternal:'ChIJb' }` with `basicPick` → `{ rating:null, reviews:null, ratingSyncedAt:null, hours:null, hoursSyncedAt:null, phone:null, googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null }` (`phone` cleared: untouched and `=== SNAP.phone`; no `website` key: `null` and SNAP has none).
      - **Re-pick a different place, user data kept:** stored `{ ...S, ratingSyncedAt: null }` (user-owned rating), `base = { ...B, phone:'01' }` (user's own phone ≠ `SNAP.phone`); submitted `{ ...base, placeIdExternal:'ChIJb', lat:13.8, hours:'H2', website:'https://mine' }` with `basicPick` → `{ hoursSyncedAt:null, googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null }` — no `rating`/`reviews`/`ratingSyncedAt` (user-owned), no `hours` (touched), no `phone` (untouched but not Google's), no `website` (touched).
      - **Re-pick the same place:** submitted `B` (same id, same coords) with `basicPick` → `{ googleSnapshot: { ...SNAP, ...basicPick.snapshot }, googleSyncedAt: null }`; no value keys, no `googleStatus` key.
  - **`parseFormBase` / `formBaseJson`:** `parseFormBase(formBaseJson(B))` deep-equals `B`; `{ ...B, hours: 'x'.repeat(10_000) }` round-trips (under the cap); `null`, `''`, `'{'`, `rating:'4'`, `lat:'13'`, `name:5` → `null`; unknown keys dropped. **Normalization:** `parseFormBase(formBaseJson({ ...B, name:'  Jay Fai ', website:'', hours:'Mon: 9–5\r\nTue: 9–5\n' }))` deep-equals `{ ...B, website:null, hours:'Mon: 9–5Tue: 9–5' }`, and `untouchedUnits({ ...B, hours:'Mon: 9–5Tue: 9–5' }, <that parsed base>)` contains `hours` (the value a browser submits for that `defaultValue`). A string of `FORM_BASE_MAX + 1` chars → `null` and the injected `warn` called exactly once; the junk cases above do not call `warn`.
  - **`untouchedUnits` / `omitUnits`:**
    - `untouchedUnits(B, B)` → all 7 units; `untouchedUnits(B, null)` → empty set.
    - `untouchedUnits({ ...B, name:'Mine' }, B)` → every unit but `name`.
    - `untouchedUnits({ ...B, lat:13.7 }, B)` → no `location` (lat, lng and id move together).
    - `untouchedUnits({ ...B, reviews:1 }, B)` → no `rating` (group moves together).
    - `omitUnits({ ...B, kind:'food', name:'Mine' }, untouchedUnits({ ...B, name:'Mine' }, B))` deep-equals `{ kind:'food', name:'Mine' }` (non-unit keys kept). `omitUnits(f, new Set())` deep-equals `f`. Inputs not mutated.
  - **`apiPlaceView`:** a row with all five sync columns set and a fresh rating → keys `googleSnapshot`, `ratingSyncedAt`, `hoursSyncedAt`, `googleSyncedAt` absent, `googleStatus` and `rating` present; an expired rating → `rating:null`.
- [ ] **Step 2: Failing tests — `pick.test.ts`:**
  - `googlePickJson(googleDetail, 'full')` parses (via `parseGooglePick`) to `{ fields:'full', snapshot:{ name, address, lat, lng, phone, website } }` taken from the detail, with no `rating`/`reviews`/`hours` keys.
  - `googlePickJson(googleDetail, 'basic')` → snapshot has only `name, address, lat, lng`.
  - `googlePickJson({ ...d, id:'geoapify:abc' }, 'full')` → `null`.
  - `placeFormFrom(googleDetail).googlePick` is the `'full'` JSON; for a Geoapify detail the key is absent.
- [ ] **Step 3:** Run `pnpm vitest run src/lib/places/google-sync src/lib/places/pick` → FAIL.
- [ ] **Step 4:** Implement `google-sync.ts` and the `pick.ts` changes. `placeFormFrom` adds `googlePick` only when `googlePickJson` is non-null.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Schema + migrations.** Before adding files, migrate a scratch DB to 0015 (`DATABASE_URL_UNPOOLED=$TEST_DATABASE_URL pnpm db:migrate`) and seed it with `psql "$TEST_DATABASE_URL"`: one trip/day and three places — `G1` (`place_id_external='ChIJg1'`, `rating=4.5`, `hours='H'`), `G2` (`'ChIJg2'`, `reviews=10`, no rating/hours), `O1` (`'geoapify:o1'`, `rating=4`, `hours='H'`).
  - Add the 5 columns to `schema.ts`, then `pnpm db:generate --name google_sync_columns` → `0016_google_sync_columns.sql` with exactly 5 `ADD COLUMN` lines and nothing else.
  - `pnpm drizzle-kit generate --custom --name google_volatile_backfill` → `0017_google_volatile_backfill.sql`; fill it with:
    ```sql
    UPDATE "place" SET "rating_synced_at" = '2000-01-01'
    WHERE "place_id_external" <> '' AND strpos("place_id_external", ':') = 0
      AND ("rating" IS NOT NULL OR "reviews" IS NOT NULL);--> statement-breakpoint
    UPDATE "place" SET "hours_synced_at" = '2000-01-01'
    WHERE "place_id_external" <> '' AND strpos("place_id_external", ':') = 0
      AND "hours" IS NOT NULL;
    ```
  - Migrate the scratch DB again → `G1` has both synced dates `2000-01-01`, `G2` only `rating_synced_at`, `O1` neither. All values still present (the purge deletes them, not the migration).
  - Note in the PR body: the first production deploy hides every legacy Google rating/hours at once, in both modes (design §2 trade-off).
- [ ] **Step 7: Write paths.**
  - `place-autocomplete.tsx`: add `<input type="hidden" name="googlePick" value={googlePick} />`. On a successful pick set it to `googlePickJson(place, 'basic') ?? ''`; on a `null` pick (Task 5 Step 6) clear it with the other hidden fields. The default is `''` (an edit page load never claims a fresh pick).
  - **Re-pick on the edit page overwrites the visible address** (`place-autocomplete.tsx:89` only sets the hidden `autoAddress`, and `readPlaceFields` in `actions/places.ts:43-55` prefers the visible `address`, so today a re-pick keeps the old visible address and Stage C would then read the address as user-edited forever). `PlaceForm` is a server component ("no client JS here"), so it cannot pass `onSelect`; instead `place-autocomplete.tsx` gets the string prop `fillAddressInput` and, on a successful pick (same place as `setAddress`), sets the named input in its own form to `place.address ?? ''`. The component has only `wrapRef` (on the wrapper `div`) today, so add `const inputRef = useRef<HTMLInputElement>(null)` on the visible name `<input>` and look the field up with `inputRef.current?.form?.elements.namedItem(fillAddressInput)` (set `.value` only when it is an `HTMLInputElement`). `place-form.tsx:114` passes `fillAddressInput="address"`. Phone, website and hours are not touched by the pick (a `basic` pick has none; a different place's old values are cleared on save by the update rule). Other `PlaceAutocomplete` users (`trip-create-form.tsx`) don't pass the prop and are unchanged.
  - **Intended behaviour change:** a pick now overwrites any address the user typed into the visible Address field before picking. `PlaceForm` is rendered only by the edit page (the add page uses `PlaceManualForm`, which has no autocomplete), so this is the only place the change shows.
  - `place-search-picker.tsx` needs no change: its `submitPlace` uses `placeFormFrom` (Task 5), which now carries `googlePick`.
  - `actions/places.ts`: `const googlePick = parseGooglePick(formData.get('googlePick'))`; pass `{ googlePick }` to `addPlace` (both add actions) and `{ googlePick, formBase: parseFormBase(formData.get('formBase')) }` to `updatePlace` (`parseFormBase` is called once per request, so its oversize warning logs at most once per save). `readPlaceFields` is unchanged, so `PlaceFields` never carries the pick or the base.
  - `place-service.ts`:
    - `addPlace`: `.values({ ...fields, ...googleSyncOnAdd(fields, opts?.googlePick ?? null, now), dayId, idx })`.
    - `updatePlace`: after `resolvePlaceWrite(userId, placeId, exec)`, select the row's `StoredSync` columns (`stored`; the sync rule needs them — no `FormBase` columns are read), then `.set({ ...omitUnits(fields, untouchedUnits(fields, base)), ...googleSyncOnUpdate(stored, fields, pick, now, base), updatedAt: now })` (`base = opts?.formBase ?? null`; the sync rule gets the **submitted** `fields`, and its value keys — only present when a re-pick clears the old place's data — override). Untouched units are simply not in `SET`, so a concurrent cron write to them survives. Pass `exec` to `resolvePlaceWrite`, the select, the update and `touchTrip`. `now = opts?.now ?? new Date()`.
  - **Edit page (pre-existing bug, needed here):** `initial` omits `lat`, `lng` and `placeIdExternal`, so every save through the edit form today writes them as null (`PlaceAutocomplete` hidden inputs default to empty). Add the three to `initial`. Without this, the update rule would read every edit as "place changed" and drop the snapshot.
  - **Edit page `formBase`:** `hidden={{ placeId, formBase: formBaseJson(v) }}` where `v` is the same `visibleVolatile` row `initial` is built from (the existing `hidden` prop; `PlaceForm` needs no change for this).
- [ ] **Step 8: Read paths.** Apply `visibleVolatile(row, new Date())` in each read path listed under **Files**:
  - `loadTrip` (`trip-queries.ts:193-197`): today the places and segments selects have **no trip filter** (they read every non-deleted place/segment in the DB and drop foreign ones in the JS loop at ~line 208). Add `inArray(places.dayId, dayIds)` / `inArray(segments.dayId, dayIds)` to the two `where`s (`inArray` is already imported; `dayIds` is non-empty there), keep the JS check, and apply `visibleVolatile` while grouping, i.e. only to this trip's places.
  - `loadApiTrip`: map each day's `places` through `apiPlaceView` (the web `loadTrip` shape is untouched).
  - Edit page: build `initial` and `formBase` from the filtered row.
  - Both v1 routes: `apiPlaceView(place, new Date())` before `apiJson` / the 201 body. In `days/[dayId]/places/route.ts` this goes **inside** the `withIdempotencyAtomic` callback (`return { status: 201, body: { place: apiPlaceView(place, new Date()) } }`, lines 18–26), not around its result: the callback's body is what gets stored for the Idempotency-Key and replayed verbatim, so stripping outside it would leak `googleSnapshot` / `*SyncedAt` on every replay. `rg -n "\.rating\b|\.hours\b|\.reviews\b" src/app src/lib` afterwards and confirm every hit reads from one of these paths.
- [ ] **Step 9: Purge — failing tests.**
  - `google-sync-service.integration.test.ts`, gated like the others (`const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip`; `postgres-js` client, `exec` injected; skips in CI — run locally before the PR). Seed a user, trip, day and places, `now = new Date('2026-10-23T00:00:00Z')`. Fixtures (this file defines its own; `addPlace` / `updatePlace` take a full `PlaceFields`, so every `fields` argument below is a complete object):
    - `F: PlaceFields = { kind:'food', name:'Jay Fai', category:null, rating:4.4, reviews:1234, time:null, duration:null, price:null, address:'Old Rd', phone:'02', website:null, hours:'H', tags:[], thumb:null, note:null, lat:13.75, lng:100.5, placeIdExternal:'ChIJa' }` (every `PlaceFields` key, `tags:[]` as `parsePlaceFields` returns).
    - `fullPick: GooglePick = { fields:'full', snapshot:{ name:'Jay Fai', address:'Old Rd', lat:13.75, lng:100.5, phone:'02', website:null } }`.
    - `base: FormBase` = the `FormBase` keys of `F` (what the edit form renders for that row). Where a test spreads `base`, the argument is `{ ...F, ...base, … }` so it stays a full `PlaceFields`.
    - `A` rating 4, reviews 9, `ratingSyncedAt = now−31d`; `B` same with `now−29d`; `C` rating 4, `ratingSyncedAt: null`; `D` `hours:'H'`, `hoursSyncedAt = now−31d`, rating 4 with `ratingSyncedAt = now−1d`; `E` like `A` but `deletedAt` set.
    - `purgeExpiredVolatile(now, exec)` → `{ rating: 2, hours: 1 }`.
    - `A` and `E`: `rating`, `reviews`, `rating_synced_at` all null. `B`, `C` unchanged. `D`: `hours` and `hours_synced_at` null, rating kept. `A.updated_at` unchanged.
    - **Write paths:** `addPlace(user, day, F, exec, { googlePick: fullPick, now })` → row has `rating_synced_at = now` and `google_snapshot` equal to `fullPick.snapshot`. Then `updatePlace(user, id, { ...F, hours:'H2' }, { now }, exec)` → `hours_synced_at` null, `rating_synced_at` still `now`, `google_snapshot` unchanged.
    - **Stale form:** `addPlace(user, day, F, exec, { googlePick: fullPick, now })`; then simulate a background refresh with a raw `UPDATE place SET name='Jay Fai 2', rating=4.5 …`; `updatePlace(user, id, { ...F, ...base, hours:'H2' }, { formBase: base, now }, exec)` → `name = 'Jay Fai 2'`, `rating = 4.5`, `rating_synced_at` unchanged, `hours = 'H2'`, `hours_synced_at` null (untouched units were not in `SET`).
    - **Re-pick a different place:** `addPlace(user, day, F, exec, { googlePick: fullPick, now })` (phone `'02'` in both row and snapshot); `basicPickB` = a `basic` pick for `'ChIJb'`; `updatePlace(user, id, { ...F, ...base, name:'Other', placeIdExternal:'ChIJb', lat:13.8 }, { formBase: base, googlePick: basicPickB, now }, exec)` → `rating`, `reviews`, `hours`, `phone` and both `*_synced_at` null; `google_snapshot` = `basicPickB.snapshot`; `google_synced_at` null (`basic` → queued for resync).
    - **PATCH full-replace (pins current behaviour):** on a place with a Google id, snapshot and `google_status 'OPERATIONAL'`, `updatePlace(user, id, parsePlaceFields({ kind:'food', name:'X' }), { now }, exec)` (`kind` is required by `parsePlaceFields`, `place-input.ts:38-44`) (the PATCH route's exact input path) → `place_id_external`, `google_snapshot`, `google_synced_at`, `google_status` all null.
  - **No new `loadTrip` test:** `loadTrip` reads through the global neon `db` and cannot be pointed at the scratch DB (see the `testLoad` note in `import-orchestrator.integration.test.ts`). The SQL day-id filter changes no output (the JS `dayIds` check stays), and `loadApiTrip`'s strip is a one-line `apiPlaceView` map covered by the unit test above; the Step 13 browser check and `curl /api/v1/trips/:id` cover both.
  - `days/[dayId]/places/route.integration.test.ts`: the 201 body's `place` has a `googleStatus` key and no `googleSnapshot` / `*SyncedAt` keys; a second POST with the same `Idempotency-Key` and body (the replay) returns the same stripped `place`.
  - `purge-google-volatile/route.test.ts` (unit, `vi.mock('@/lib/services/google-sync-service')`): no `CRON_SECRET` → 401; wrong bearer → 401 and the service is not called; right bearer → 200 `{ rating: 2, hours: 1 }` from the mocked service.
- [ ] **Step 10:** Run `TEST_DATABASE_URL=… pnpm vitest run src/lib/services/google-sync-service src/app/api/internal src/app/api/v1/days` → FAIL.
- [ ] **Step 11: Implement.**
  - `purgeExpiredVolatile`: two `UPDATE`s with `cutoff = new Date(now.getTime() - VOLATILE_TTL_MS)` — `SET rating = NULL, reviews = NULL, rating_synced_at = NULL WHERE rating_synced_at < cutoff` and `SET hours = NULL, hours_synced_at = NULL WHERE hours_synced_at < cutoff`, each `.returning({ id })` for the counts. No `deleted_at` filter, no `updated_at`, no `touchTrip`.
  - Route: copy `prune-rate-limit/route.ts` (same `CRON_SECRET` guard, `dynamic = 'force-dynamic'`), call `purgeExpiredVolatile(new Date())`, return the counts. It does **not** check `MAPS_CONFIG`.
  - `vercel.json`: add `{ "path": "/api/internal/purge-google-volatile", "schedule": "0 20 * * *" }` — 20:00 UTC = 03:00 Asia/Bangkok, at night so few edit forms are open. The plan is Hobby, which fires a cron anywhere within its hour (03:00–03:59 Bangkok) and allows 100 crons per project; nothing depends on its order relative to other crons.
- [ ] **Step 12:** Run the Step 10 command → PASS, then `pnpm test 2>&1 | tail -3`, `pnpm typecheck 2>&1 | tail -3`, `pnpm lint 2>&1 | tail -3` → clean.
- [ ] **Step 13: Browser check** (`pnpm dev`, fake mode as in Task 5 Step 8, dev DB via `pnpm db:migrate`):
  - Add "Jay Fai" through the day picker → in `pnpm db:studio` the row has `rating_synced_at`, `hours_synced_at`, `google_synced_at` set and `google_snapshot` without rating/hours.
  - `UPDATE place SET rating_synced_at = now() - interval '31 days' WHERE id = '…'` → reload: the star is gone from the place row and the edit page's rating is blank; hours still show.
  - `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3210/api/internal/purge-google-volatile` → `{"rating":1,"hours":0}`.
  - Edit page: change only the hours and save → `hours_synced_at` null, `rating_synced_at` unchanged, and `lat`/`lng`/`place_id_external` still set (bug fix).
  - Edit page re-pick: search "Jay Fai" in the name field and pick it → the visible Address input now shows the picked address; save → `address` equals `google_snapshot->>'address'` and `google_synced_at` is null (a `basic` pick; the next resync refreshes it).
  - Stale form: open the edit page, then `UPDATE place SET name = 'Jay Fai 2' WHERE id = '…'`, change only the hours in the open form and save → name is still "Jay Fai 2", `rating_synced_at` unchanged.
  - Re-pick a different place on the edit page (search another fake result, pick, save) → the old rating, hours and phone are gone, `google_snapshot` is the new place's, `google_synced_at` null.
  - `curl -H "Authorization: Bearer $PAT" localhost:3210/api/v1/trips/<id>` → places carry `googleStatus` and no `googleSnapshot` / `*SyncedAt`.
  - Open mode (`MAPS_PROVIDER` unset): the purge curl still works.
- [ ] **Step 14:** Commit `feat(places): 30-day TTL and daily purge for Google rating, reviews and hours [TP-XXXX]`.

### Task 6: Docs and env

**Files:** `app/.env.example`, `docs/ops/maps-cost-guardrails.md`, `ARCHITECTURE.md`, `AGENTS-INDEX.md`, `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `.gitignore`, `docs/superpowers/plans/2026-10-20-google-maps-links.md`, `docs/superpowers/plans/2026-09-17-mcp-server-byo-agent.md`, `docs/ops/google-maps-setup.md`

- [ ] **`.env.example`:** add a "Maps provider" block with:
  - `MAPS_PROVIDER="open"`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`, the three caps (with their defaults) and `GOOGLE_PLACES_FAKE` (works under `pnpm dev` only; ignored when `NODE_ENV=production`, including `pnpm start` and Vercel Preview)
  - a one-line comment on each, plus a link to `docs/ops/google-maps-setup.md`
  - a note that the browser key and Map ID arrive in Stage B
- [ ] **`maps-cost-guardrails.md`:**
  - Rewrite the opening for both modes.
  - Add Google rows to the Services table.
  - Add a "Guardrails in code" section covering the breaker, the three budgets (details denial stops autocomplete until the window resets), `no-store` for Places, the masks and the bias.
  - State plainly that the budgets **fail open** when the DB is down, so the console quota is the hard stop.
  - Add an "Expiring Google data" paragraph: rating, reviews and hours from Google are hidden after 30 days and purged daily by `/api/internal/purge-google-volatile` in both modes; refresh from Google (20/day cron + 5/day button, Enterprise) arrives in Stage C.
- [ ] **`google-maps-setup.md`:**
  - In §7, align the suggested console quotas with the code defaults. The console cannot split Pro from Enterprise, so set details/day to **135** (30 full + 80 basic + 20 Stage C cron refresh + 5 Stage C manual button) and autocomplete/day to 300. Until Stage C ships, the in-app caps (110) bind first. (§7 already says 135 since the 2026-10-23 C1 review.)
  - Replace the stale `GOOGLE_PLACES_DAILY_CAP` mention with the three cap names.
  - Check that the 2026-10-23 fixes are still in place: the quotas table (135 / 300), the §9.2 "set `MAPS_PROVIDER=google` only after Stage B" note, the Essentials mask in the §10.2 curl, and the Stage A/B wording.
- [ ] **Spec `2026-10-22-maps-multi-provider.md`:** change `GOOGLE_PLACES_DAILY_CAP` to the three cap names in the §5 note and in P2.
- [ ] **`ARCHITECTURE.md` and `AGENTS-INDEX.md`:** add `lib/maps/config.ts`, `lib/places/google.ts`, `pick.ts`, `session.ts`, `google-sync.ts`, `services/google-sync-service.ts` and the purge route. In `ARCHITECTURE.md`, the `CRON_SECRET` row now covers both crons, and the cron paragraph (~line 92) lists `/api/internal/purge-google-volatile`.
- [ ] **`API.md` and `agent-skill/travel-planner-api/SKILL.md`:** document the place field `googleStatus` (`OPERATIONAL` / `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY` / `NOT_FOUND` / `INVALID` / null; read-only, set from Google), that Google-sourced `rating`/`reviews`/`hours` read as `null` after 30 days, and that PATCH is full-replace (omitting `placeIdExternal` clears it).
- [ ] **`2026-09-17-mcp-server-byo-agent.md` (cross-reference):** its `add_place` tool returns a raw `place` row from inside `runIdempotent`; it must return `apiPlaceView(row, new Date())` inside the callback, like the v1 POST route (Task 5b Step 8), so neither the first response nor a replay leaks `googleSnapshot` / `*SyncedAt`. A one-line note under its Task (place tools) code block was added 2026-10-23 (set 3 r2); re-check it is still there and still accurate.
- [ ] **`.gitignore`:** commit the pending `.env` line.
- [ ] **`2026-10-20-google-maps-links.md` Global Constraints** (also note: a bare `ChIJ` id from a link has no session, so `basic` returns `name:''` and the link's own name must be kept, while `full` would bill per request at Enterprise): replace "No Google APIs and no scraping" with "Must work in `MAPS_PROVIDER=open`; in google mode a `ChIJ` id from a link may go through `getPlaceDetail`; no scraping. Execute after stage A."
- [ ] Run `pnpm build 2>&1 | tail -3` → success.
- [ ] Commit `docs(maps): MAPS_PROVIDER env and Google guardrails [TP-XXXX]`, then open a PR against `main`.

---

## Stage B (blocked on keys — not executed by this plan)

1. **Live fixtures:** run the curls in `google-maps-setup.md` §10, replace the hand-written fixtures with live captures, and fix any parser drift.
2. **Google renderer:**
   - `MapsConfigProvider` in the root layout, carrying `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID`
   - Google variants of `real-map-canvas` and `pin-picker-map`, restored from `f093d91^`
   - selector wrappers at the 4 `dynamic(import(...))` sites
   - MapLibre fallback on `gm_authFailure`
3. **Go live:**
   - Set `MAPS_PROVIDER=google` in Production; Preview stays `open`.
   - Check the map, the 5 pickers and the OG image.
   - Watch the `gplaces:*` counts against the console metrics for a week.
4. **Follow-up:** trip-aware location bias.

## Stage C (after B)

Refresh from Google (daily cron + "Update from Google" button), merge rules, closed-status badge: [2026-10-23-maps-google-resync-stage-c.md](2026-10-23-maps-google-resync-stage-c.md).

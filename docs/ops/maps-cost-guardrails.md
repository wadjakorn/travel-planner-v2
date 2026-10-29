# Maps and place search — quota and cost guardrails

The app has two modes, chosen by `MAPS_PROVIDER` (see
[google-maps-setup.md](google-maps-setup.md)):

- **`open`** (default; also for unset or unknown values). No Google Maps
  Platform calls and no billable console. The only metered service is
  Geoapify's free plan.
- **`google`**. Google Places (New) is tried first for search and details, with
  Geoapify then Photon as fallback, and the OG map uses signed Google Static
  Maps. This mode is billable, so the guardrails below matter. The map is
  Google too (Maps JavaScript API), because Google ToS 14.2 forbids Places
  content on a non-Google map. So `google` needs **all four** Google vars
  (`GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_URL_SIGNING_SECRET`,
  `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID`) or runs `open` with one
  warning, and Vercel Preview is always `open`. With `GOOGLE_PLACES_FAKE=1`
  (dev only) the server key and signing secret are not needed, but the
  browser key and Map ID still are.

## Services

| Service | Used for | Key | Limit |
|---|---|---|---|
| Geoapify | Place autocomplete, place details (`/api/places/*`), OG static map (`lib/static-map.ts`) | `GEOAPIFY_API_KEY` (server-only) | Free plan: **3,000 credits/day**, no card |
| Photon (komoot) | Fallback search when Geoapify is missing, errors, or returns 429 | none | Fair use, no SLA |
| Google Places API (New) | `google` mode: autocomplete + place details (`lib/places/google.ts`) | `GOOGLE_MAPS_API_KEY` (server-only) | Free tiers: Details Enterprise 1,000/month, Pro 5,000/month, Essentials 10,000/month, Autocomplete 10,000/month. In-app caps 30 + 80 details/day, 100 map-POI details/day (Pro, TP-0077), 300 autocomplete/day, plus the refresh caps (Details Enterprise, no session token): resync cron 20/day + "Update from Google" button 5/day; console quota 135 / 300 per day (135 = 30 + 80 + 20 + 5). Autocomplete sends `origin` (the day's last stop, 3 decimals) to get `distanceMeters`: a request field, no extra call or SKU (Autocomplete Requests / Session Usage either way; the call sends no field mask, so a future mask must keep `suggestions.placePrediction.distanceMeters`) |
| Google Places API (New) Text Search | `GET /api/v1/places/search` (server-side search by name, `lib/places/text-search.ts`) | **`GOOGLE_PLACES_SERVER_KEY`** (server-only; separate from `GOOGLE_MAPS_API_KEY`) | **Pro tier** (no Essentials tier for Text Search). In-app per-user cap **200/day** (`places:search:${userId}`). Minimal field mask only — no Atmosphere/Enterprise fields |
| Google Maps Static API | `google` mode: OG map (`lib/static-map.ts`), signed | `GOOGLE_MAPS_API_KEY` + `GOOGLE_MAPS_URL_SIGNING_SECRET` | Console quota 200 requests/day, unsigned requests 0 |
| Google Maps JavaScript API | `google` mode: trip map + pin picker (`real-map-canvas-google.tsx`, `pin-picker-map-google.tsx`) | `GOOGLE_MAPS_BROWSER_KEY` (browser, referrer-locked) + `GOOGLE_MAPS_MAP_ID` | Dynamic Maps 10,000 loads/month free; console quota 300 map loads/day |
| OpenFreeMap | Basemap tiles/style for every MapLibre map | none | **No SLA** |

## Credit cost

Roughly **1 credit per Geoapify request** (autocomplete, place details and
static map each count as a request). Confirm the current per-endpoint rate on
the Geoapify pricing page before changing limits. One search session is
therefore several credits (one per debounced autocomplete call plus one details
call on pick), which is why caching and debouncing matter.

## Guardrails in code

- Geoapify and Photon responses use the Next data cache for **30 days**
  (`revalidate`), so repeat queries cost no credits.
- Autocomplete is debounced client-side and stale responses are discarded
  (`components/use-place-search.ts`).
- `/api/places/*` requires a session (401 otherwise), so an anonymous
  scraper cannot drain the daily credits. Each user is limited to 120 requests
  per 10 minutes (`PLACES_RATE_LIMIT`, `lib/places/rate-limit.ts`).
- On **HTTP 429** from Geoapify the server falls back to Photon automatically;
  users keep getting results, with less detail.
- Google Static Maps has no in-app cap: the console quota (200/day) and the OG
  ISR cache bound it.
- The OG image is cached per trip (`revalidate = 86400`), so volume follows the
  number of public trips shared, not page views.

## Guardrails in code (google mode)

- **Breaker.** HTTP 403, 429 or any non-HTTP rejection (network error, timeout)
  from Google autocomplete or details skips Google for **10 minutes**, per
  instance, in memory. Timeouts: autocomplete 1.5 s, details 3 s. Search then
  returns Geoapify/Photon results, so a `BILLING_DISABLED` 403 costs one
  round-trip per warm instance per 10 minutes.
- **Three daily budgets**, global, fixed 1-day windows, via `consumeRateLimitKey`:
  `GOOGLE_PLACES_DETAILS_FULL_DAILY_CAP` (30, Enterprise),
  `GOOGLE_PLACES_DETAILS_BASIC_DAILY_CAP` (80, Essentials) and
  `GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP` (300). The autocomplete cap is the
  binding limit on billed autocomplete (about 9.3k/month, under the 10k free tier).
- **Trip-map preview budgets** (TP-0062). Clicking a search result previews it on
  the map. Google suggestions need one details call for coordinates:
  `gplaces:details:preview` (`GOOGLE_PLACES_DETAILS_PREVIEW_DAILY_CAP`, 150), mask
  `basic` + `photos` (still Essentials; `photos` is an IDs-Only field). It is sent
  **without** the session token so the add's Enterprise call still ends the
  session (Essentials-ended sessions bill autocomplete per request). The card
  image is one Place Photo request via `/api/places/photo`
  (`gplaces:photo`, `GOOGLE_PLACES_PHOTO_DAILY_CAP`, 100; the 1k/month free tier is
  ≈33/day, so a full cap costs up to ≈$14/month at $7/1k).
  Exhausting either bucket only hides the preview or its image; it never sets the
  Google-off latch.
- **Map POI tap → add** (TP-0077). Editors tapping a Google POI on the trip map
  get our preview card instead of Google's info window. The POI has no name of
  its own, so the details call uses the `poi` mask
  `id,displayName,formattedAddress,location,types,photos` = **Place Details Pro**
  ($17/1k, 5,000/month free), no session token. Bucket `gplaces:details:poi`
  (`GOOGLE_PLACES_DETAILS_POI_DAILY_CAP`, 100; ≈3,000/month, inside the free
  tier). The browser keeps place id → result in memory for the page session, so
  re-tapping the same POI is not billed again. A denied budget returns `null`
  (error toast) and never sets the Google-off latch. The image shares
  `gplaces:photo`. **Adding bills a second call:** "Add" resolves `full` details
  (Enterprise) exactly like a picker add, consuming the shared
  `gplaces:details:full` cap (30/day) — which **does** latch Google off when
  spent. Kill switch: `MAPS_POI_ADD=off` (or `0`/`false`) stops the
  interception (Google's native info window shows, no Places call). Viewers
  always get the native info window.
- **Pin-card photos** (TP-0064). Clicking an added Google place's pin shows its
  photo. Photo names **must not be stored** ("You cannot cache a photo name";
  they also expire), so the card asks `/api/places/photo-ref?id=` for a fresh one:
  details mask `id,photos` = **Place Details Essentials (IDs Only)**, an unbilled
  SKU, no session token, response `no-store`, kept in browser memory for the page
  session only. Bucket `gplaces:details:photo`
  (`GOOGLE_PLACES_PHOTO_REF_DAILY_CAP`, 500) is a safety net; the image shares
  `gplaces:photo`. Hover never loads an image. Only key/quota errors (403/429)
  from either call open the breaker; timeouts just hide the photo.
- **Photo routes never cache** (both cards). `/api/places/photo?name=` returns
  JSON `{ uri }` with `no-store` (no HTTP-cached redirect holding the photo
  name); the browser keeps name → URL in memory for the page session, so a
  re-opened card is not billed again. 503 = unavailable now (client retries
  next open); `/api/places/photo-ref` 200 `{ photo: null }` = no photo (definite).
  Cards show the author attribution plus "Google Maps" (the map may be MapLibre).
- **Refresh budgets.** Two more fixed 1-day buckets, `gplaces:refresh` (cron,
  `GOOGLE_PLACES_REFRESH_DAILY_CAP`, 20) and `gplaces:refresh:manual` (button,
  `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP`, 5), each consumed once per Google
  call. The button also keeps the per-user `places:${userId}` limit. The two
  buckets are separate, so the cron cannot starve the button. Both fail open
  and are skipped in fake mode.
- **A cron run stops on its own first 403/429/timeout** (and on a denied
  budget). Breaker state is module state in `lib/places/search.ts`, shared
  within one server instance between search and refresh, but not across
  instances. A transient failure writes nothing and the row is retried the
  next day.
- **A cron run also stops after 3 consecutive INVALID outcomes**
  (`stopped: 'invalid_streak'`). A broken field mask or language would
  otherwise mark every good place INVALID in one night. Any non-INVALID row
  resets the streak.
- **The cron bucket is dated.** Its key is `gplaces:refresh:YYYY-MM-DD` (UTC)
  so a cron that fires earlier than yesterday's does not meet a still-full
  sliding window; expired rows are swept by `prune-rate-limit`.
- **A denied details budget stops autocomplete too** until the window resets
  (`budgetExhaustedUntil`), at the cost of one failed pick per warm instance
  per day; search then falls back to Geoapify/Photon.
- **Budgets fail open.** If the rate-limit DB is down or throws, the call is
  allowed. The **Google console quota is therefore the hard stop** (setup doc
  section 7), not the in-app caps.
- **`no-store` for Places.** Every Places fetch uses `cache: 'no-store'`
  (Google ToS). Only Geoapify/Photon use the data cache. The Static Maps fetch
  uses `revalidate: 86400` so the OG route keeps its ISR.
- **Fixed field masks.** The server owns them. `basic` is
  `id,formattedAddress,location,types` (Essentials only: any Pro or Enterprise
  field in the terminating call bills it as Enterprise + Atmosphere). `full`
  adds name, phone, website, hours, rating and review count and is used only by
  the day "add place" picker.
- **Location bias.** Autocomplete sends a fixed 50 km circle around
  13.75, 100.5 (Bangkok), the same point Photon uses.

## Guardrails in code (google map)

- **Load model.** A billed load is one `google.maps.Map` creation. The trip map
  uses `reuseMaps`, so remounts (React StrictMode in dev) reuse the cached
  instance: about one load per page session per colour scheme. An empty day
  keeps the map mounted, framed on a fallback (previous day / stay / whole
  trip); that adds one load only for a session that opens the itinerary on an
  empty day and never visits a located one. It mounts only when its section is visible
  (`use-trip-map-visible.ts`), so a phone pays nothing until the full map is
  opened. Each pin-picker open is one load (no `reuseMaps`), and a theme
  switch is one load.
- **Fallback.** `window.gm_authFailure` (bad or blocked browser key), an
  `APIProvider` loader error, or a Google map render error calls
  `markDegraded(reason)` (`auth` / `load_error` / `render_error`) in
  `maps-config-provider.tsx`: both map seams render MapLibre for the rest of
  the page session (until a full reload), the trip map shows a dismissible
  "Backup map · Google unavailable" chip, and the console gets one
  `[maps] Google Maps unavailable (<reason>); using the backup map` warning
  (the first reason only). In open mode `markDegraded` is a no-op. A wrong or raster Map ID does **not** trigger
  `gm_authFailure`: the map draws but Advanced Markers do not, so check it by
  hand.
- **No `NEXT_PUBLIC_`.** The server reads the browser key and Map ID at
  runtime and passes them via `MapsConfigProvider` (`toClientMapsConfig`
  returns only `renderer`, `browserKey`, `mapId`, `poiAdd`).

## Server-side place search (`/api/v1/places/search`)

TP-0038 adds `GET /api/v1/places/search?q=…&near=lat,lng&radius=m` for agents
(PAT auth), backed by Google **Places API (New) Text Search**
(`lib/places/text-search.ts`).

- **Own key.** Uses `GOOGLE_PLACES_SERVER_KEY`, a server-only key *separate*
  from `GOOGLE_MAPS_API_KEY` (which is restricted and used by the maps /
  autocomplete / static-map paths). It is independent of `MAPS_PROVIDER`:
  the endpoint works even in `open` mode as long as the key is set. Unset →
  the endpoint returns **503 `unavailable`** (it never crashes); an upstream
  Google failure returns **502 `bad_gateway`**.
- **Minimal field mask.** `places.id,places.displayName,places.location,places.formattedAddress,places.types`
  only — **Pro tier**. No Atmosphere/Enterprise fields (rating, reviews,
  opening hours, photos): any of them in the terminating call jumps the SKU
  tier and bills more. `near`+`radius` become a `locationBias` circle (radius
  clamped to 50 km); results capped at 10.
- **Pragmatic v1 quota.** A per-user fixed-window cap via `consumeRateLimitKey`:
  `places:search:${userId}`, **200/day**. Over the cap → **429 `rate_limited`**
  with `Retry-After`. Its own bucket, so it does **not** double-count against
  the per-token API limiter or the import geocode limiter (`geocode:${userId}`).
  Fails open if the limiter DB is down, so the Google console quota is the hard
  stop. The full per-user Google *budget* plumbing stays deferred (see below).
- **No caching.** The fetch is `cache: 'no-store'` (Google ToS); no lat/lng is
  persisted beyond what the existing import/save paths already permit.

## Expiring Google data

Rating, review count and opening hours that came from Google are hidden after
**30 days** (`visibleVolatile` on every read path, including `/api/v1`) and
purged daily by `/api/internal/purge-google-volatile` (`0 20 * * *` UTC,
`Bearer $CRON_SECRET`). This applies in both modes, since saved places outlive
a flip back to `open`.

Google mode also refreshes saved places: `/api/internal/google-resync`
(`0 19 * * *` UTC, `Bearer $CRON_SECRET`) fetches up to 20 places per day
(Place Details Enterprise, `GOOGLE_REFRESH_MASK`, no session token) for trips
that have not ended, soonest trip first, skipping places synced in the last 25
days. The "Update from Google" button on the edit-place page spends a separate
5/day budget. User edits are never overwritten. The cron returns
`stopped:'disabled'` when `MAPS_PROVIDER` is not `google`.

## Watching usage

Check the dashboard at **myprojects.geoapify.com** (per-day credit usage).
If daily use regularly nears 3,000, raise the cache TTL first, then consider a
paid plan. Keep the key server-only; never prefix it `NEXT_PUBLIC_`.

## OpenFreeMap outage

OpenFreeMap has no SLA. If tiles stop loading, change the style URL in
`app/src/lib/map-style.ts` to another OpenMapTiles-compatible style (or a
self-hosted one). No other code change is needed.

## Behaviour changes versus Google

- Hotel pickers **rank lodging first** instead of filtering to lodging only,
  because Geoapify autocomplete cannot filter by category.
- Newly added places have **no rating or review count**.
- `placeIdExternal` is provider-prefixed: a bare id is a legacy Google id,
  otherwise `geoapify:<id>` or `osm:<N|W|R><id>`. "Open in Google Maps" for
  legacy rows still uses `query_place_id`.
- The trip map frames each day with `fitBounds`.

## Deferred

- **Per-user share of the global Google budgets.** Not built: the app serves
  one user or a small invited group, and the failure is graceful (one user can
  exhaust a daily bucket, Google stays off until reset, search falls back to
  Geoapify/Photon at no cost). The fix needs `userId` threaded into
  `searchPlaces`/`getPlaceDetail` plus a second limiter round-trip per
  keystroke. Revisit the first time `Google budget exhausted` appears in
  production logs, or once there is more than one regular non-owner user.
  `/api/v1/places/search` (TP-0038) does **not** wait for this: it ships its
  own simple per-user `places:search:${userId}` 200/day cap and otherwise
  relies on the existing global caps/guardrails.
- **In-app cap on Google Static Maps.** Not added: volume is bounded by the OG
  route's 24 h ISR per trip, the fetch-level `revalidate: 86400`, the console
  quota (200/day) and unsigned requests set to 0. A cap would put a DB write
  in the OG route for a SKU with 10,000 free per month. Revisit if the console
  shows more than 50 Static Maps requests/day.

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
| Google Places API (New) | `google` mode: autocomplete + place details (`lib/places/google.ts`) | `GOOGLE_MAPS_API_KEY` (server-only) | Free tiers: Details Enterprise 1,000/month, Essentials 10,000/month, Autocomplete 10,000/month. In-app caps 30 + 80 details/day, 300 autocomplete/day, plus the refresh caps (Details Enterprise, no session token): resync cron 20/day + "Update from Google" button 5/day; console quota 135 / 300 per day (135 = 30 + 80 + 20 + 5) |
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
- **Refresh budgets.** Two more fixed 1-day buckets, `gplaces:refresh` (cron,
  `GOOGLE_PLACES_REFRESH_DAILY_CAP`, 20) and `gplaces:refresh:manual` (button,
  `GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP`, 5), each consumed once per Google
  call. The button also keeps the per-user `places:${userId}` limit. The two
  buckets are separate, so the cron cannot starve the button. Both fail open
  and are skipped in fake mode.
- **A cron run stops on its own first 403/429/timeout** (and on a denied
  budget). Breaker state is per instance and in memory, so it is not shared
  with other routes or invocations. A transient failure writes nothing and the
  row is retried the next day.
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
  uses `reuseMaps`, so remounts (a day with no pins, React StrictMode in dev)
  reuse the cached instance: about one load per page session per colour
  scheme. It mounts only when its section is visible
  (`use-trip-map-visible.ts`), so a phone pays nothing until the full map is
  opened. Each pin-picker open is one load (no `reuseMaps`), and a theme
  switch is one load.
- **Fallback.** `window.gm_authFailure` (bad or blocked browser key) or an
  `APIProvider` loader error calls `markDegraded()` in
  `maps-config-provider.tsx`: both map seams render MapLibre for the rest of
  the page session (until a full reload), with one `[maps] Google Maps failed
  to load` console warning. A wrong or raster Map ID does **not** trigger
  `gm_authFailure`: the map draws but Advanced Markers do not, so check it by
  hand.
- **No `NEXT_PUBLIC_`.** The server reads the browser key and Map ID at
  runtime and passes them via `MapsConfigProvider` (`toClientMapsConfig`
  returns only `renderer`, `browserKey`, `mapId`).

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
- **In-app cap on Google Static Maps.** Not added: volume is bounded by the OG
  route's 24 h ISR per trip, the fetch-level `revalidate: 86400`, the console
  quota (200/day) and unsigned requests set to 0. A cap would put a DB write
  in the OG route for a SKU with 10,000 free per month. Revisit if the console
  shows more than 50 Static Maps requests/day.

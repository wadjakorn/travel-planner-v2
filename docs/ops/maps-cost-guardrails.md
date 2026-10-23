# Maps and place search — quota and cost guardrails

The app has two modes, chosen by `MAPS_PROVIDER` (see
[google-maps-setup.md](google-maps-setup.md)):

- **`open`** (default; also for unset or unknown values). No Google Maps
  Platform calls and no billable console. The only metered service is
  Geoapify's free plan.
- **`google`**. Google Places (New) is tried first for search and details, with
  Geoapify then Photon as fallback, and the OG map uses signed Google Static
  Maps. This mode is billable, so the guardrails below matter. Until Stage B
  (Google map renderer) ships, `readMapsConfig` forces `open` when
  `NODE_ENV=production` (Google ToS 14.2: no Places content on a non-Google map).

## Services

| Service | Used for | Key | Limit |
|---|---|---|---|
| Geoapify | Place autocomplete, place details (`/api/places/*`), OG static map (`lib/static-map.ts`) | `GEOAPIFY_API_KEY` (server-only) | Free plan: **3,000 credits/day**, no card |
| Photon (komoot) | Fallback search when Geoapify is missing, errors, or returns 429 | none | Fair use, no SLA |
| Google Places API (New) | `google` mode: autocomplete + place details (`lib/places/google.ts`) | `GOOGLE_MAPS_API_KEY` (server-only) | Free tiers: Details Enterprise 1,000/month, Essentials 10,000/month, Autocomplete 10,000/month. In-app caps 30 + 80 details/day and 300 autocomplete/day; console quota 135 / 300 per day |
| Google Maps Static API | `google` mode: OG map (`lib/static-map.ts`), signed | `GOOGLE_MAPS_API_KEY` + `GOOGLE_MAPS_URL_SIGNING_SECRET` | Console quota 200 requests/day, unsigned requests 0 |
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
  scraper cannot drain the daily credits. There is no per-user rate limit yet.
- On **HTTP 429** from Geoapify the server falls back to Photon automatically;
  users keep getting results, with less detail.
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

## Expiring Google data

Rating, review count and opening hours that came from Google are hidden after
**30 days** (`visibleVolatile` on every read path, including `/api/v1`) and
purged daily by `/api/internal/purge-google-volatile` (`0 20 * * *` UTC,
`Bearer $CRON_SECRET`). This applies in both modes, since saved places outlive
a flip back to `open`. Refreshing from Google (a 20/day cron plus a 5/day
button, Place Details Enterprise) arrives in Stage C.

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
